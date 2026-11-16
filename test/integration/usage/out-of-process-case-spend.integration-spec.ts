import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { UsageImportListeners } from '../../../src/modules/usage/public/usage.extension-points';
import type { ApiAccount } from '../../support/api-accounts';
import { InvoiceHarness } from '../../support/invoice-harness';

const h = new InvoiceHarness();

interface Wire {
  id: string;
  state: string;
  outcome: string | null;
  amount: { amount: string } | null;
  documentIds: string[];
  companyAsset: boolean | null;
  outOfProcessCaseId?: string | null;
}

/**
 * The money of a case on a company asset and the revocation of its account are two acts on one case (`US-13-05` AC-19, AC-20, AC-25, FX3-02): Finance records
 * what was already spent while the case stays open, and the IT Admin can still close it as revoked, with the money as it was recorded. On real PostgreSQL.
 */
describe('the money and the revocation of a case on a company asset over PostgreSQL (integration; FX3-02)', () => {
  let applicationId: string;
  let numbers = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    const plan = await h.planOf(await h.subscription(20, 'K2'));
    applicationId = (
      await h.ctx.sql.query<{ application_id: string }>(`SELECT application_id FROM plans WHERE id = $1`, [plan])
    ).rows[0].application_id;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const call = (method: 'get' | 'post', path: string, account: ApiAccount) =>
    request(h.server())[method](path).set(h.as(account));
  const code = (response: request.Response) => (response.body as { error: { code: string } }).error.code;
  /** A finished proof the person who closes uploaded (a payment, or the cancellation of the renewal). */
  const proof = async (account: ApiAccount): Promise<string> => {
    const id = randomUUID();
    numbers += 1;
    await h.ctx.sql.query(
      `INSERT INTO document_attachments (id, organization_id, purpose, status, file_name, content_type, size_bytes, object_key, final_object_key,
         uploaded_by_app_user_id)
       VALUES ($1, $2, 'PURCHASE_DOCUMENT', 'PENDING_ATTACH', 'chung-tu.pdf', 'application/pdf', 1000, $3, $4, $5)`,
      [
        id,
        h.seed.organizationId,
        `documents/fx302/${numbers}-${id}`,
        `documents/fx302/kept-${numbers}-${id}`,
        account.appUserId,
      ],
    );

    return id;
  };
  /** An open case on a company asset: an identifier nobody owns that the IT Admin decided is outside the process. */
  const companyAssetCase = async (): Promise<string> => {
    numbers += 1;
    const importId = randomUUID();
    const raw = `miro${numbers}@congty.vn`;
    await h.ctx.sql.query(
      `INSERT INTO usage_unmatched_identities (organization_id, application_id, source_id, identifier_type, normalized_identifier, raw_identifier,
         reason, status, candidate_employee_ids, first_import_id, last_import_id)
       VALUES ($1, $2, $3, 'EMAIL', lower($4), $4, 'NOT_FOUND', 'OPEN', '{}', $5, $5)`,
      [h.seed.organizationId, applicationId, randomUUID(), raw, importId],
    );
    await h.ctx.app.get(TransactionRunner).run((tx) =>
      h.ctx.app.get(UsageImportListeners, { strict: false }).emit(tx, {
        moment: 'CONFIRMED',
        importId,
        sourceId: randomUUID(),
        applicationId,
        coverageTo: `${h.year}-10-31`,
      }),
    );
    const page = h.dataOf<{ items: Array<{ id: string; identity: string }> }>(
      await call(
        'get',
        `/api/v1/vendor-account-discrepancies?pageSize=100&state=OPEN&source=UNMATCHED_IDENTITY`,
        h.it1,
      ).expect(200),
    );
    const found = page.items.find((item) => item.identity === raw) as { id: string };
    const decided = h.dataOf<Wire>(
      await call('post', `/api/v1/vendor-account-discrepancies/${found.id}/decision`, h.it1)
        .send({ decision: 'OUT_OF_PROCESS', companyAsset: true, note: 'Tài khoản công ty' })
        .expect(201),
    );

    return decided.outOfProcessCaseId as string;
  };
  const closure = (caseId: string, account: ApiAccount) =>
    call('post', `/api/v1/out-of-process-cases/${caseId}/closure`, account);
  const invoicesOf = async (caseId: string) =>
    (
      await h.ctx.sql.query<{ net_minor: string }>(
        `SELECT net_minor::text FROM invoices WHERE out_of_process_case_id = $1`,
        [caseId],
      )
    ).rows;

  it('Finance records 750.000 on the open case (it stays open), the IT Admin closes it as revoked afterwards, and the expense is as it was recorded', async () => {
    const caseId = await companyAssetCase();

    const spent = h.dataOf<Wire>(
      await closure(caseId, h.finance)
        .send({
          outcome: 'RECORD_SPENT',
          note: 'Đã trả bằng thẻ công ty',
          documentIds: [await proof(h.finance)],
          amount: { amount: '750000' },
          costCenterId: 'UNALLOCATED',
        })
        .expect(201),
    );
    expect(spent).toMatchObject({ state: 'OPEN', outcome: null, amount: { amount: '750000' }, companyAsset: true });
    expect(await invoicesOf(caseId)).toEqual([{ net_minor: '750000' }]);

    const revoked = h.dataOf<Wire>(
      await closure(caseId, h.it1)
        .send({
          outcome: 'REVOKED',
          note: 'Đã hủy gia hạn',
          renewalCancelled: true,
          documentIds: [await proof(h.it1)],
        })
        .expect(201),
    );

    expect(revoked).toMatchObject({ state: 'CLOSED', outcome: 'REVOKED', amount: { amount: '750000' } });
    expect(revoked.documentIds).toHaveLength(2);
    expect(await invoicesOf(caseId)).toEqual([{ net_minor: '750000' }]);
  });

  it('a case with money is no false alarm and its money is not recorded twice; it still closes as a report, and then it records nothing more', async () => {
    const caseId = await companyAssetCase();
    const money = async () => ({
      outcome: 'RECORD_SPENT',
      note: 'Đã trả',
      documentIds: [await proof(h.finance)],
      amount: { amount: '750000' },
      costCenterId: 'UNALLOCATED',
    });
    await closure(caseId, h.finance)
      .send(await money())
      .expect(201);

    expect(code(await closure(caseId, h.it1).send({ outcome: 'FALSE_ALARM', note: 'Nhầm' }).expect(422))).toBe(
      'OUT_OF_PROCESS_CASE.SPEND_RECORDED',
    );
    expect(
      code(
        await closure(caseId, h.finance)
          .send(await money())
          .expect(409),
      ),
    ).toBe('OUT_OF_PROCESS_CASE.SPEND_ALREADY_RECORDED');
    expect(await invoicesOf(caseId)).toHaveLength(1);

    await closure(caseId, h.it1).send({ outcome: 'REPORT_ONLY', note: 'Chỉ ghi nhận' }).expect(201);
    expect(
      code(
        await closure(caseId, h.finance)
          .send(await money())
          .expect(409),
      ),
    ).toBe('OUT_OF_PROCESS_CASE.ALREADY_CLOSED');
  });
});
