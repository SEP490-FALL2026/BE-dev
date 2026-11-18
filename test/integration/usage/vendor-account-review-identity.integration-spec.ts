import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { UsageImportListeners } from '../../../src/modules/usage/public/usage.extension-points';
import { InvoiceHarness } from '../../support/invoice-harness';

const h = new InvoiceHarness();

interface Difference {
  id: string;
  source: string;
  employeeId: string | null;
  identity: string | null;
  outOfProcessCaseId: string | null;
}

/**
 * One open case for each account of a vendor, whichever way the account was seen (`QĐ-98h`, `US-13-03` AC-11, `SBF-07a` step 1, FX3-03): the same
 * account is a difference of an identifier nobody owns (`UNMATCHED_IDENTITY`, named by the identifier of the report) and, once the IT Admin ties the
 * identifier to a person, a difference of an account with activity and no seat (`NO_ASSIGNMENT`, named by the person). Both name it by the identifier
 * the usage module normalized, so the second source joins the case of the first instead of opening another that Finance would record a second time.
 */
describe('the case outside the process of one account whichever source saw it over PostgreSQL (integration; FX3-03)', () => {
  let applicationId: string;
  let plan: string;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(20, 'K2'));
    applicationId = (
      await h.ctx.sql.query<{ application_id: string }>(`SELECT application_id FROM plans WHERE id = $1`, [plan])
    ).rows[0].application_id;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const differences = (method: 'get' | 'post', path: string) =>
    request(h.server())[method](`/api/v1/vendor-account-discrepancies${path}`).set(h.as(h.it1));
  /** A report of the vendor was confirmed: the review is made from what the report left, as the confirmation makes it. */
  const confirmed = (importId: string): Promise<void> =>
    h.ctx.app.get(TransactionRunner).run((tx) =>
      h.ctx.app.get(UsageImportListeners, { strict: false }).emit(tx, {
        moment: 'CONFIRMED',
        importId,
        sourceId: randomUUID(),
        applicationId,
        coverageTo: `${h.year}-10-31`,
      }),
    );
  const unmatched = (raw: string, importId: string) =>
    h.ctx.sql.query(
      `INSERT INTO usage_unmatched_identities (organization_id, application_id, source_id, identifier_type, normalized_identifier, raw_identifier,
         reason, status, candidate_employee_ids, first_import_id, last_import_id)
       VALUES ($1, $2, $3, 'EMAIL', lower($4), $4, 'NOT_FOUND', 'OPEN', '{}', $5, $5)`,
      [h.seed.organizationId, applicationId, randomUUID(), raw, importId],
    );
  /** The identifier was tied to the person (`SBF-04a`); the person then has activity with no seat. */
  const tiedAndSeatless = async (raw: string, employeeId: string, importId: string) => {
    await h.ctx.sql.query(
      `INSERT INTO usage_identity_mappings (organization_id, application_id, identifier_type, normalized_identifier, raw_identifier, employee_id,
         method, confidence)
       VALUES ($1, $2, 'EMAIL', lower($3), $3, $4, 'EXACT_EMAIL', 'HIGH')`,
      [h.seed.organizationId, applicationId, raw, employeeId],
    );
    await h.ctx.sql.query(
      `INSERT INTO usage_no_assignment_findings (organization_id, application_id, employee_id, first_activity_date, last_activity_date, last_import_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'OPEN')`,
      [h.seed.organizationId, applicationId, employeeId, `${h.year}-10-01`, `${h.year}-10-20`, importId],
    );
  };
  const openOf = async (source: string, matches: (item: Difference) => boolean): Promise<Difference> => {
    const page = h.dataOf<{ items: Difference[] }>(
      await differences('get', `?pageSize=100&state=OPEN&source=${source}&applicationId=${applicationId}`).expect(200),
    );

    return page.items.find(matches) as Difference;
  };
  const decide = async (id: string): Promise<Difference> =>
    h.dataOf<Difference>(
      await differences('post', `/${id}/decision`)
        .send({ decision: 'OUT_OF_PROCESS', companyAsset: false, note: 'Ngoài quy trình' })
        .expect(201),
    );
  const casesOf = async (caseIds: (string | null)[]): Promise<number> =>
    (await h.ctx.sql.query(`SELECT 1 FROM out_of_process_cases WHERE id = ANY($1::uuid[])`, [caseIds])).rowCount ?? 0;

  it('an identifier nobody owns decided outside the process, then the same account as the activity of a person with no seat decided too: one case, the second difference joins it', async () => {
    const first = randomUUID();
    await unmatched('X@CongTy.vn', first);
    await confirmed(first);
    const one = await decide((await openOf('UNMATCHED_IDENTITY', (item) => item.identity === 'X@CongTy.vn')).id);

    const second = randomUUID();
    await tiedAndSeatless('X@CongTy.vn', h.it1.employeeId, second);
    await confirmed(second);
    const two = await decide((await openOf('NO_ASSIGNMENT', (item) => item.employeeId === h.it1.employeeId)).id);

    expect(one.outOfProcessCaseId).not.toBeNull();
    expect(two.outOfProcessCaseId).toBe(one.outOfProcessCaseId);
    expect(
      (
        await h.ctx.sql.query(`SELECT 1 FROM out_of_process_cases WHERE application_id = $1 AND state = 'OPEN'`, [
          applicationId,
        ])
      ).rowCount,
    ).toBe(1);
  });

  it('two accounts that are not the same stay two cases: a person tied to another identifier does not join the case of an identifier nobody owns', async () => {
    const first = randomUUID();
    await unmatched('Stranger@CongTy.vn', first);
    await confirmed(first);
    const stranger = await decide(
      (await openOf('UNMATCHED_IDENTITY', (item) => item.identity === 'Stranger@CongTy.vn')).id,
    );

    const second = randomUUID();
    await tiedAndSeatless('boss@congty.vn', h.boss.employeeId, second);
    await confirmed(second);
    const boss = await decide((await openOf('NO_ASSIGNMENT', (item) => item.employeeId === h.boss.employeeId)).id);

    expect(boss.outOfProcessCaseId).not.toBe(stranger.outOfProcessCaseId);
    expect(await casesOf([boss.outOfProcessCaseId, stranger.outOfProcessCaseId])).toBe(2);
  });
});
