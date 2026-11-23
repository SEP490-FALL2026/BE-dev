import request from 'supertest';
import { RenewalHarness, type RenewalUnit } from '../../support/renewal-harness';
import { takeOwnerOff } from '../../support/shared-pool-subscription';

const h = new RenewalHarness();

/**
 * EP-11 on real PostgreSQL, the part of the hourly pass that decides WHO is told and from WHICH date (`SBF-20` §4.5, `QĐ-111g`, `BB-9`): the IT Admin
 * responsible for the subscription before the one in charge of its department, the first usable IT Admin of the company when neither is, and a deadline
 * to cancel that the contract does not state but the days of notice give (`US-04-03` AC-2). The point of adjustment and the alert are the IT Admin's;
 * the red alert is the IT Admin's and Finance's (`SBF-20` §13). Every date is counted from today.
 */
describe('who the pass tells and from which date (integration, real PostgreSQL)', () => {
  let unit: RenewalUnit;

  /** A plan by the year of the unit whose deadline to cancel is `deadlineInDays` from today and whose renewal day is 64 days from today. */
  const year = (deadlineInDays: number) =>
    h.termWithSeats(unit, deadlineInDays, { quantity: 10, startDate: h.inDays(-300), endDate: h.inDays(64) });

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    unit = await h.unit(2);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const recipients = async (code: string, subscriptionId: string) =>
    (await h.notices(code, subscriptionId)).map((row) => row.recipient_employee_id).sort();
  const sorted = (...ids: string[]) => [...ids].sort();
  const setResponsible = (subscriptionId: string, employeeId: string | null) =>
    h.ctx.sql.query(`UPDATE subscriptions SET responsible_it_admin_employee_id = $2 WHERE id = $1`, [
      subscriptionId,
      employeeId,
    ]);

  describe('the IT Admin of the period (QĐ-111g, BB-9)', () => {
    /** The subscription of a unit whose deadline is in 20 days, so its point has come today; `responsible` is the IT Admin named for it. */
    const alertedWhenResponsibleIs = async (responsible: string | null): Promise<string[]> => {
      const { subscriptionId } = await year(20);
      await setResponsible(subscriptionId, responsible);
      await h.sweepOn(h.today());

      return recipients('SUBSCRIPTION_RENEWAL_ALERT', subscriptionId);
    };

    it('tells the IT Admin responsible for the subscription instead of the one in charge of the department, alone, and Finance joins them at the red alert', async () => {
      const responsible = await h.account('E-IT-ROUTE', await h.person('E-IT-ROUTE'), 'IT_ADMIN');
      const { subscriptionId } = await year(20);
      await setResponsible(subscriptionId, responsible.employeeId);

      await h.sweepOn(h.today());
      expect(await recipients('SUBSCRIPTION_RENEWAL_ALERT', subscriptionId)).toEqual([responsible.employeeId]);

      await h.sweepOn(h.inDays(13));
      expect(await recipients('SUBSCRIPTION_RENEWAL_RED_ALERT', subscriptionId)).toEqual(
        sorted(responsible.employeeId, h.finance.employeeId),
      );
      expect(await recipients('SUBSCRIPTION_RENEWAL_ALERT', subscriptionId)).toEqual([responsible.employeeId]);
    });

    it('falls back to the usable Super Admin when none is named, or the one named is locked or has left (no department takes part)', async () => {
      const responsible = await h.account('E-IT-FALL', await h.person('E-IT-FALL'), 'IT_ADMIN');
      const superAdminId = h.seed.superAdmin.employeeId;

      expect(await alertedWhenResponsibleIs(responsible.employeeId)).toEqual([responsible.employeeId]);
      expect(await alertedWhenResponsibleIs(null)).toEqual([superAdminId]);

      await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE employee_id = $1`, [responsible.employeeId]);
      try {
        expect(await alertedWhenResponsibleIs(responsible.employeeId)).toEqual([superAdminId]);
      } finally {
        await h.ctx.sql.query(`UPDATE app_users SET status = 'ACTIVE' WHERE employee_id = $1`, [
          responsible.employeeId,
        ]);
      }
      // Left the company, the account not locked yet: no longer usable either.
      await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [responsible.employeeId]);
      try {
        expect(await alertedWhenResponsibleIs(responsible.employeeId)).toEqual([superAdminId]);
      } finally {
        await h.ctx.sql.query(`UPDATE employees SET status = 'ACTIVE' WHERE id = $1`, [responsible.employeeId]);
      }
    });

    it('tells the one named, and else the usable Super Admin, for a subscription of the stock that no department owns', async () => {
      const responsible = await h.account('E-IT-STOCK', await h.person('E-IT-STOCK'), 'IT_ADMIN');
      const stock = async (named: string | null): Promise<string> => {
        const { subscriptionId } = await year(20);
        await takeOwnerOff(h, subscriptionId);
        await setResponsible(subscriptionId, named);

        return subscriptionId;
      };
      const named = await stock(responsible.employeeId);
      const unnamed = await stock(null);

      await h.sweepOn(h.today());

      expect(await recipients('SUBSCRIPTION_RENEWAL_ALERT', named)).toEqual([responsible.employeeId]);
      const told = await recipients('SUBSCRIPTION_RENEWAL_ALERT', unnamed);
      expect(told).toEqual([h.seed.superAdmin.employeeId]);
      // Nobody else is told the point: Finance, the spending approver and the head of no department included.
      for (const nobody of [h.finance.employeeId, h.boss.employeeId, unit.head.employeeId]) {
        expect(told).not.toContain(nobody);
      }
    });
  });

  describe('a deadline to cancel that the contract does not state (US-04-03 AC-2)', () => {
    /** The reading of the subscription as the IT Admin has it, which says where its deadline comes from. */
    const noticeOf = async (subscriptionId: string) =>
      h.dataOf<{ noticeDeadline: { value: string; source: string } }>(
        await request(h.server()).get(`/api/v1/subscriptions/${subscriptionId}`).set(h.as(h.it1)).expect(200),
      ).noticeDeadline;

    it('counts the point and the red alert from the renewal day minus the days of notice, says the deadline is inferred, and tells nothing from the renewal day itself', async () => {
      // Renewal in 80 days, 30 days of notice: the deadline is in 50, the point (30 days before it) in 20 and the red alert (7 before it) in 43.
      const subscriptionId = await h.term({
        quantity: 10,
        startDate: h.inDays(-285),
        renewalDate: h.inDays(80),
        noticePeriodDays: 30,
        autoRenew: true,
      });
      await h.seatOf(unit.members[0], { subscriptionId });
      await h.seatOf(unit.members[1], { subscriptionId });
      const deadline = h.inDays(50);

      expect(await noticeOf(subscriptionId)).toEqual({ value: deadline, source: 'INFERRED_UNCONFIRMED' });

      await h.sweepOn(h.inDays(19));
      expect(await h.notices('SUBSCRIPTION_RENEWAL_ALERT', subscriptionId)).toEqual([]);
      await h.sweepOn(h.inDays(20));
      await h.sweepOn(h.inDays(20));

      const alert = await h.notices('SUBSCRIPTION_RENEWAL_ALERT', subscriptionId);
      expect(alert.map((row) => row.recipient_employee_id)).toEqual([h.it1.employeeId]);
      expect(alert[0].params).toMatchObject({ commitment: 'ANNUAL', baseDate: deadline, renewalOn: h.inDays(80) });
      expect(alert[0].event_key).toBe(`subscription-adjustment-point:${subscriptionId}:${deadline}`);

      await h.sweepOn(h.inDays(42));
      expect(await h.notices('SUBSCRIPTION_RENEWAL_RED_ALERT', subscriptionId)).toEqual([]);
      await h.sweepOn(h.inDays(43));
      const red = await h.notices('SUBSCRIPTION_RENEWAL_RED_ALERT', subscriptionId);
      expect(red.map((row) => row.recipient_employee_id).sort()).toEqual(
        sorted(h.it1.employeeId, h.finance.employeeId),
      );
      expect(red[0].event_key).toBe(`subscription-renewal-red:${subscriptionId}:${deadline}`);

      // Nothing is counted from the renewal day, nothing is warned of, and no event is made before it passes.
      await h.sweepOn(h.inDays(79));
      await h.sweepOn(h.inDays(80));
      const all = await h.ctx.sql.query<{ code: string; event_key: string }>(
        `SELECT code, event_key FROM in_app_notifications WHERE subject_id = $1`,
        [subscriptionId],
      );
      expect(all.rows.map((row) => row.code).sort()).toEqual(
        ['SUBSCRIPTION_RENEWAL_ALERT', 'SUBSCRIPTION_RENEWAL_RED_ALERT', 'SUBSCRIPTION_RENEWAL_RED_ALERT'].sort(),
      );
      for (const row of all.rows) expect(row.event_key).toContain(`:${deadline}`);
      const events = await h.ctx.sql.query(`SELECT 1 FROM subscription_deadline_events WHERE subscription_id = $1`, [
        subscriptionId,
      ]);
      expect(events.rows).toEqual([]);
    });
  });
});
