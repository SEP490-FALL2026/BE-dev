import request from 'supertest';
import { LicensingPoolStockApi } from '../../../src/modules/licensing/public/licensing-pool-stock.api';
import type { ApiAccount } from '../../support/api-accounts';
import { insertAssignment } from '../../support/assignment-rows';
import { RevocationHarness } from '../../support/revocation-harness';
import { carry, nextPeriod } from '../../support/subscription-periods';

const h = new RevocationHarness();

interface Seats {
  kind: 'SEATS';
  purchased: number | null;
  assigned: number;
  free: number | null;
  revoking: number;
}

/**
 * What a plan with more than one subscription holds (`stockSummaryList`, `QĐ-111n`), on real PostgreSQL: the period that runs and the next
 * one recorded ahead of its start, and two subscriptions of one plan that two IT Admins answer for. `stock-summary.integration-spec.ts` has one
 * subscription for each plan, which cannot tell the subscriptions a plan is counted over from the ones it is not.
 */
describe('the stock of a plan with several subscriptions, over HTTP (integration, real PostgreSQL)', () => {
  let itTwo: string;
  let itTwoAccount: ApiAccount;
  const plans = { ahead: '', takenOver: '', draft: '', answered: '' };
  const subs = { ahead: ['', ''], takenOver: ['', ''], draft: ['', ''], answered: ['', ''] };

  const stockOf = async (
    planId: string,
    query: Record<string, string> = {},
    account: ApiAccount = h.it1,
  ): Promise<Seats | undefined> => {
    const page = h.dataOf<{ items: { plan: { planId: string }; stock: Seats }[] }>(
      await request(h.server())
        .get('/api/v1/stock-summary')
        .query({ planId, ...query })
        .set(h.as(account))
        .expect(200),
    );

    return page.items.find((row) => row.plan.planId === planId)?.stock;
  };
  const seatsOfRows = async (planId: string) =>
    h
      .dataOf<{ items: { id: string; seats: { purchased: number; assigned: number; free: number } }[] }>(
        await request(h.server()).get('/api/v1/subscriptions').query({ planId }).set(h.as(h.it1)).expect(200),
      )
      .items.map((row) => ({ id: row.id, ...row.seats }));

  /** A plan with its running period, four seats held by four people, and the next period recorded with the seats carried to it. */
  const withNextPeriod = async (status: 'ACTIVE' | 'DRAFT', startsOn: string): Promise<[string, string, string]> => {
    const running = await h.subscription(10, 'K2');
    const planId = await h.planOf(running);
    for (let index = 0; index < 4; index += 1) await insertAssignment(h, running, planId, '2026-02-01');
    const next = await nextPeriod(h, running, status, startsOn);
    if (status === 'ACTIVE') await carry(h, running, next, startsOn);

    return [planId, running, next];
  };

  beforeAll(async () => {
    await h.start();
    itTwo = await h.person('E-SPD-A1');
    itTwoAccount = await h.account('E-SPD-A1', itTwo, 'IT_ADMIN');

    // The next period begins in thirty days: the seats are carried to it, so they are on both periods until it runs.
    [plans.ahead, subs.ahead[0], subs.ahead[1]] = await withNextPeriod('ACTIVE', h.inDays(30));
    // The next period begins today: it has taken the plan over, the period that ran is not counted any more.
    [plans.takenOver, subs.takenOver[0], subs.takenOver[1]] = await withNextPeriod('ACTIVE', h.today());
    // The next period is still a draft: only the period that runs is counted.
    [plans.draft, subs.draft[0], subs.draft[1]] = await withNextPeriod('DRAFT', h.inDays(30));
    // Two periods of one plan that two IT Admins answer for: the second answers to the other IT Admin.
    [plans.answered, subs.answered[0], subs.answered[1]] = await withNextPeriod('ACTIVE', h.inDays(30));
    await h.ctx.sql.query(`UPDATE subscriptions SET responsible_it_admin_employee_id = $2 WHERE id = $1`, [
      subs.answered[1],
      itTwo,
    ]);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  describe('the period that runs and the next one recorded ahead of its start', () => {
    it('adds the two while the next has not begun: the seats carried to it are on both, one pool as the queue of grants counts it', async () => {
      expect(await stockOf(plans.ahead)).toEqual({ kind: 'SEATS', purchased: 20, assigned: 8, free: 12, revoking: 0 });
    });

    it('is the sum of the seats of the two subscriptions in GET /subscriptions and the stock the queue of grants reads', async () => {
      const rows = await seatsOfRows(plans.ahead);
      const pool = (await h.ctx.app.get(LicensingPoolStockApi).getStockOfPlans([plans.ahead])).get(plans.ahead);

      expect(rows.map((row) => row.id).sort()).toEqual([...subs.ahead].sort());
      expect(rows.reduce((sum, row) => sum + row.purchased, 0)).toBe(20);
      expect(rows.reduce((sum, row) => sum + row.assigned, 0)).toBe(8);
      expect(rows.reduce((sum, row) => sum + row.free, 0)).toBe(12);
      expect(pool).toMatchObject({ kind: 'SEATS', free: 12, inRevocation: 0 });
    });

    it('counts only the next period once it has begun: the period it continues is taken over', async () => {
      expect(await stockOf(plans.takenOver)).toEqual({
        kind: 'SEATS',
        purchased: 10,
        assigned: 4,
        free: 6,
        revoking: 0,
      });
    });

    it('leaves out a next period that is still a draft', async () => {
      expect(await stockOf(plans.draft)).toEqual({ kind: 'SEATS', purchased: 10, assigned: 4, free: 6, revoking: 0 });
    });
  });

  describe('mine, with two subscriptions of a plan that two IT Admins answer for', () => {
    it('counts for each IT Admin only the subscription they answer for, and for nobody in particular both', async () => {
      expect(await stockOf(plans.answered, { mine: 'true' })).toEqual({
        kind: 'SEATS',
        purchased: 10,
        assigned: 4,
        free: 6,
        revoking: 0,
      });
      expect(await stockOf(plans.answered, { mine: 'true' }, itTwoAccount)).toEqual({
        kind: 'SEATS',
        purchased: 10,
        assigned: 4,
        free: 6,
        revoking: 0,
      });
      expect(await stockOf(plans.answered)).toEqual({
        kind: 'SEATS',
        purchased: 20,
        assigned: 8,
        free: 12,
        revoking: 0,
      });
      expect(await stockOf(plans.answered, { mine: 'false' }, itTwoAccount)).toMatchObject({ purchased: 20 });
    });

    it('does not list the plan for an IT Admin who answers for none of its subscriptions', async () => {
      expect(await stockOf(plans.ahead, { mine: 'true' }, itTwoAccount)).toBeUndefined();
      expect(await stockOf(plans.ahead, { mine: 'true' })).toMatchObject({ purchased: 20 });
    });
  });
});
