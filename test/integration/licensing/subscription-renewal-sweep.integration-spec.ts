import { addDays } from '../../../src/core/business-date';
import { addMonths } from '../../../src/core/fiscal-year';
import { RenewalHarness, type RenewalUnit } from '../../support/renewal-harness';

const h = new RenewalHarness();

/**
 * EP-11 on real PostgreSQL: the hourly pass over the points of adjustment of the K2 subscriptions (`SBF-20` §4.5, S20-T6), run by hand as if it
 * were a given day — who is told the point came, the red alert of a plan by the year, the seats a plan by the month keeps, the incident or the
 * end of a period whose renewal day passed with no outcome recorded, the warnings of missing data. Nothing here renews, cancels or decides anything.
 */
describe('the pass over the points of adjustment (integration, real PostgreSQL)', () => {
  let unit: RenewalUnit;
  let superAdmin: string;

  /** A plan by the year whose deadline to cancel is `deadlineInDays` from today and whose renewal day is 64 days from today. */
  const year = (deadlineInDays: number, extra: Record<string, unknown> = {}) =>
    h.termWithSeats(unit, deadlineInDays, { quantity: 10, startDate: h.inDays(-300), endDate: h.inDays(64), ...extra });

  /** The year the vendor confirmed after `year()`: it starts the day after the renewal day, 65 days from today. */
  const nextYear = (quantity: number) => ({
    purchasedQuantity: quantity,
    unitPrice: { amount: '1000000', currency: 'VND' },
    billingCycle: 'ANNUAL',
    startDate: h.inDays(65),
    endDate: h.inDays(429),
    noticeDeadline: h.inDays(400),
    autoRenew: true,
    allowsMidTermReduction: false,
  });

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    unit = await h.unit(2);
    superAdmin = h.seed.superAdmin.employeeId;
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const told = async (code: string, subscriptionId: string) =>
    (await h.notices(code, subscriptionId)).map((row) => row.recipient_employee_id).sort();
  const sorted = (...ids: string[]) => [...ids].sort();
  const deadlineEventOf = async (subscriptionId: string) =>
    (
      await h.ctx.sql.query<{ kind: string; notice_base_date: string; auto_renew_at_time: boolean }>(
        `SELECT kind::text, to_char(notice_base_date, 'YYYY-MM-DD') AS notice_base_date, auto_renew_at_time
           FROM subscription_deadline_events WHERE subscription_id = $1`,
        [subscriptionId],
      )
    ).rows;
  const auditOf = async (subscriptionId: string, action: string) =>
    (await h.auditOf('Subscription', subscriptionId)).filter((event) => event.action === action);

  describe('the point of adjustment of a plan by the year', () => {
    it('tells the IT Admin in charge alone, once, from the point, with the seats the next period needs', async () => {
      const { subscriptionId } = await year(20);

      await h.sweepOn(h.today());
      await h.sweepOn(h.today());
      await h.sweepOn(h.inDays(1));

      const rows = await h.notices('SUBSCRIPTION_RENEWAL_ALERT', subscriptionId);
      expect(rows.map((row) => row.recipient_employee_id)).toEqual([h.it1.employeeId]);
      expect(rows[0].event_key).toBe(`subscription-adjustment-point:${subscriptionId}:${h.inDays(20)}`);
      expect(rows[0].params).toEqual({
        subscriptionId,
        renewalId: null,
        baseDate: h.inDays(20),
        renewalOn: h.inDays(64),
        seatsNeeded: 2,
        commitment: 'ANNUAL',
      });
      const people = rows.map((row) => row.recipient_employee_id);
      for (const nobody of [h.finance.employeeId, h.boss.employeeId, superAdmin, unit.head.employeeId]) {
        expect(people).not.toContain(nobody);
      }
      expect(await auditOf(subscriptionId, 'SUBSCRIPTION_RENEWAL.ALERT_SENT')).toHaveLength(1);
      expect(await h.notices('SUBSCRIPTION_RENEWAL_RED_ALERT', subscriptionId)).toEqual([]);
    });

    it('tells nothing before the point', async () => {
      const { subscriptionId } = await year(40);

      await h.sweepOn(h.today());
      await h.sweepOn(h.inDays(9));
      expect(await h.notices('SUBSCRIPTION_RENEWAL_ALERT', subscriptionId)).toEqual([]);

      await h.sweepOn(h.inDays(10));
      expect(await told('SUBSCRIPTION_RENEWAL_ALERT', subscriptionId)).toEqual([h.it1.employeeId]);
    });

    it('raises the red alert for the IT Admin and Finance 7 days before the deadline, not for the spending approver', async () => {
      const { subscriptionId } = await year(20);

      await h.sweepOn(h.inDays(12));
      expect(await h.notices('SUBSCRIPTION_RENEWAL_RED_ALERT', subscriptionId)).toEqual([]);
      await h.sweepOn(h.inDays(13));
      await h.sweepOn(h.inDays(14));

      const rows = await h.notices('SUBSCRIPTION_RENEWAL_RED_ALERT', subscriptionId);
      expect(rows.map((row) => row.recipient_employee_id).sort()).toEqual(
        sorted(h.it1.employeeId, h.finance.employeeId),
      );
      expect(rows[0].event_key).toBe(`subscription-renewal-red:${subscriptionId}:${h.inDays(20)}`);
      expect(rows[0].params).toEqual({
        subscriptionId,
        baseDate: h.inDays(20),
        renewalOn: h.inDays(64),
        seatsNeeded: 2,
      });
      expect(await told('SUBSCRIPTION_RENEWAL_ALERT', subscriptionId)).toEqual([h.it1.employeeId]);
    });

    it('tells nothing once the IT Admin has recorded the period, and nothing past its renewal day either', async () => {
      const { subscriptionId } = await year(20);
      await h
        .propose({
          subscriptionId,
          choice: 'REDUCE',
          proposedQuantity: 2,
          outcome: 'AS_DECIDED',
          nextPeriod: nextYear(2),
        })
        .expect(201);

      await h.sweepOn(h.inDays(13));
      await h.sweepOn(h.inDays(65));

      expect(await h.notices('SUBSCRIPTION_RENEWAL_ALERT', subscriptionId)).toEqual([]);
      expect(await h.notices('SUBSCRIPTION_RENEWAL_RED_ALERT', subscriptionId)).toEqual([]);
      expect(await deadlineEventOf(subscriptionId)).toEqual([]);
    });
  });

  describe('the renewal day passed with no outcome recorded', () => {
    it('records one incident for a period that renews itself: the IT Admin, Finance and the spending approver are told', async () => {
      const { subscriptionId } = await year(20, { autoRenew: true });

      await h.sweepOn(h.inDays(64));
      expect(await deadlineEventOf(subscriptionId)).toEqual([]);
      await h.sweepOn(h.inDays(65));
      await h.sweepOn(h.inDays(65));
      await h.sweepOn(h.inDays(66));

      expect(await deadlineEventOf(subscriptionId)).toEqual([
        { kind: 'AUTO_RENEWAL_INCIDENT', notice_base_date: h.inDays(64), auto_renew_at_time: true },
      ]);
      const rows = await h.notices('SUBSCRIPTION_AUTO_RENEWAL_INCIDENT', subscriptionId);
      expect(rows.map((row) => row.recipient_employee_id).sort()).toEqual(
        sorted(h.it1.employeeId, h.finance.employeeId, h.boss.employeeId),
      );
      expect(rows[0].params).toMatchObject({
        subscriptionId,
        baseDate: h.inDays(64),
      });
      expect(typeof rows[0].params.renewalId).toBe('string');
      expect(rows[0].event_key).toBe(`subscription-incident:${subscriptionId}:${h.inDays(64)}`);
      const audit = await auditOf(subscriptionId, 'SUBSCRIPTION.AUTO_RENEWAL_INCIDENT');
      expect(audit).toHaveLength(1);
      expect(audit[0].after).toMatchObject({
        baseDate: h.inDays(64),
        autoRenew: true,
        reason: 'NO_OUTCOME_BY_RENEWAL_DAY',
      });
      const list = h.dataOf<{ items: { subscription: { id: string }; kind: string }[] }>(
        await h.deadlineEvents('?kind=AUTO_RENEWAL_INCIDENT', h.boss.account).expect(200),
      );
      expect(list.items.filter((item) => item.subscription.id === subscriptionId)).toHaveLength(1);
    });

    it('marks a period that does not renew itself as expired without renewal: the IT Admin and Finance are told, not the approver', async () => {
      const { subscriptionId } = await year(20, { autoRenew: false });

      await h.sweepOn(h.inDays(65));

      expect(await deadlineEventOf(subscriptionId)).toEqual([
        { kind: 'EXPIRY_MARKED', notice_base_date: h.inDays(64), auto_renew_at_time: false },
      ]);
      expect(await told('SUBSCRIPTION_EXPIRY_MARKED', subscriptionId)).toEqual(
        sorted(h.it1.employeeId, h.finance.employeeId),
      );
      expect(await h.notices('SUBSCRIPTION_AUTO_RENEWAL_INCIDENT', subscriptionId)).toEqual([]);
      expect(await auditOf(subscriptionId, 'SUBSCRIPTION.EXPIRY_MARKED')).toHaveLength(1);
    });

    it('records nothing when no seat is held, nor for a period recorded in time, nor once the pass no longer looks back', async () => {
      const empty = await h.term({
        quantity: 10,
        startDate: h.inDays(-300),
        noticeDeadline: h.inDays(20),
        endDate: h.inDays(64),
        autoRenew: true,
      });
      const recorded = await year(20, { autoRenew: true });
      await h
        .propose({
          subscriptionId: recorded.subscriptionId,
          choice: 'REDUCE',
          proposedQuantity: 2,
          outcome: 'AS_DECIDED',
          nextPeriod: nextYear(2),
        })
        .expect(201);

      await h.sweepOn(h.inDays(65));
      expect(await deadlineEventOf(empty)).toEqual([]);
      expect(await deadlineEventOf(recorded.subscriptionId)).toEqual([]);

      // 60 days past the renewal day the pass still looks; one day later it leaves a period it never saw alone.
      const old = await year(20, { autoRenew: true });
      await h.sweepOn(h.inDays(125));
      expect(await deadlineEventOf(old.subscriptionId)).toEqual([]);
    });

    it('marks the end of a plan by the month that does not renew itself once its end date has passed', async () => {
      const subscriptionId = await h.term({
        quantity: 10,
        billingCycle: 'MONTHLY',
        startDate: h.inDays(-60),
        renewalDate: h.inDays(4),
        endDate: h.inDays(3),
        autoRenew: false,
      });
      await h.seatOf(unit.members[0], { subscriptionId });

      await h.sweepOn(h.inDays(3));
      expect(await deadlineEventOf(subscriptionId)).toEqual([]);
      await h.sweepOn(h.inDays(4));

      expect(await deadlineEventOf(subscriptionId)).toEqual([
        { kind: 'EXPIRY_MARKED', notice_base_date: h.inDays(3), auto_renew_at_time: false },
      ]);
      expect(await told('SUBSCRIPTION_EXPIRY_MARKED', subscriptionId)).toEqual(
        sorted(h.it1.employeeId, h.finance.employeeId),
      );
    });
  });

  describe('a plan by the month', () => {
    it('is told the point, then on its payment day that it keeps seats it does not need, the IT Admin alone', async () => {
      const subscriptionId = await h.term({
        quantity: 10,
        billingCycle: 'MONTHLY',
        startDate: h.inDays(-60),
        renewalDate: h.inDays(5),
        autoRenew: true,
      });
      await h.seatOf(unit.members[0], { subscriptionId });
      await h.seatOf(unit.members[1], { subscriptionId });

      await h.sweepOn(h.inDays(-3));
      expect(await h.notices('SUBSCRIPTION_RENEWAL_ALERT', subscriptionId)).toEqual([]);
      await h.sweepOn(h.inDays(-2));
      await h.sweepOn(h.inDays(4));
      expect(await h.notices('SUBSCRIPTION_RENEWAL_KEPT', subscriptionId)).toEqual([]);
      await h.sweepOn(h.inDays(5));
      await h.sweepOn(h.inDays(5));

      const alert = await h.notices('SUBSCRIPTION_RENEWAL_ALERT', subscriptionId);
      expect(alert.map((row) => row.recipient_employee_id)).toEqual([h.it1.employeeId]);
      expect(alert[0].params).toMatchObject({ commitment: 'MONTHLY', baseDate: h.inDays(5), renewalOn: h.inDays(5) });
      const kept = await h.notices('SUBSCRIPTION_RENEWAL_KEPT', subscriptionId);
      expect(kept.map((row) => row.recipient_employee_id)).toEqual([h.it1.employeeId]);
      expect(kept[0].params).toEqual({
        subscriptionId,
        renewalOn: h.inDays(5),
        purchasedQuantity: 10,
        seatsNeeded: 2,
      });
      expect(kept[0].event_key).toBe(`subscription-renewal-kept:${subscriptionId}:${h.inDays(5)}`);
      // No red alert for a plan by the month, and no incident: its end rolls on.
      expect(await h.notices('SUBSCRIPTION_RENEWAL_RED_ALERT', subscriptionId)).toEqual([]);
      expect(await deadlineEventOf(subscriptionId)).toEqual([]);
    });
  });

  describe('a plan by the month that names only its end date (R-1)', () => {
    /** The payment day by the oldest rule that needs no clock: the day of the grid counted back from `anchor` that is the earliest not before `from`. */
    const paymentDayFrom = (anchor: string, from: string): string => {
      let day = anchor;
      for (let back = 1; addMonths(anchor, -back) >= from; back += 1) day = addMonths(anchor, -back);

      return day;
    };

    it('counts its payment day from the end date back to the nearest one that is not before today, so its point opens every month and not only before the end', async () => {
      const endDate = h.inDays(70);
      const due = paymentDayFrom(endDate, h.today());
      expect(due < endDate).toBe(true);
      const subscriptionId = await h.term({
        quantity: 10,
        billingCycle: 'MONTHLY',
        startDate: h.inDays(-60),
        endDate,
        autoRenew: true,
      });
      await h.seatOf(unit.members[0], { subscriptionId });
      await h.seatOf(unit.members[1], { subscriptionId });

      await h.sweepOn(addDays(due, -8));
      expect(await h.notices('SUBSCRIPTION_RENEWAL_ALERT', subscriptionId)).toEqual([]);
      await h.sweepOn(addDays(due, -7));
      await h.sweepOn(due);

      const alert = await h.notices('SUBSCRIPTION_RENEWAL_ALERT', subscriptionId);
      expect(alert.map((row) => row.recipient_employee_id)).toEqual([h.it1.employeeId]);
      expect(alert[0].params).toMatchObject({ commitment: 'MONTHLY', baseDate: due, renewalOn: due });
      expect(alert[0].event_key).toBe(`subscription-adjustment-point:${subscriptionId}:${due}`);
      const kept = await h.notices('SUBSCRIPTION_RENEWAL_KEPT', subscriptionId);
      expect(kept.map((row) => row.recipient_employee_id)).toEqual([h.it1.employeeId]);
      expect(kept[0].event_key).toBe(`subscription-renewal-kept:${subscriptionId}:${due}`);
      expect(await deadlineEventOf(subscriptionId)).toEqual([]);
    });
  });

  describe('the first payment day of a plan by the month comes after its start day (V-1)', () => {
    it('tells nothing on the day a plan is declared to start today, the day it began is not a day of renewal', async () => {
      // Paid on the same day of the month as it starts: the grid of its renewal day holds the start day itself one month back.
      const subscriptionId = await h.term({
        quantity: 10,
        billingCycle: 'MONTHLY',
        startDate: h.today(),
        renewalDate: addMonths(h.today(), 1),
        autoRenew: true,
      });
      await h.seatOf(unit.members[0], { subscriptionId });

      await h.sweepOn(h.today());
      await h.sweepOn(h.today());
      await h.sweepOn(h.inDays(1));

      expect(await h.notices('SUBSCRIPTION_RENEWAL_ALERT', subscriptionId)).toEqual([]);
      expect(await h.notices('SUBSCRIPTION_RENEWAL_KEPT', subscriptionId)).toEqual([]);
    });
  });

  describe('the data a period lacks', () => {
    it('warns the IT Admin once that a period with no date gives no point to alert from', async () => {
      const undated = await h.term({ autoRenew: true });

      await h.sweepOn(h.today());
      await h.sweepOn(h.today());

      expect(await h.notices('SUBSCRIPTION_RENEWAL_ALERT', undated)).toEqual([]);
      const warned = await h.notices('SUBSCRIPTION_RENEWAL_DATA_QUALITY', undated);
      expect(warned.map((row) => [row.recipient_employee_id, row.params.problem])).toEqual([
        [h.it1.employeeId, 'NO_ALERT_ANCHOR'],
      ]);
      expect(await auditOf(undated, 'SUBSCRIPTION_RENEWAL.DATA_QUALITY_WARNED')).toHaveLength(1);
    });

    it('warns once that a plan by the year counted from its renewal date has no deadline to cancel', async () => {
      const byRenewalDate = await h.term({
        startDate: h.inDays(-300),
        renewalDate: h.inDays(60),
        autoRenew: true,
      });

      await h.sweepOn(h.today());
      await h.sweepOn(h.today());

      const warned = await h.notices('SUBSCRIPTION_RENEWAL_DATA_QUALITY', byRenewalDate);
      expect(warned.map((row) => [row.recipient_employee_id, row.params.problem])).toEqual([
        [h.it1.employeeId, 'NO_NOTICE_DEADLINE'],
      ]);
    });
  });

  describe('what has no point of adjustment', () => {
    it('never alerts, warns nor records anything for a perpetual purchase or for a plan that is not a pool of seats (FR-1.12(9))', async () => {
      const perpetual = await h.perpetual();
      const licensed = await h.term({
        type: 'K1',
        billingCycle: 'MONTHLY',
        startDate: h.inDays(-60),
        renewalDate: h.inDays(10),
        autoRenew: true,
      });

      await h.sweepOn(h.inDays(13));
      await h.sweepOn(h.inDays(65));

      for (const subscriptionId of [perpetual, licensed]) {
        for (const code of [
          'SUBSCRIPTION_RENEWAL_ALERT',
          'SUBSCRIPTION_RENEWAL_RED_ALERT',
          'SUBSCRIPTION_RENEWAL_DATA_QUALITY',
          'SUBSCRIPTION_AUTO_RENEWAL_INCIDENT',
        ]) {
          expect(await h.notices(code, subscriptionId)).toEqual([]);
        }
        expect(await deadlineEventOf(subscriptionId)).toEqual([]);
      }
    });
  });
});
