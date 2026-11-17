import { randomUUID } from 'node:crypto';
import { RenewalHarness, type RenewalUnit } from '../../support/renewal-harness';

const h = new RenewalHarness();

interface DetailWire {
  id: string;
  state: string;
  waitingReason: string | null;
  proposal: { choice: string; quantity: number | null };
  decision: {
    choice: string;
    deciderRole: string;
    decidedAfterDeadline: boolean;
    executionPoint: string;
    snapshot: { source: string } | null;
  } | null;
  outcomeDetail: { lateRenewal: boolean; nextSubscriptionId: string | null } | null;
}

/**
 * EP-11 on real PostgreSQL: who may record and read a renewal and what is refused before anything is written (`SBF-20` §4.4, §4.6): the
 * IT Admin and Finance read every case, a head only the cases of their department (`QĐ-94d`(2), SoD-2), nobody waits for a head or a Cost
 * Center any more, a late renewal is recorded as late and never voided, the decision is final once recorded, and the refusals of the
 * shape of the write (no point, no date, a quantity that does not fit, a field the route does not know) leave no case behind.
 */
describe('who records and reads a renewal and what is refused (integration, real PostgreSQL)', () => {
  const year = () => ({ startDate: h.inDays(-300), endDate: h.inDays(64) });
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
  const closure = { dataExported: true, adminsTransferred: true };

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const detail = async (id: string, account = h.it1) =>
    h.dataOf<{ renewal: DetailWire }>(await h.read(id, account).expect(200)).renewal;
  /** A year of a unit at its point of adjustment, bought as many seats as its people hold, and its renewal as it is recorded. */
  const renewed = async (unit: RenewalUnit) => {
    const { subscriptionId } = await h.termWithSeats(unit, 20, { quantity: unit.members.length, ...year() });

    return h.recordedRenewal({
      subscriptionId,
      choice: 'RENEW',
      proposedQuantity: unit.members.length,
      outcome: 'AS_DECIDED',
      nextPeriod: nextYear(unit.members.length),
    });
  };

  describe('who reads the cases (QĐ-94d(2), SoD-2)', () => {
    it('gives the IT Admin and Finance every case, a head only the cases of their department, and the others none', async () => {
      const unit = await h.unit(1);
      const other = await h.unit(1);
      const mine = await renewed(unit);
      const theirs = await renewed(other);
      const idsOf = async (account: typeof h.it1) =>
        h
          .dataOf<{ items: { id: string }[] }>(await h.renewals('?pageSize=100', account).expect(200))
          .items.map((item) => item.id);

      expect(await idsOf(h.it1)).toEqual(expect.arrayContaining([mine.id, theirs.id]));
      expect(await idsOf(h.finance)).toEqual(expect.arrayContaining([mine.id, theirs.id]));
      const headSees = await idsOf(unit.head.account);
      expect(headSees).toContain(mine.id);
      expect(headSees).not.toContain(theirs.id);
      await h.read(mine.id, unit.head.account).expect(200);
      expect(h.codeOf(await h.read(theirs.id, unit.head.account).expect(404))).toBe('SUBSCRIPTION_RENEWAL.NOT_FOUND');
      for (const account of [h.boss.account, h.employee, unit.members[0].account, h.bystander.account]) {
        expect(h.codeOf(await h.renewals('', account).expect(403))).toBe('SUBSCRIPTION_RENEWAL.READ_FORBIDDEN');
        expect(h.codeOf(await h.read(mine.id, account).expect(403))).toBe('SUBSCRIPTION_RENEWAL.READ_FORBIDDEN');
      }
    });

    it('shows the head the holder by code and name and no email, and proposes no seat to take back; Finance does not read the seats', async () => {
      const seatUnit = await h.unit(3);
      const { subscriptionId } = await h.termWithSeats(seatUnit, 20, { quantity: 5, ...year() });
      const { id } = await h.recordedRenewal({
        subscriptionId,
        choice: 'REDUCE',
        proposedQuantity: 3,
        outcome: 'AS_DECIDED',
        nextPeriod: nextYear(3),
      });
      type Ranking = {
        items: {
          assignmentId: string;
          employee: Record<string, unknown>;
          lastActivityOn: string | null;
          inProposal: boolean;
        }[];
        pagination: { totalItems: number };
      };

      const all = h.dataOf<Ranking>(await h.ranking(id, seatUnit.head.account).expect(200));
      const proposed = h.dataOf<Ranking>(await h.ranking(id, seatUnit.head.account, '?proposedOnly=true').expect(200));

      expect(all.pagination.totalItems).toBe(3);
      // The system counts the seats: no seat is chosen for a reduction any more (the route is deprecated).
      expect(all.items.some((item) => item.inProposal)).toBe(false);
      expect(proposed.items).toEqual([]);
      for (const item of all.items) {
        expect(Object.keys(item.employee).sort()).toEqual(['employeeCode', 'fullName', 'id']);
        expect(item.lastActivityOn).toBeNull();
      }
      expect(JSON.stringify(all)).not.toMatch(/@acme\.vn/);
      expect(h.codeOf(await h.ranking(id, h.finance).expect(403))).toBe('SUBSCRIPTION_RENEWAL.READ_FORBIDDEN');
      const otherHead = (await h.unit(1)).head.account;
      expect(h.codeOf(await h.ranking(id, otherHead).expect(404))).toBe('SUBSCRIPTION_RENEWAL.NOT_FOUND');
    });

    it('shows Finance the snapshot of the decision and hides it from the IT Admin who decided it (L-617)', async () => {
      const { id } = await renewed(await h.unit(1));

      expect((await detail(id, h.it1)).decision?.snapshot).toBeNull();
      expect((await detail(id, h.finance)).decision?.snapshot).toMatchObject({ source: 'NOT_CONNECTED' });
    });
  });

  describe('the decision of the IT Admin in charge, written once', () => {
    it('is final the day it is recorded: its role, its snapshot, no waiting for anybody and no budget commitment', async () => {
      const unit = await h.unit(1);
      const commitmentsBefore = await h.count('budget_commitments');

      const { id } = await renewed(unit);

      expect(await detail(id)).toMatchObject({
        state: 'OUTCOME_RECORDED',
        waitingReason: null,
        proposal: { choice: 'RENEW', quantity: 1 },
        decision: { choice: 'RENEW', deciderRole: 'IT_ADMIN_IN_CHARGE', executionPoint: 'AS_PLANNED' },
      });
      expect(await h.count('budget_commitments')).toBe(commitmentsBefore);
      await expect(
        h.ctx.sql.query(`UPDATE subscription_renewals SET decided_choice = 'CANCEL' WHERE id = $1`, [id]),
      ).rejects.toMatchObject({ constraint: 'subscription_renewals_decision_is_final' });
    });

    it('does not wait for a head or a Cost Center: a department with none is recorded at once and nobody is asked (QĐ-93c, QĐ-94m(2))', async () => {
      const bare = await h.bareDepartment();
      const subscriptionId = await h.term({
        ownerDepartmentId: bare.id,
        quantity: 10,
        ...year(),
        noticeDeadline: h.inDays(20),
      });

      const { id } = await h.recordedRenewal({ subscriptionId, choice: 'CANCEL', outcome: 'AS_DECIDED', closure });

      expect(await detail(id)).toMatchObject({ state: 'OUTCOME_RECORDED', waitingReason: null });
      expect(await h.notices('CONTROLLED_WAIT_ALERT', id)).toEqual([]);
      expect(await h.notices('SUBSCRIPTION_RENEWAL_PROPOSED', id)).toEqual([]);
    });

    it('never voids a result recorded after the renewal day: it is recorded as late and the decision is flagged (QĐ-98e)', async () => {
      const unit = await h.unit(1);
      // The deadline was 10 days ago and the renewal day 5 days ago; the seat is still held.
      const { subscriptionId } = await h.termWithSeats(unit, -10, {
        quantity: 1,
        startDate: h.inDays(-370),
        endDate: h.inDays(-5),
      });

      const { id } = await h.recordedRenewal({
        subscriptionId,
        choice: 'RENEW',
        proposedQuantity: 1,
        outcome: 'AS_DECIDED',
        nextPeriod: { ...nextYear(1), startDate: h.inDays(-5), endDate: h.inDays(359), noticeDeadline: h.inDays(330) },
      });

      expect(await detail(id)).toMatchObject({
        state: 'OUTCOME_RECORDED',
        decision: { decidedAfterDeadline: true, executionPoint: 'AS_PLANNED' },
        outcomeDetail: { lateRenewal: true },
      });
    });
  });

  describe('the refusals of the shape of the write leave no case behind', () => {
    const casesOf = async (subscriptionId: string) =>
      (await h.ctx.sql.query(`SELECT id FROM subscription_renewals WHERE subscription_id = $1`, [subscriptionId])).rows
        .length;

    it('refuses a subscription that has no point of adjustment, with the reason, and a period no date gives a point to', async () => {
      const unit = await h.unit(1);
      const dated = await h.termWithSeats(unit, 20, { quantity: 1, ...year() });
      const undated = await h.term({ ownerDepartmentId: unit.department.id, autoRenew: true });
      const draft = await h.draftSubscription();
      const perpetual = await h.perpetual();
      const withDepartment = await h.term({
        ownerDepartmentId: unit.department.id,
        type: 'K1',
        billingCycle: 'MONTHLY',
        ...year(),
      });
      const write = (subscriptionId: string) =>
        h.propose({ subscriptionId, choice: 'RENEW', proposedQuantity: 1, outcome: 'AS_DECIDED' });

      expect(h.codeOf(await write(undated).expect(409))).toBe('SUBSCRIPTION_RENEWAL.CONTRACT_DATA_INCOMPLETE');
      for (const [subscriptionId, reason] of [
        [draft, 'NOT_ACTIVE'],
        [perpetual, 'PERPETUAL'],
        [withDepartment, 'NOT_POOL_TERM'],
      ] as const) {
        const refused = await write(subscriptionId).expect(409);
        expect(h.codeOf(refused)).toBe('SUBSCRIPTION_RENEWAL.NOT_RENEWABLE');
        expect(h.detailsOf(refused)).toEqual({ reason });
        expect(await casesOf(subscriptionId)).toBe(0);
      }
      expect(
        h.codeOf(
          await h
            .propose({ subscriptionId: randomUUID(), choice: 'RENEW', proposedQuantity: 1, outcome: 'AS_DECIDED' })
            .expect(404),
        ),
      ).toBe('SUBSCRIPTION_RENEWAL.NOT_FOUND');
      expect(await casesOf(dated.subscriptionId)).toBe(0);
    });

    it('refuses a quantity that is not one of the choice and a field the route does not know (a seat to release)', async () => {
      const unit = await h.unit(3);
      const { subscriptionId, seats } = await h.termWithSeats(unit, 20, { quantity: 10, ...year() });
      const body = { subscriptionId, outcome: 'AS_DECIDED' };

      // A reduction to the quantity bought, a cancellation with a number and a raise to fewer: none of them is the choice it says.
      const same = await h.propose({ ...body, choice: 'REDUCE', proposedQuantity: 10 }).expect(422);
      expect(h.codeOf(same)).toBe('SUBSCRIPTION_RENEWAL.QUANTITY_INVALID');
      const cancel = await h.propose({ ...body, choice: 'CANCEL', proposedQuantity: 0, closure }).expect(422);
      expect(h.codeOf(cancel)).toBe('SUBSCRIPTION_RENEWAL.QUANTITY_INVALID');
      const raise = await h.propose({ ...body, choice: 'INCREASE', proposedQuantity: 3 }).expect(422);
      expect(h.codeOf(raise)).toBe('SUBSCRIPTION_RENEWAL.QUANTITY_INVALID');
      // The system counts the seats: a list of seats to release is no field of the route.
      const released = await h
        .propose({ ...body, choice: 'REDUCE', proposedQuantity: 3, releasedAssignmentIds: [seats[0]] })
        .expect(422);
      expect(h.codeOf(released)).toBe('VALIDATION_ERROR');
      expect(await casesOf(subscriptionId)).toBe(0);
      expect(await h.revocationReasons(seats)).toEqual([]);
    });
  });
});
