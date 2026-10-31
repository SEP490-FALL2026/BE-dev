import request from 'supertest';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements } from '../../support/query-count';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();
const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };

const SUMMARY_KEYS = [
  'businessOwner',
  'businessOwnerReplacementRequired',
  'dataSensitivity',
  'functionalGroup',
  'id',
  'isCommunicationService',
  'kind',
  'name',
  'status',
  'updatedAt',
  'usageCollectionDefault',
  'vendor',
];

/** LD-04, LD-05 and LD-06 of the post-merge review: a collection answers summaries, a detail answers the rest, and nothing is unbounded. */
describe('catalog read contracts (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let counter_ = 0;

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
  }, 120000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  const as = () => h.as(h.it1);
  const domains = (tag: string) => Array.from({ length: 20 }, (_, index) => `d${index}-${tag}.example.com`);
  const declare = async (name: string) => {
    counter_ += 1;

    return h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/applications')
        .set(as())
        .send({
          name,
          kind: 'SAAS',
          vendorName: `${name} Inc`,
          dataSensitivity: 'LOW',
          businessOwnerEmployeeId: h.businessOwner,
          communication: { ...NO, note: 'n'.repeat(1000) },
          domains: domains(`${counter_}`),
        })
        .expect(201),
    );
  };
  const listApplications = () =>
    counter.run(() => request(h.server()).get('/api/v1/applications?pageSize=100').set(as()).expect(200));

  describe('LD-04: the application list is a summary', () => {
    it('answers the summary fields only, and the detail still answers the rest', async () => {
      const first = await declare('Summary One');

      const { result } = await listApplications();
      const items = h.dataOf<{ items: Record<string, unknown>[] }>(result).items;

      expect(Object.keys(items[0]).sort()).toEqual(SUMMARY_KEYS);
      const detail = h.dataOf<Record<string, unknown>>(
        await request(h.server()).get(`/api/v1/applications/${first.id}`).set(as()).expect(200),
      );
      expect(detail).toMatchObject({
        id: first.id,
        domains: expect.any(Array) as unknown,
        communication: expect.objectContaining({ note: 'n'.repeat(1000) }) as unknown,
        dictionaryServiceLineId: null,
      });
      expect(Object.keys(detail)).toEqual(expect.arrayContaining(SUMMARY_KEYS));
    }, 60_000);

    it('reads no domains or note from the database and a fixed number of statements however many applications there are', async () => {
      await declare('Summary Two');
      const few = await listApplications();
      for (let index = 0; index < 5; index += 1) await declare(`Summary Many ${index}`);
      const many = await listApplications();

      const fewStatements = dataStatements(few.statements);
      const manyStatements = dataStatements(many.statements);
      expect(manyStatements).toHaveLength(fewStatements.length);
      for (const statement of manyStatements) {
        expect(statement).not.toMatch(/"domains"|communication_note/);
      }
    }, 120_000);
  });

  describe('LD-06: the arrays of a detail are bounded, with their totals, and the rest is paged', () => {
    const sql = () => h.ctx.sql;

    it('answers 20 similar applications and how many there are', async () => {
      const group = h.dataOf<{ id: string }>(
        await request(h.server())
          .post('/api/v1/functional-groups')
          .set(as())
          .send({ name: 'Design tools' })
          .expect(201),
      );
      let first = '';
      for (let index = 0; index < 22; index += 1) {
        const created = h.dataOf<{ id: string }>(
          await request(h.server())
            .post('/api/v1/applications')
            .set(as())
            .send({
              name: `Similar ${index}`,
              kind: 'SAAS',
              vendorName: `Similar Vendor ${index}`,
              dataSensitivity: 'LOW',
              businessOwnerEmployeeId: h.businessOwner,
              communication: NO,
              functionalGroupId: group.id,
            })
            .expect(201),
        );
        if (index === 0) first = created.id;
      }

      const detail = h.dataOf<{ similarApplications: unknown[]; similarTotal: number }>(
        await request(h.server()).get(`/api/v1/applications/${first}`).set(as()).expect(200),
      );

      expect(detail.similarApplications).toHaveLength(20);
      expect(detail.similarTotal).toBe(21);
    }, 120_000);

    it('pages the history of Business Owners', async () => {
      const application = await declare('Owner History');
      await sql().query(
        `INSERT INTO application_business_owners (id, application_id, employee_id, assigned_at, ended_at)
         SELECT gen_random_uuid(), $1, $2, now() - (n || ' minutes')::interval, now() - (n || ' minutes')::interval + interval '30 seconds'
           FROM generate_series(1, 25) AS n`,
        [application.id, h.businessOwner],
      );

      const page = h.dataOf<{ items: unknown[]; pagination: { page: number; pageSize: number; totalItems: number } }>(
        await request(h.server())
          .get(`/api/v1/applications/${application.id}/business-owners?page=2&pageSize=10`)
          .set(as())
          .expect(200),
      );

      expect(page.items).toHaveLength(10);
      expect(page.pagination).toMatchObject({ page: 2, pageSize: 10, totalItems: 26 });
    }, 60_000);

    it('answers the newest 50 opinions on a plan with their total, and pages all of them on their own route', async () => {
      const planId = await h.plan('K2', 'PER_SEAT');
      await sql().query(
        `INSERT INTO plan_term_opinions (id, plan_id, business_owner_employee_id, opinion, recorded_by_app_user_id, recorded_at)
         SELECT gen_random_uuid(), $1, $2, 'opinion ' || n, $3, now() - (n || ' minutes')::interval
           FROM generate_series(1, 60) AS n`,
        [planId, h.businessOwner, h.it1.appUserId],
      );

      const terms = h.dataOf<{ opinions: { opinion: string }[]; opinionTotal: number }>(
        await request(h.server()).get(`/api/v1/plans/${planId}/terms`).set(as()).expect(200),
      );
      const second = h.dataOf<{ items: { opinion: string }[]; pagination: { totalItems: number } }>(
        await request(h.server()).get(`/api/v1/plans/${planId}/term-opinions?page=2&pageSize=50`).set(as()).expect(200),
      );

      expect(terms.opinions).toHaveLength(50);
      expect(terms.opinions[0].opinion).toBe('opinion 1');
      expect(terms.opinionTotal).toBe(60);
      expect(second.items).toHaveLength(10);
      expect(second.pagination.totalItems).toBe(60);
    }, 60_000);

    it('lists at most 50 of what holds an application and of its confirmations, counts the rest and answers the same when retiring is refused', async () => {
      await h.crowd('LDSIX', 120);
      const subscriptionId = await h.subscription(200, 'K2');
      const { plan_id: planId } = (
        await sql().query<{ plan_id: string }>(`SELECT plan_id FROM subscriptions WHERE id = $1`, [subscriptionId])
      ).rows[0];
      const { application_id: applicationId } = (
        await sql().query<{ application_id: string }>(`SELECT application_id FROM plans WHERE id = $1`, [planId])
      ).rows[0];
      const owner = (
        await sql().query<{ business_owner_employee_id: string }>(
          `SELECT business_owner_employee_id FROM applications WHERE id = $1`,
          [applicationId],
        )
      ).rows[0].business_owner_employee_id;
      await sql().query(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
           account_identifier, normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
         SELECT gen_random_uuid(), $1, 'PERSONAL', 'REQUEST', $2, $3, e.id, e.employee_code || '@acme.vn',
                lower(e.employee_code) || '@acme.vn', '2026-01-05', 'ACTUAL', gen_random_uuid()
           FROM employees e WHERE e.employee_code LIKE 'LDSIX%'`,
        [h.seed.organizationId, planId, subscriptionId],
      );
      await sql().query(
        `INSERT INTO application_retirement_confirmations (id, organization_id, application_id, business_owner_employee_id, note,
           recorded_by_app_user_id, recorded_at)
         SELECT gen_random_uuid(), $1, $2, $3, 'confirmation ' || n, $4, now() - (n || ' minutes')::interval
           FROM generate_series(1, 60) AS n`,
        [h.seed.organizationId, applicationId, owner, h.it1.appUserId],
      );

      const view = h.dataOf<{
        retirement: {
          confirmed: boolean;
          confirmations: unknown[];
          confirmationTotal: number;
          canRetire: boolean;
          blockers: {
            assignments: unknown[];
            assignmentTotal: number;
            assignmentsByPlan: { planId: string; planName: string; count: number }[];
            subscriptions: unknown[];
            subscriptionTotal: number;
          };
        };
      }>(
        await request(h.server()).get(`/api/v1/applications/${applicationId}/retirement`).set(as()).expect(200),
      ).retirement;

      expect(view.confirmed).toBe(true);
      expect(view.canRetire).toBe(false);
      expect(view.confirmations).toHaveLength(50);
      expect(view.confirmationTotal).toBe(60);
      expect(view.blockers.assignments).toHaveLength(50);
      expect(view.blockers.assignmentTotal).toBe(120);
      expect(view.blockers.assignmentsByPlan).toEqual([
        { planId, planName: expect.any(String) as unknown, count: 120 },
      ]);
      expect(view.blockers.subscriptions).toHaveLength(1);
      expect(view.blockers.subscriptionTotal).toBe(1);

      const refused = await request(h.server())
        .post(`/api/v1/applications/${applicationId}/retire`)
        .set(as())
        .expect(409);
      expect(h.codeOf(refused)).toBe('APPLICATION.RETIREMENT_BLOCKED');
      const details = h.detailsOf(refused) as {
        assignments: unknown[];
        assignmentTotal: number;
        subscriptionTotal: number;
      };
      expect(details.assignments).toHaveLength(50);
      expect(details.assignmentTotal).toBe(120);
      expect(details.subscriptionTotal).toBe(1);
    }, 180_000);
  });

  describe('LD-05: the plan list leaves the revocation note to the detail', () => {
    it('answers no revocation note in the list, never reads the column for it, and the detail has it', async () => {
      const planId = await h.plan('K2', 'PER_SEAT');
      await request(h.server())
        .patch(`/api/v1/plans/${planId}`)
        .set(as())
        .send({ revocationNote: 'r'.repeat(2000) })
        .expect(200);

      const { result, statements } = await counter.run(() =>
        request(h.server()).get('/api/v1/plans?pageSize=100').set(as()).expect(200),
      );

      const items = h.dataOf<{ items: Record<string, unknown>[] }>(result).items;
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) expect(item).not.toHaveProperty('revocationNote');
      for (const statement of dataStatements(statements)) expect(statement).not.toMatch(/revocation_note/);
      const detail = h.dataOf<{ revocationNote: string | null }>(
        await request(h.server()).get(`/api/v1/plans/${planId}`).set(as()).expect(200),
      );
      expect(detail.revocationNote).toBe('r'.repeat(2000));
    }, 60_000);
  });
});
