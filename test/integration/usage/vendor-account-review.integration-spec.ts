import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { UsageImportListeners } from '../../../src/modules/usage/public/usage.extension-points';
import { VendorAccountEvidenceRetentionService } from '../../../src/modules/usage/vendor-account-review/vendor-account-evidence-retention.service';
import { VendorAccountIntakeService } from '../../../src/modules/usage/vendor-account-review/vendor-account-intake.service';
import type { ApiAccount } from '../../support/api-accounts';
import { InvoiceHarness } from '../../support/invoice-harness';
import { PgRelay } from '../../support/pg-relay';
import { dataStatements, QueryCounter } from '../../support/query-count';

const h = new InvoiceHarness();

interface Difference {
  id: string;
  source: string;
  state: string;
  application: { id: string; name: string } | null;
  vendorId: string | null;
  employeeId: string | null;
  identity: string | null;
  internalValue: string;
  vendorValue: string;
  evidenceOn: string;
  decision: string | null;
  decisionNote: string | null;
  outOfProcessCaseId: string | null;
}
interface CaseWire {
  id: string;
  state: string;
  discrepancyId: string;
  vendorId: string | null;
  outcome: string | null;
  note: string | null;
  amount: { amount: string; currency: string } | null;
  costCenterId: string | null;
  documentIds: string[];
}
interface Page<T> {
  items: T[];
  pagination: { totalItems: number };
}

/**
 * The review of the accounts at the vendors and the cases outside the process (`RC-2`, `QĐ-111y`, R-18, R-45, C-4, T-PI): a difference is made from
 * what was found, the IT Admin decides it once, an `OUT_OF_PROCESS` decision opens a case that is closed once as a false alarm, as a report or as money
 * already spent that has a proof of payment, and the evidence is deleted after 24 months. On real PostgreSQL, through the routes.
 */
describe('the review of the accounts at the vendors over PostgreSQL (integration; RC-2, T-PI)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let itAdmin: ApiAccount;
  let serial = 0;
  let numbers = 0;
  let applicationId: string;
  let vendorId: string;
  let plan: string;

  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
    await h.withApprover();
    itAdmin = h.it1;
    plan = await h.planOf(await h.subscription(20, 'K2'));
    vendorId = (await h.vendorOf(plan)).id;
    applicationId = (
      await h.ctx.sql.query<{ application_id: string }>(`SELECT application_id FROM plans WHERE id = $1`, [plan])
    ).rows[0].application_id;
  }, 240000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  const differences = (method: 'get' | 'post', path: string, account: ApiAccount = itAdmin) =>
    request(h.server())[method](`/api/v1/vendor-account-discrepancies${path}`).set(h.as(account));
  const cases = (method: 'get' | 'post', path: string, account: ApiAccount = h.finance) =>
    request(h.server())[method](`/api/v1/out-of-process-cases${path}`).set(h.as(account));
  const purchases = (method: 'get' | 'post', path: string, account: ApiAccount) =>
    request(h.server())[method](`/api/v1/purchase-invoices${path}`).set(h.as(account));
  const invoiceCases = (id: string, body: object) =>
    request(h.server()).post(`/api/v1/invoice-discrepancies/${id}/closure`).set(h.as(h.finance)).send(body);
  const code = (response: request.Response) => (response.body as { error: { code: string } }).error.code;
  const listed = async (query = '', account: ApiAccount = itAdmin) =>
    h.dataOf<Page<Difference>>(await differences('get', `?pageSize=100${query}`, account).expect(200));

  /** A report of the vendor was confirmed: what the review is made from is read in the transaction of the confirmation, as the confirmation does. */
  const confirmed = (): Promise<void> =>
    h.ctx.app.get(TransactionRunner).run((tx) =>
      h.ctx.app.get(UsageImportListeners, { strict: false }).emit(tx, {
        moment: 'CONFIRMED',
        importId: randomUUID(),
        sourceId: randomUUID(),
        applicationId,
        coverageTo: `${h.year}-10-31`,
      }),
    );
  const noSeat = async (employeeId: string): Promise<string> =>
    (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO usage_no_assignment_findings (organization_id, application_id, employee_id, first_activity_date, last_activity_date, last_import_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'OPEN') RETURNING id`,
        [h.seed.organizationId, applicationId, employeeId, `${h.year}-10-01`, `${h.year}-10-20`, randomUUID()],
      )
    ).rows[0].id;
  const nobodys = async (raw: string): Promise<string> =>
    (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO usage_unmatched_identities (organization_id, application_id, source_id, identifier_type, normalized_identifier, raw_identifier,
           reason, status, candidate_employee_ids, first_import_id, last_import_id)
         VALUES ($1, $2, $3, 'EMAIL', lower($4), $4, 'NOT_FOUND', 'OPEN', '{}', $5, $5) RETURNING id`,
        [h.seed.organizationId, applicationId, randomUUID(), raw, randomUUID()],
      )
    ).rows[0].id;
  const rowsOfCase = async (caseId: string) =>
    (
      await h.ctx.sql.query<{
        id: string;
        net_minor: string;
        cost_center_id: string | null;
        commitment_id: string | null;
        vendor_id: string;
      }>(
        `SELECT id, net_minor::text, cost_center_id, commitment_id, vendor_id FROM invoices WHERE out_of_process_case_id = $1`,
        [caseId],
      )
    ).rows;
  /** A proof of payment the person who closes uploaded: a finished upload of purpose PURCHASE_DOCUMENT. */
  const proof = async (account: ApiAccount): Promise<string> => {
    const id = randomUUID();
    numbers += 1;
    await h.ctx.sql.query(
      `INSERT INTO document_attachments (id, organization_id, purpose, status, file_name, content_type, size_bytes, object_key, final_object_key,
         uploaded_by_app_user_id)
       VALUES ($1, $2, 'PURCHASE_DOCUMENT', 'PENDING_ATTACH', 'sao-ke.pdf', 'application/pdf', 1000, $3, $4, $5)`,
      [
        id,
        h.seed.organizationId,
        `documents/rc2/${numbers}-${id}`,
        `documents/rc2/kept-${numbers}-${id}`,
        account.appUserId,
      ],
    );

    return id;
  };
  /** The open difference of an identifier nobody owns, made as the confirmation of a report makes it. */
  const difference = async (raw: string): Promise<Difference> => {
    await nobodys(raw);
    await confirmed();

    return (await listed('&state=OPEN&source=UNMATCHED_IDENTITY')).items.find(
      (item) => item.identity === raw,
    ) as Difference;
  };
  /** An open case outside the process, from a difference the IT Admin decided is outside the process. */
  const opened = async (raw = `case${++numbers}@gmail.com`): Promise<{ differenceId: string; caseId: string }> => {
    const found = await difference(raw);
    const decided = h.dataOf<Difference>(
      await differences('post', `/${found.id}/decision`)
        .send({ decision: 'OUT_OF_PROCESS', note: 'Đã trả tiền ngoài quy trình' })
        .expect(201),
    );

    return { differenceId: decided.id, caseId: decided.outOfProcessCaseId as string };
  };

  describe('what a difference is made from (RC-2.1)', () => {
    it('makes one for an account with activity and no seat and one for an identifier nobody owns, with both values, and never a second for the same thing seen again', async () => {
      const finding = await noSeat(h.it1.employeeId);
      const identity = await nobodys('someone@gmail.com');

      await confirmed();
      await confirmed();

      const page = await listed(`&applicationId=${applicationId}&state=OPEN`);
      const bySource = (source: string) => page.items.filter((item) => item.source === source);
      expect(bySource('NO_ASSIGNMENT')).toHaveLength(1);
      expect(bySource('NO_ASSIGNMENT')[0]).toMatchObject({
        internalValue: 'No seat on record',
        vendorValue: `Active from ${h.year}-10-01 to ${h.year}-10-20`,
        employeeId: h.it1.employeeId,
        identity: null,
        evidenceOn: `${h.year}-10-20`,
        vendorId,
        application: { id: applicationId },
        state: 'OPEN',
        decision: null,
      });
      expect(bySource('UNMATCHED_IDENTITY')).toHaveLength(1);
      expect(bySource('UNMATCHED_IDENTITY')[0]).toMatchObject({
        internalValue: 'No employee has this identifier',
        vendorValue: 'Account someone@gmail.com',
        identity: 'someone@gmail.com',
        employeeId: null,
      });
      expect(
        (
          await h.ctx.sql.query(`SELECT 1 FROM vendor_account_discrepancies WHERE source_ref = ANY($1::text[])`, [
            [finding, identity],
          ])
        ).rowCount,
      ).toBe(2);
    });

    it('makes exactly one for an invoice Finance closes as a suspicion, with what was bought and what the invoice says, and none for one it explains', async () => {
      serial += 1;
      const unit = await h.departmentWithHead(`P-RC2${serial}`);
      await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });
      const pooled = await h.subscription(10, 'K2', unit.department.id);
      await h.ctx.sql.query(
        `UPDATE subscriptions SET original_unit_price_minor = 1500, original_currency = 'USD' WHERE id = $1`,
        [pooled],
      );
      const submit = async (): Promise<string> => {
        numbers += 1;
        const fileId = await proof(h.it1);
        const sent = await purchases('post', '', h.it1).send({
          link: { subscriptionId: pooled },
          vendorInvoiceNumber: `RC2-${numbers}`,
          issuedOn: `${h.year}-11-02`,
          servicePeriodMonth: `${h.year}-11`,
          quantity: 12,
          unitPriceOriginal: { amount: '15', currency: 'USD' },
          netAmount: { amount: '4600000' },
          paymentSource: 'COMPANY_CARD',
          documentIds: [fileId],
        });
        expect(sent.status).toBe(201);
        const id = h.dataOf<{ id: string }>(sent).id;
        await purchases('post', `/${id}/confirmation`, h.finance).expect(201);

        return (
          await h.ctx.sql.query<{ id: string }>(
            `SELECT id FROM invoice_discrepancy_cases WHERE purchase_invoice_id = $1`,
            [id],
          )
        ).rows[0].id;
      };

      const explained = await submit();
      const suspected = await submit();
      await invoiceCases(explained, {
        outcome: 'EXPLAINED',
        reason: 'Mua thêm hợp lệ',
        differenceAmount: { amount: '0' },
      }).expect(201);
      await invoiceCases(suspected, {
        outcome: 'OUT_OF_PROCESS_SUSPECTED',
        reason: 'Có thể có người trả tiền ngoài quy trình',
        differenceAmount: { amount: '700000' },
      }).expect(201);

      const rows = (
        await h.ctx.sql.query<{ id: string; source_ref: string }>(
          `SELECT id, source_ref FROM vendor_account_discrepancies WHERE source = 'INVOICE_DIFFERENCE' AND source_ref = ANY($1::text[])`,
          [[explained, suspected]],
        )
      ).rows;
      expect(rows.map((row) => row.source_ref)).toEqual([suspected]);
      const suspectedDifferenceId = rows[0].id;
      const item = (await listed('&source=INVOICE_DIFFERENCE')).items.find(
        (candidate) => candidate.id === suspectedDifferenceId,
      );
      expect(item).toMatchObject({
        internalValue: '10 at 15.00 USD',
        vendorValue: '12 at 15.00 USD',
        application: null,
        employeeId: null,
        state: 'OPEN',
      });
    });

    it('lists the newest first in the same number of statements whatever the number of differences, and only to the IT Admin', async () => {
      const statements = async () =>
        dataStatements((await counter.run(async () => differences('get', '?pageSize=100').expect(200))).statements)
          .length;
      const before = await statements();
      for (const raw of ['a@gmail.com', 'b@gmail.com', 'c@gmail.com']) await nobodys(raw);
      await confirmed();

      expect(await statements()).toBe(before);
      await differences('get', '', h.finance).expect(403);
      await differences('get', '', h.boss.account).expect(403);
    });
  });

  describe('the decision (RC-2.1)', () => {
    it('is taken once with a note: a false alarm opens nothing, a second decision is refused', async () => {
      const open = await difference('alarm@gmail.com');

      const decided = h.dataOf<Difference>(
        await differences('post', `/${open.id}/decision`)
          .send({ decision: 'FALSE_ALARM', note: 'Tài khoản thử' })
          .expect(201),
      );

      expect(decided).toMatchObject({
        state: 'DECIDED',
        decision: 'FALSE_ALARM',
        decisionNote: 'Tài khoản thử',
        outOfProcessCaseId: null,
      });
      expect(
        code(await differences('post', `/${open.id}/decision`).send({ decision: 'REVOKE', note: 'x' }).expect(409)),
      ).toBe('VENDOR_ACCOUNT_DISCREPANCY.ALREADY_DECIDED');
      expect(
        code(
          await differences('post', `/${randomUUID()}/decision`).send({ decision: 'REVOKE', note: 'x' }).expect(404),
        ),
      ).toBe('VENDOR_ACCOUNT_DISCREPANCY.NOT_FOUND');
      expect(
        (await h.ctx.sql.query(`SELECT 1 FROM out_of_process_cases WHERE discrepancy_id = $1`, [open.id])).rowCount,
      ).toBe(0);
    });

    it('opens one case for OUT_OF_PROCESS, in the same step, and the table refuses to change what was decided', async () => {
      const { differenceId, caseId } = await opened();

      expect(
        (await h.ctx.sql.query(`SELECT 1 FROM out_of_process_cases WHERE discrepancy_id = $1`, [differenceId]))
          .rowCount,
      ).toBe(1);
      const list = h.dataOf<Page<CaseWire>>(await cases('get', '?state=OPEN&pageSize=100').expect(200));
      expect(list.items.find((item) => item.id === caseId)).toMatchObject({
        state: 'OPEN',
        discrepancyId: differenceId,
        vendorId,
        outcome: null,
      });
      await expect(
        h.ctx.sql.query(`UPDATE vendor_account_discrepancies SET decision_note = 'đổi' WHERE id = $1`, [differenceId]),
      ).rejects.toThrow(/never changed/);
    });
  });

  describe('closing a case outside the process (RC-2.2, R-45)', () => {
    it('records money only with a proof of payment: none is 422 and nothing is written; a report carries no money', async () => {
      const { caseId } = await opened();
      const money = {
        outcome: 'RECORD_SPENT',
        note: 'Đã trả',
        amount: { amount: '750000' },
        costCenterId: 'UNALLOCATED',
      };

      expect(code(await cases('post', `/${caseId}/closure`).send(money).expect(422))).toBe(
        'OUT_OF_PROCESS_CASE.DOCUMENT_REQUIRED',
      );
      expect(
        code(
          await cases('post', `/${caseId}/closure`)
            .send({ outcome: 'REPORT_ONLY', note: 'Chỉ báo cáo', documentIds: [await proof(h.finance)] })
            .expect(422),
        ),
      ).toBe('OUT_OF_PROCESS_CASE.RECORD_FIELDS_NOT_ALLOWED');
      expect(
        code(
          await cases('post', `/${caseId}/closure`)
            .send({ ...money, documentIds: [await proof(h.finance)], amount: undefined })
            .expect(422),
        ),
      ).toBe('OUT_OF_PROCESS_CASE.RECORD_FIELDS_MISSING');
      expect(await rowsOfCase(caseId)).toEqual([]);
      expect(
        (
          await h.ctx.sql.query<{ state: string }>(`SELECT state::text FROM out_of_process_cases WHERE id = $1`, [
            caseId,
          ])
        ).rows[0].state,
      ).toBe('OPEN');
    });

    it('writes exactly one expense in dong with no commitment for the Cost Center it was booked to, attaches the proof to the case and closes it once', async () => {
      const { caseId } = await opened();
      serial += 1;
      const unit = await h.departmentWithHead(`P-RC2S${serial}`);
      const fileId = await proof(h.finance);

      const closed = h.dataOf<CaseWire>(
        await cases('post', `/${caseId}/closure`)
          .send({
            outcome: 'RECORD_SPENT',
            note: 'Đã trả bằng thẻ công ty',
            documentIds: [fileId],
            amount: { amount: '750000' },
            costCenterId: unit.department.unitId,
          })
          .expect(201),
      );

      expect(closed).toMatchObject({
        state: 'CLOSED',
        outcome: 'RECORD_SPENT',
        amount: { amount: '750000', currency: 'VND' },
        costCenterId: unit.department.unitId,
        documentIds: [fileId],
      });
      const [invoice] = await rowsOfCase(caseId);
      expect(await rowsOfCase(caseId)).toHaveLength(1);
      expect(invoice).toMatchObject({
        net_minor: '750000',
        cost_center_id: unit.department.unitId,
        commitment_id: null,
        vendor_id: vendorId,
      });
      expect(
        (
          await h.ctx.sql.query(`SELECT status::text, out_of_process_case_id FROM document_attachments WHERE id = $1`, [
            fileId,
          ])
        ).rows,
      ).toEqual([{ status: 'READY', out_of_process_case_id: caseId }]);
      expect(
        code(await cases('post', `/${caseId}/closure`).send({ outcome: 'FALSE_ALARM', note: 'x' }).expect(409)),
      ).toBe('OUT_OF_PROCESS_CASE.ALREADY_CLOSED');
      expect(await rowsOfCase(caseId)).toHaveLength(1);
    });

    it('books it to no Cost Center when none can be told yet, and answers a Cost Center that is not one, an amount that cannot be read, and a file that is not theirs with 422 and keeps nothing', async () => {
      const { caseId } = await opened();
      const send = async (over: Record<string, unknown>, account: ApiAccount = h.finance) =>
        cases('post', `/${caseId}/closure`, account).send({
          outcome: 'RECORD_SPENT',
          note: 'Đã trả',
          documentIds: [await proof(account)],
          amount: { amount: '100000' },
          costCenterId: 'UNALLOCATED',
          ...over,
        });

      expect(code(await send({ costCenterId: randomUUID() }).then((r) => r))).toBe(
        'OUT_OF_PROCESS_CASE.COST_CENTER_NOT_FOUND',
      );
      expect(code(await send({ amount: { amount: 'abc' } }))).toBe('VALIDATION_ERROR');
      expect(code(await send({ amount: { amount: '100.5' } }))).toBe('MONEY_SCALE_EXCEEDED');
      expect(code(await send({ amount: { amount: '-1' } }))).toBe('MONEY_OUT_OF_RANGE');
      expect(code(await send({ amount: { amount: '0' } }))).toBe('MONEY_OUT_OF_RANGE');
      expect(code(await send({ documentIds: [await proof(itAdmin)] }))).toBe('OUT_OF_PROCESS_CASE.DOCUMENT_INVALID');
      expect(await rowsOfCase(caseId)).toEqual([]);

      const done = await send({}, h.finance);
      expect(done.status).toBe(201);
      const [invoice] = await rowsOfCase(caseId);
      expect(invoice).toMatchObject({ net_minor: '100000', cost_center_id: null, commitment_id: null });
    });

    it('refuses money for a difference that has no vendor to book it to, while a report closes it, by the IT Admin as well', async () => {
      const intake = h.ctx.app.get(VendorAccountIntakeService);
      await h.ctx.app.get(TransactionRunner).run((tx) =>
        intake.fromUnlistedTools(tx, {
          organizationId: h.seed.organizationId,
          sightings: [{ tool: 'CODEX', date: `${h.year}-10-03` }],
        }),
      );
      const found = (await listed('&state=OPEN&source=COLLECTOR_UNLISTED')).items.find(
        (item) => item.identity === 'CODEX',
      ) as Difference;
      const caseId = h.dataOf<Difference>(
        await differences('post', `/${found.id}/decision`)
          .send({ decision: 'OUT_OF_PROCESS', note: 'Công cụ lạ' })
          .expect(201),
      ).outOfProcessCaseId as string;

      expect(
        code(
          await cases('post', `/${caseId}/closure`, itAdmin)
            .send({
              outcome: 'RECORD_SPENT',
              note: 'Đã trả',
              documentIds: [await proof(itAdmin)],
              amount: { amount: '5000' },
              costCenterId: 'UNALLOCATED',
            })
            .expect(422),
        ),
      ).toBe('OUT_OF_PROCESS_CASE.NO_VENDOR');
      const reported = await cases('post', `/${caseId}/closure`, itAdmin).send({
        outcome: 'REPORT_ONLY',
        note: 'Không có chứng từ',
      });

      expect(reported.status).toBe(201);
      expect(h.dataOf<CaseWire>(reported)).toMatchObject({
        state: 'CLOSED',
        outcome: 'REPORT_ONLY',
        amount: null,
        documentIds: [],
        vendorId: null,
      });
      await cases('get', '', h.boss.account).expect(403);
    });
  });

  describe('the evidence is deleted after 24 months (RC-2.4, US-14-04 AC-2)', () => {
    it('deletes a difference whose evidence is older than 24 months, open or decided, and keeps what a case recorded; younger evidence stays', async () => {
      const today = new Date();
      const around = (days: number) =>
        new Date(Date.UTC(today.getUTCFullYear() - 2, today.getUTCMonth(), today.getUTCDate() + days))
          .toISOString()
          .slice(0, 10);
      const old = await difference('old@gmail.com');
      const young = await difference('young@gmail.com');
      const decided = await difference('decided-old@gmail.com');
      await h.ctx.sql.query(`UPDATE vendor_account_discrepancies SET evidence_on = $2::date WHERE id = $1`, [
        old.id,
        around(-3),
      ]);
      await h.ctx.sql.query(`UPDATE vendor_account_discrepancies SET evidence_on = $2::date WHERE id = $1`, [
        young.id,
        around(3),
      ]);
      await h.ctx.sql.query(`UPDATE vendor_account_discrepancies SET evidence_on = $2::date WHERE id = $1`, [
        decided.id,
        around(-30),
      ]);
      const caseId = h.dataOf<Difference>(
        await differences('post', `/${decided.id}/decision`)
          .send({ decision: 'OUT_OF_PROCESS', note: 'Ngoài quy trình' })
          .expect(201),
      ).outOfProcessCaseId as string;
      await cases('post', `/${caseId}/closure`).send({ outcome: 'REPORT_ONLY', note: 'Chỉ báo cáo' }).expect(201);

      const done = await h.ctx.app.get(VendorAccountEvidenceRetentionService).sweep(new Date());

      expect(done.deleted).toBeGreaterThanOrEqual(2);
      const remaining = await h.ctx.sql.query<{ id: string }>(
        `SELECT id FROM vendor_account_discrepancies WHERE id = ANY($1::uuid[])`,
        [[old.id, young.id, decided.id]],
      );
      expect(remaining.rows.map((row) => row.id)).toEqual([young.id]);
      expect(
        (await h.ctx.sql.query(`SELECT 1 FROM out_of_process_cases WHERE id = $1 AND state = 'CLOSED'`, [caseId]))
          .rowCount,
      ).toBe(1);
      expect(
        (await h.ctx.sql.query(`SELECT 1 FROM audit_events WHERE action = 'VENDOR_ACCOUNT_EVIDENCE.EXPIRED'`)).rowCount,
      ).toBeGreaterThan(0);
      expect((await h.ctx.app.get(VendorAccountEvidenceRetentionService).sweep(new Date())).deleted).toBe(0);
    });
  });

  describe('a tool the collector sees that is not on the allowlist (RC-2.3, US-13-03 AC-13)', () => {
    it('makes one difference for the tool, moves the day of its evidence when it is seen again, and keeps no person', async () => {
      const intake = h.ctx.app.get(VendorAccountIntakeService);
      const runner = h.ctx.app.get(TransactionRunner);
      const sight = (date: string) =>
        runner.run((tx) =>
          intake.fromUnlistedTools(tx, {
            organizationId: h.seed.organizationId,
            sightings: [{ tool: 'ANTIGRAVITY_CLI', date }],
          }),
        );

      await sight(`${h.year}-10-02`);
      await sight(`${h.year}-10-09`);

      const item = (await listed('&source=COLLECTOR_UNLISTED')).items.filter(
        (candidate) => candidate.identity === 'ANTIGRAVITY_CLI',
      );
      expect(item).toHaveLength(1);
      expect(item[0]).toMatchObject({
        internalValue: 'Not on the allowlist of the collector',
        vendorValue: 'Tool ANTIGRAVITY_CLI was reported',
        employeeId: null,
        application: null,
        evidenceOn: `${h.year}-10-09`,
      });
    });
  });
});
