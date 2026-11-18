import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { LicensingUsageApi } from '../../../src/modules/licensing/public/licensing-usage.api';
import { UsageEvidenceApi } from '../../../src/modules/usage/public/usage-evidence.api';
import { pretendBusinessToday } from '../../support/pretend-today';
import { UsageHarness } from '../../support/vendor-usage-harness';

const h = new UsageHarness();
const TODAY = '2026-09-02';
const WINDOW = { coverageFrom: '2026-06-01', coverageTo: '2026-08-31' };

interface QueueItem {
  id: string;
  identifier: string;
  reason: string;
  status: string;
  candidates: Array<Record<string, unknown>>;
}

describe('the queue of vendor identifiers nobody could be tied to (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await h.start();
  }, 180000);

  beforeEach(() => {
    pretendBusinessToday(h.ctx.app, TODAY);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await h.stop();
  });

  const aggregate = (lines: string[][]) => h.report(['email', 'last_active'], lines);
  const usernames = (lines: string[][]) => h.report(['user', 'last_active'], lines);
  const USERNAME_SOURCE = {
    identifierType: 'USERNAME',
    template: { columns: { identifier: 'user', lastActivityDate: 'last_active' }, eventClasses: {} },
  };
  const queueOf = async (applicationId: string, query: Record<string, string> = {}): Promise<QueueItem[]> =>
    h.dataOf<{ items: QueueItem[] }>(
      await request(h.server())
        .get('/api/v1/usage-unmatched-identities')
        .query({ applicationId, ...query })
        .set(h.as(h.it1))
        .expect(200),
    ).items;
  const post = (path: string, body: object, account = h.it1) =>
    request(h.server()).post(path).set(h.as(account)).send(body);
  const evidenceFor = (applicationId: string, employeeIds: string[]) =>
    h.ctx.app.get(UsageEvidenceApi).evidenceFor({ applicationId, employeeIds, asOf: TODAY });

  describe('FR-4.6, INV-12: what nobody is tied to goes to the queue and concludes nothing', () => {
    it('queues the strangers and the identifier that fits two people, and gives no day of theirs to anyone', async () => {
      const { applicationId } = await h.usageApp();
      const e1 = await h.person('QUE1');
      await h.person('SAM1');
      const sam2 = await h.person('SAM2');
      await h.ctx.sql.query(
        `UPDATE employees SET work_email = 'sam1@other.vn', normalized_work_email = 'sam1@other.vn' WHERE employee_code = 'SAM2'`,
      );
      const source = await h.source(applicationId);

      await h.confirmed(
        source.id,
        aggregate([
          ['que1@acme.vn', '2026-08-01'],
          ['stranger@vendor.example', '2026-08-02'],
          // An alias on a domain of the company fits both SAM1 and SAM2; the same local part outside the company is nobody (M5-06, FR-4.5).
          ['sam1+old@acme.vn', '2026-08-03'],
        ]),
        WINDOW,
      );

      const items = await queueOf(applicationId);
      expect(items.map((item) => [item.identifier, item.reason, item.status]).sort()).toEqual([
        ['sam1+old@acme.vn', 'AMBIGUOUS', 'OPEN'],
        ['stranger@vendor.example', 'NOT_FOUND', 'OPEN'],
      ]);
      const ambiguous = items.find((item) => item.reason === 'AMBIGUOUS');
      expect(ambiguous?.candidates).toHaveLength(2);
      for (const candidate of ambiguous?.candidates ?? []) {
        expect(Object.keys(candidate).sort()).toEqual(['employeeCode', 'employeeId', 'workEmail']);
      }
      const evidence = await evidenceFor(applicationId, [e1, sam2]);
      const days = evidence.sources.flatMap((entry) => entry.employees);
      expect(days.map((employee) => employee.employeeId)).toEqual([e1]);
      expect(evidence.unmatchedIdentities).toHaveLength(2);
      expect(evidence.unmatchedIdentities.find((item) => item.candidateEmployeeIds.length === 2)).toMatchObject({
        status: 'OPEN',
        lastActivityDate: '2026-08-03',
      });
    });
  });

  describe('US-08-04 AC-1, AC-4: resolving by hand', () => {
    it('ties baovh to SE183866 as MANUAL with the raw identifier and the person who confirmed it; candidates show code and email only', async () => {
      const { applicationId } = await h.usageApp();
      const person = await h.person('SE183866');
      const source = await h.source(applicationId, USERNAME_SOURCE);
      await h.confirmed(source.id, usernames([['BaoVH', '2026-08-01']]), WINDOW);
      const [item] = await queueOf(applicationId);
      expect(item).toMatchObject({ identifier: 'BaoVH', reason: 'NOT_FOUND', candidates: [] });

      const resolved = await post(`/api/v1/usage-unmatched-identities/${item.id}/resolve`, {
        employeeId: person,
      }).expect(200);

      expect(h.dataOf<QueueItem>(resolved).status).toBe('RESOLVED');
      const { rows } = await h.ctx.sql.query<{
        raw_identifier: string;
        normalized_identifier: string;
        method: string;
        confirmed_by_app_user_id: string;
      }>(
        `SELECT raw_identifier, normalized_identifier, method::text, confirmed_by_app_user_id FROM usage_identity_mappings WHERE employee_id = $1`,
        [person],
      );
      expect(rows).toMatchObject([{ raw_identifier: 'BaoVH', normalized_identifier: 'baovh', method: 'MANUAL' }]);
      expect(rows[0].confirmed_by_app_user_id).toBe(h.it1.appUserId);
      expect(await h.auditOf('UsageUnmatchedIdentity', item.id)).toHaveLength(1);
      const evidence = await evidenceFor(applicationId, [person]);
      expect(evidence.sources[0].employees[0]).toMatchObject({ activeDates: ['2026-08-01'], weakestMethod: 'MANUAL' });
    });
  });

  describe('QT 5.2, AC-7: what may be done twice, and what may not', () => {
    it('refuses to tie an identifier that is tied already (ALREADY_MAPPED); a dismissed identifier stays listed, can still be tied, then is handled', async () => {
      const { applicationId } = await h.usageApp();
      const e1 = await h.person('QT1');
      const e2 = await h.person('QT2');
      const source = await h.source(applicationId, USERNAME_SOURCE);
      await h.confirmed(
        source.id,
        usernames([
          ['ghost', '2026-08-01'],
          ['other', '2026-08-02'],
        ]),
        WINDOW,
      );
      const items = await queueOf(applicationId);
      const ghost = items.find((item) => item.identifier === 'ghost') as QueueItem;
      const other = items.find((item) => item.identifier === 'other') as QueueItem;
      await h.ctx.sql.query(
        `INSERT INTO usage_identity_mappings (organization_id, application_id, identifier_type, normalized_identifier, raw_identifier, employee_id, method, confidence)
         VALUES ($1, $2, 'USERNAME', 'ghost', 'ghost', $3, 'EXACT_EMAIL', 'HIGH')`,
        [h.seed.organizationId, applicationId, e2],
      );

      expect(
        h.codeOf(await post(`/api/v1/usage-unmatched-identities/${ghost.id}/resolve`, { employeeId: e1 }).expect(409)),
      ).toBe('USAGE_IDENTITY.ALREADY_MAPPED');

      await post(`/api/v1/usage-unmatched-identities/${other.id}/dismiss`, {
        note: 'tài khoản dịch vụ của nhà cung cấp',
      }).expect(200);
      expect((await queueOf(applicationId)).map((item) => [item.identifier, item.status]).sort()).toEqual([
        ['ghost', 'OPEN'],
        ['other', 'DISMISSED'],
      ]);
      await post(`/api/v1/usage-unmatched-identities/${other.id}/resolve`, { employeeId: e1 }).expect(200);
      expect(
        h.codeOf(await post(`/api/v1/usage-unmatched-identities/${other.id}/resolve`, { employeeId: e1 }).expect(409)),
      ).toBe('USAGE_IDENTITY.ALREADY_HANDLED');
      expect(
        h.codeOf(await post(`/api/v1/usage-unmatched-identities/${other.id}/dismiss`, { note: 'lại' }).expect(409)),
      ).toBe('USAGE_IDENTITY.ALREADY_HANDLED');
      expect(
        h.codeOf(await post(`/api/v1/usage-unmatched-identities/${randomUUID()}/dismiss`, { note: 'x' }).expect(404)),
      ).toBe('USAGE_IDENTITY.UNMATCHED_NOT_FOUND');
    });

    it('QĐ-101i: Finance and an employee never read or change the queue (403)', async () => {
      for (const account of [h.finance, h.employee]) {
        await request(h.server()).get('/api/v1/usage-unmatched-identities').set(h.as(account)).expect(403);
        await post(`/api/v1/usage-unmatched-identities/${randomUUID()}/dismiss`, { note: 'x' }, account).expect(403);
        await request(h.server()).get('/api/v1/usage-identity-mappings').set(h.as(account)).expect(403);
        await request(h.server()).get('/api/v1/usage-no-assignment-findings').set(h.as(account)).expect(403);
      }
    });
  });

  describe('DA6-11: a wrong mapping is taken back', () => {
    it('after MappingEnd and a new Resolve the days follow the new person: E1 loses them, E2 has them, and both show the change', async () => {
      const { applicationId } = await h.usageApp();
      const e1 = await h.person('FIX1');
      const e2 = await h.person('FIX2');
      const source = await h.source(applicationId, USERNAME_SOURCE);
      await h.confirmed(source.id, usernames([['x1', '2026-08-01']]), WINDOW);
      const [item] = await queueOf(applicationId);
      await post(`/api/v1/usage-unmatched-identities/${item.id}/resolve`, { employeeId: e1 }).expect(200);
      expect((await evidenceFor(applicationId, [e1])).sources[0].employees[0].activeDates).toEqual(['2026-08-01']);
      const [mapping] = h.dataOf<{ items: Array<{ id: string; identifier: string; method: string }> }>(
        await request(h.server())
          .get('/api/v1/usage-identity-mappings')
          .query({ applicationId })
          .set(h.as(h.it1))
          .expect(200),
      ).items;
      expect(mapping).toMatchObject({ identifier: 'x1', method: 'MANUAL' });

      await post(`/api/v1/usage-identity-mappings/${mapping.id}/end`, { reason: 'nhầm người' }).expect(200);
      expect(
        h.codeOf(await post(`/api/v1/usage-identity-mappings/${mapping.id}/end`, { reason: 'lần nữa' }).expect(409)),
      ).toBe('USAGE_IDENTITY.MAPPING_ENDED');
      const [back] = await queueOf(applicationId);
      expect(back).toMatchObject({ identifier: 'x1', status: 'OPEN' });
      await post(`/api/v1/usage-unmatched-identities/${back.id}/resolve`, { employeeId: e2 }).expect(200);

      const first = (await evidenceFor(applicationId, [e1, e2])).sources[0].employees;
      expect(first.find((employee) => employee.employeeId === e1)).toMatchObject({ activeDates: [], appeared: false });
      expect(first.find((employee) => employee.employeeId === e2)).toMatchObject({
        activeDates: ['2026-08-01'],
        weakestMethod: 'MANUAL',
      });
      for (const employeeId of [e1, e2]) {
        const evidence = (await evidenceFor(applicationId, [employeeId])).sources[0].employees[0];
        expect(evidence.mappingChangedOn).toBe(new Date().toISOString().slice(0, 10));
      }
    });
  });

  describe('chain of renewals', () => {
    it('lists the two links of a renewal chain as two intervals that share the first link as root and the usable day of the first', async () => {
      const { applicationId, subscriptionId } = await h.usageApp();
      const person = await h.person('CHAIN1');
      await h.seatsOn(subscriptionId as string, [{ code: 'CHAIN1', grantedOn: '2026-01-10' }]);
      await h.ctx.sql.query(`UPDATE license_assignments SET valid_until = '2026-07-01' WHERE employee_id = $1`, [
        person,
      ]);
      await h.ctx.sql.query(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
           normalized_account_identifier, cost_center_id, owning_department_id, valid_from, valid_from_basis, predecessor_id, baseline_import_id, created_by_app_user_id)
         SELECT gen_random_uuid(), organization_id, kind, 'RENEWAL_CARRY'::"AssignmentSource", plan_id, subscription_id, employee_id, account_identifier,
                normalized_account_identifier, cost_center_id, owning_department_id, '2026-07-01', valid_from_basis, id, NULL, created_by_app_user_id
           FROM license_assignments WHERE employee_id = $1`,
        [person],
      );

      const intervals = await h.ctx.app
        .get(LicensingUsageApi)
        .listAssignmentIntervals({ applicationId, employeeIds: [person], from: '2026-06-01', to: '2026-08-31' });

      expect(intervals.map((interval) => [interval.from, interval.until])).toEqual([
        ['2026-01-10', '2026-07-01'],
        ['2026-07-01', null],
      ]);
      expect(new Set(intervals.map((interval) => interval.chainRootId)).size).toBe(1);
      expect(new Set(intervals.map((interval) => interval.usableOn))).toEqual(new Set(['2026-01-10']));
    });
  });
});
