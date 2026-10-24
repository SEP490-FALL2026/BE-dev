import request from 'supertest';
import { addDays } from '../../src/core/business-date';
import { FinanceService } from '../../src/modules/finance/finance.service';
import { PgRelay } from '../support/pg-relay';
import { QueryCounter, dataStatements, tablesOf } from '../support/query-count';
import { OperatingParametersService } from '../../src/modules/operating-parameters/operating-parameters.service';
import { SeatHarness } from '../support/seat-baseline-harness';

const h = new SeatHarness();

/** LD-01, LD-02, LD-03 and LD-16 of the post-merge review: the subscription reads take a fixed number of statements, and the warnings of a plan are bounded. */
describe('catalog subscription read model (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  const sql = () => h.ctx.sql;
  const as = (account = h.it1) => h.as(account);
  const today = async (): Promise<string> =>
    (
      await sql().query<{ d: string }>(
        `SELECT to_char((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD') AS d`,
      )
    ).rows[0].d;

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

  describe('LD-01: the subscription list estimates the tax of the whole page in one read', () => {
    it('takes the same number of statements for 3 subscriptions of 3 vendors as for 15 of 15', async () => {
      for (let index = 0; index < 3; index += 1) await h.subscription(5, 'K2');
      const few = await counter.run(() =>
        request(h.server()).get('/api/v1/subscriptions?pageSize=100').set(as()).expect(200),
      );
      for (let index = 0; index < 12; index += 1) await h.subscription(5, 'K2');
      const many = await counter.run(() =>
        request(h.server()).get('/api/v1/subscriptions?pageSize=100').set(as()).expect(200),
      );

      const items = h.dataOf<{ items: { taxEstimate: { basis: string } | null }[] }>(many.result).items;
      expect(items).toHaveLength(15);
      expect(items.every((item) => item.taxEstimate?.basis === 'DEFAULT_NO_PROFILE')).toBe(true);
      expect(dataStatements(many.statements)).toHaveLength(dataStatements(few.statements).length);
    }, 180_000);

    it('answers the tax profile of a priced subscription from the read its estimate came from (one version)', async () => {
      const id = await h.subscription(5, 'K2');
      const vendorId = (
        await sql().query<{ vendor_id: string }>(
          `SELECT a.vendor_id FROM subscriptions s JOIN plans p ON p.id = s.plan_id
             JOIN applications a ON a.id = p.application_id WHERE s.id = $1`,
          [id],
        )
      ).rows[0].vendor_id;
      await request(h.server())
        .put(`/api/v1/vendors/${vendorId}/tax-profile`)
        .set(as(h.finance))
        .send({
          lines: [
            { taxType: 'GTGT', ratePercent: '10', deductible: true },
            { taxType: 'TNDN nhà thầu', ratePercent: '5', deductible: false },
          ],
        })
        .expect(200);
      // A declaration landing between two reads: a separate read of the groups would now answer T3 (P28-06, LD-01).
      const groups = jest
        .spyOn(h.ctx.app.get(FinanceService, { strict: false }), 'taxProfileGroups')
        .mockResolvedValue(new Map([[vendorId, { group: 'T3' as const, version: 2 }]]));
      try {
        const items = h.dataOf<{ items: Array<{ id: string; taxProfile: unknown; taxEstimate: unknown }> }>(
          await request(h.server()).get('/api/v1/subscriptions?pageSize=100').set(as()).expect(200),
        ).items;

        // 1 000 000 VND: VAT 10% deductible (100 000) and CIT 5% not (50 000), worked out by hand.
        expect(items.find((item) => item.id === id)).toMatchObject({
          taxProfile: { status: 'DECLARED', group: 'T2' },
          taxEstimate: {
            basis: 'PROFILE',
            group: 'T2',
            taxAmount: '150000',
            deductibleTaxAmount: '100000',
            nonDeductibleTaxAmount: '50000',
            estimatedCost: '1050000',
          },
        });
      } finally {
        groups.mockRestore();
      }
    }, 120_000);
  });

  describe('LD-02: the warning list reads the subscriptions whose milestone is near, not all of them', () => {
    it('lists exactly the plans the rule says need a review, in a fixed number of statements', async () => {
      const day = await today();
      const days = await h.ctx.app
        .get(OperatingParametersService, { strict: false })
        .getValue('RENEWAL_ALERT_DAYS_BEFORE_DEADLINE');
      const earliest = Math.max(...(days as number[]));
      // The rows' answers are written out from the rule, not computed with the code under test (P28-06): a milestone is
      // the declared deadline, else renewal (or end) minus the notice period, else the end of a plan that does not
      // renew; it is due when it falls from today to `earliest` days ahead. The answers hold for 10 ≤ earliest ≤ 34.
      expect(earliest).toBeGreaterThanOrEqual(10);
      expect(earliest).toBeLessThanOrEqual(34);
      const matrix = [
        { deadline: addDays(day, 5), renewal: null, end: null, period: null, auto: true, due: true },
        { deadline: addDays(day, earliest - 1), renewal: null, end: null, period: null, auto: true, due: true },
        { deadline: addDays(day, 400), renewal: null, end: null, period: null, auto: true, due: false },
        { deadline: addDays(day, -3), renewal: null, end: null, period: null, auto: true, due: false },
        { deadline: null, renewal: addDays(day, 40), end: null, period: 30, auto: true, due: true },
        { deadline: null, renewal: addDays(day, 40), end: null, period: 5, auto: true, due: false },
        { deadline: null, renewal: null, end: addDays(day, 10), period: null, auto: false, due: true },
        { deadline: null, renewal: null, end: addDays(day, 10), period: null, auto: true, due: false },
      ];
      const created: { id: string; planId: string; due: boolean }[] = [];
      for (const row of matrix) {
        const id = await h.subscription(5, 'K2');
        await sql().query(
          `UPDATE subscriptions SET notice_deadline = $2, renewal_date = $3, end_date = $4, notice_period_days = $5, auto_renew = $6
            WHERE id = $1`,
          [id, row.deadline, row.renewal, row.end, row.period, row.auto],
        );
        const planId = (await sql().query<{ plan_id: string }>(`SELECT plan_id FROM subscriptions WHERE id = $1`, [id]))
          .rows[0].plan_id;
        created.push({ id, planId, due: row.due });
      }

      const { result, statements } = await counter.run(() =>
        request(h.server()).get('/api/v1/plan-warnings?pageSize=100').set(as()).expect(200),
      );

      const listed = h.dataOf<{ items: { subscriptionId: string }[] }>(result).items.map((item) => item.subscriptionId);
      expect(listed.sort()).toEqual(
        created
          .filter((entry) => entry.due)
          .map((entry) => entry.id)
          .sort(),
      );
      // The subscriptions are read once, by the milestone window; nothing is read per subscription or per plan.
      const subscriptionReads = dataStatements(statements).filter(
        (statement) => tablesOf(statement)[0] === 'subscriptions',
      );
      expect(subscriptionReads.length).toBeLessThanOrEqual(2);
    }, 180_000);
  });

  describe('LD-03: the history of an allocation reads its Cost Centers once', () => {
    it('reads the Cost Centers of 30 versions in one statement', async () => {
      const planId = await h.plan('K2', 'FLAT_RATE');
      const subscriptionId = h.dataOf<{ id: string }>(
        await request(h.server())
          .post('/api/v1/subscriptions')
          .set(as())
          .send({
            planId,
            kind: 'TERM',
            unitPrice: { amount: '1000000', currency: 'VND' },
            billingCycle: 'MONTHLY',
            startDate: '2026-01-05',
            purchasedQuantity: 5,
          })
          .expect(201),
      ).id;
      const centers = [];
      for (let index = 0; index < 5; index += 1) centers.push(await h.costCenter('UNIT'));
      for (let version = 0; version < 30; version += 1) {
        const first = centers[version % 5];
        const second = centers[(version + 1) % 5];
        await request(h.server())
          .put(`/api/v1/subscriptions/${subscriptionId}/cost-allocation`)
          .set(as(h.finance))
          .send({
            lines: [
              { costCenterId: first.id, ratioPercent: `${50 + (version % 3)}` },
              { costCenterId: second.id, ratioPercent: `${50 - (version % 3)}` },
            ],
          })
          .expect(200);
      }

      const { result, statements } = await counter.run(() =>
        request(h.server())
          .get(`/api/v1/subscriptions/${subscriptionId}/cost-allocation/history?pageSize=30`)
          .set(as(h.finance))
          .expect(200),
      );

      expect(h.dataOf<{ items: unknown[] }>(result).items).toHaveLength(30);
      const centerReads = dataStatements(statements).filter((statement) => tablesOf(statement)[0] === 'cost_centers');
      expect(centerReads).toHaveLength(1);
    }, 240_000);
  });

  describe('LD-16: the warnings of one plan are bounded, with their total', () => {
    it('answers at most 50 warnings for a plan with 60 subscriptions due, and the total', async () => {
      const first = await h.subscription(5, 'K2');
      const day = await today();
      const planId = (
        await sql().query<{ plan_id: string }>(`SELECT plan_id FROM subscriptions WHERE id = $1`, [first])
      ).rows[0].plan_id;
      await sql().query(`UPDATE subscriptions SET notice_deadline = $2, auto_renew = true WHERE id = $1`, [
        first,
        addDays(day, 5),
      ]);
      await sql().query(
        `INSERT INTO subscriptions (id, organization_id, plan_id, kind, status, purchased_quantity, unit_price_minor,
           unit_price_currency, price_recorded_on, price_rate, price_rate_date, price_rate_source, price_reporting_minor,
           price_reporting_currency, billing_cycle, start_date, notice_deadline, auto_renew)
         SELECT gen_random_uuid(), organization_id, plan_id, kind, status, purchased_quantity, unit_price_minor,
                unit_price_currency, price_recorded_on, price_rate, price_rate_date, price_rate_source, price_reporting_minor,
                price_reporting_currency, billing_cycle, start_date, notice_deadline, auto_renew
           FROM subscriptions s, generate_series(1, 59) WHERE s.id = $1`,
        [first],
      );

      const terms = h.dataOf<{ warnings: unknown[]; warningTotal: number }>(
        await request(h.server()).get(`/api/v1/plans/${planId}/terms`).set(as()).expect(200),
      );

      expect(terms.warnings).toHaveLength(50);
      expect(terms.warningTotal).toBe(60);
    }, 120_000);
  });
});
