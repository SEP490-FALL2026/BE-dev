import request from 'supertest';
import { RenewalHarness, type RenewalUnit } from '../../support/renewal-harness';

const h = new RenewalHarness();

interface DetailWire {
  id: string;
  state: string;
  milestone: { basis: string; baseDate: string };
  usage: { status: string };
  period: { seatsInUse: number };
  proposal: { choice: string; quantity: number | null; businessOwnerOpinion: string | null };
  decision: {
    choice: string;
    deciderRole: string;
    decidedAfterDeadline: boolean;
    executionPoint: string;
    seatsInUseAtDecision: number;
    releasedSeatCount: number;
    snapshot: { source: string };
  } | null;
}

/**
 * EP-11 on real PostgreSQL: the proposal of the IT Admin (`US-11-05`) and the decision of the person who decides spending
 * (`US-11-02`) — who may do what (SoD), the queue, a cancellation in use, a reduction below the seats in use with the seats chosen
 * from the ranked list, the finance gate of a department without a Cost Center, the execution point of a late decision, the
 * frozen decision, and no budget commitment.
 */
describe('the proposal and the decision of a renewal (integration, real PostgreSQL)', () => {
  let unit: RenewalUnit;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    unit = await h.unit(3);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const detail = async (id: string) => h.dataOf<{ renewal: DetailWire }>(await h.read(id).expect(200)).renewal;

  describe('the proposal (US-11-05 AC-1, AC-3, AC-5 → AC-8, AC-15)', () => {
    it('puts the case in the queue of the decider, who is told, with the opinion the IT Admin recorded', async () => {
      const { subscriptionId } = await h.termWithSeats(unit, 20, { quantity: 10 });

      const response = await h
        .propose({
          subscriptionId,
          choice: 'REDUCE',
          proposedQuantity: 8,
          businessOwnerOpinion: 'Keep eight seats',
        })
        .expect(201);
      const renewal = h.dataOf<{ renewal: DetailWire }>(response).renewal;

      expect(renewal).toMatchObject({
        state: 'PROPOSED',
        milestone: { basis: 'DECLARED', baseDate: h.inDays(20) },
        usage: { status: 'NOT_AVAILABLE' },
        period: { seatsInUse: 3 },
        proposal: { choice: 'REDUCE', quantity: 8, businessOwnerOpinion: 'Keep eight seats' },
        decision: null,
      });
      const told = await h.notices('SUBSCRIPTION_RENEWAL_PROPOSED', renewal.id);
      expect(told.map((row) => row.recipient_employee_id)).toEqual([h.boss.employeeId]);
      const queue = h.dataOf<{ items: { id: string }[] }>(
        await h.renewals(`?state=PROPOSED&subscriptionId=${subscriptionId}`, h.boss.account).expect(200),
      );
      expect(queue.items.map((item) => item.id)).toEqual([renewal.id]);
      expect(await h.auditOf('SubscriptionRenewal', renewal.id)).toEqual(
        expect.arrayContaining([expect.objectContaining({ action: 'SUBSCRIPTION_RENEWAL.PROPOSED' })]),
      );
      expect(h.codeOf(await h.propose({ subscriptionId, choice: 'RENEW' }).expect(409))).toBe(
        'SUBSCRIPTION_RENEWAL.ALREADY_PROPOSED',
      );
    });

    it('keeps the renewal out of the spend-approval queue of the phone: it is read and decided only through /subscription-renewals (US-16-03 AC-5, a08)', async () => {
      const { subscriptionId } = await h.termWithSeats(unit, 20, { quantity: 10 });
      const id = await h.proposedRenewal({ subscriptionId, choice: 'RENEW' });
      const mobile = { ...h.as(h.boss.account), 'User-Agent': 'SLM-Mobile/1.0 (iOS 19)', 'X-Client': 'mobile' };
      const spendQueue = async () =>
        h.dataOf<{ items: { requestId: string }[] }>(
          await request(h.server()).get('/api/v1/spend-approvals').query({ pageSize: 100 }).set(mobile).expect(200),
        ).items;

      const before = (await spendQueue()).map((item) => item.requestId);
      expect(before).not.toContain(id);
      expect(before).not.toContain(subscriptionId);
      const { rows: requests } = await h.ctx.sql.query<{ id: string }>(
        `SELECT id FROM access_requests WHERE id = ANY($1::uuid[])`,
        [before],
      );
      expect(requests).toHaveLength(before.length);
      const proposed = h.dataOf<{ items: { id: string }[] }>(
        await h.renewals(`?state=PROPOSED&subscriptionId=${subscriptionId}`, h.boss.account).expect(200),
      );
      expect(proposed.items.map((item) => item.id)).toEqual([id]);

      await h.decideRenewal(id, { choice: 'RENEW' }, h.boss.account).expect(200);
      expect((await spendQueue()).map((item) => item.requestId)).not.toContain(id);
      expect((await detail(id)).state).toBe('DECIDED');
    });

    it('refuses a period with no milestone, guessing none, and a draft or a reduction that is not one', async () => {
      const undated = await h.term({ ownerDepartmentId: unit.department.id, autoRenew: true });
      const draft = await h.draftSubscription();
      const dated = await h.term({ ownerDepartmentId: unit.department.id, noticeDeadline: h.inDays(30), quantity: 10 });

      expect(h.codeOf(await h.propose({ subscriptionId: undated, choice: 'RENEW' }).expect(409))).toBe(
        'SUBSCRIPTION_RENEWAL.CONTRACT_DATA_INCOMPLETE',
      );
      expect(h.codeOf(await h.propose({ subscriptionId: draft, choice: 'RENEW' }).expect(409))).toBe(
        'SUBSCRIPTION_RENEWAL.NOT_RENEWABLE',
      );
      expect(
        h.codeOf(await h.propose({ subscriptionId: dated, choice: 'REDUCE', proposedQuantity: 10 }).expect(422)),
      ).toBe('SUBSCRIPTION_RENEWAL.QUANTITY_INVALID');
      expect(await h.count('subscription_renewals')).toBeGreaterThanOrEqual(1);
    });

    it('keeps one case per period when two proposals race', async () => {
      const subscriptionId = await h.term({ ownerDepartmentId: unit.department.id, noticeDeadline: h.inDays(45) });

      const answers = await Promise.all([
        h.propose({ subscriptionId, choice: 'RENEW' }),
        h.propose({ subscriptionId, choice: 'CANCEL' }),
      ]);

      expect(answers.map((answer) => answer.status).sort()).toEqual([201, 409]);
      const { rows } = await h.ctx.sql.query(`SELECT id FROM subscription_renewals WHERE subscription_id = $1`, [
        subscriptionId,
      ]);
      expect(rows).toHaveLength(1);
    });

    it('lets neither the decider, Finance nor an employee propose, and keeps the cases from a head and an employee (SoD-2)', async () => {
      const subscriptionId = await h.term({ ownerDepartmentId: unit.department.id, noticeDeadline: h.inDays(25) });

      expect((await h.propose({ subscriptionId, choice: 'RENEW' }, h.boss.account)).status).toBe(403);
      expect((await h.propose({ subscriptionId, choice: 'RENEW' }, h.finance)).status).toBe(403);
      expect(h.codeOf(await h.renewals('', unit.head.account).expect(403))).toBe('SUBSCRIPTION_RENEWAL.READ_FORBIDDEN');
      expect(h.codeOf(await h.renewals('', h.employee).expect(403))).toBe('SUBSCRIPTION_RENEWAL.READ_FORBIDDEN');
      await h.renewals('', h.finance).expect(200);
    });
  });

  describe('the decision (US-11-02)', () => {
    it('is the decider’s alone, written once with its snapshot, and holds no budget commitment (AC-3, AC-6, AC-9, AC-14, AC-17)', async () => {
      const { subscriptionId } = await h.termWithSeats({ ...unit, members: [] }, 15);
      const id = await h.proposedRenewal({ subscriptionId, choice: 'RENEW' });
      const commitmentsBefore = await h.count('budget_commitments');

      for (const account of [h.it1, h.finance, h.employee, unit.head.account]) {
        expect(h.codeOf(await h.decideRenewal(id, { choice: 'RENEW' }, account).expect(403))).toBe(
          'SUBSCRIPTION_RENEWAL.NOT_DECIDER',
        );
      }
      const decided = h.dataOf<{ renewal: DetailWire }>(
        await h.decideRenewal(id, { choice: 'RENEW', reason: 'Still used by the team' }, h.boss.account).expect(200),
      ).renewal;

      expect(decided.decision).toMatchObject({
        choice: 'RENEW',
        deciderRole: 'SPENDING_APPROVER',
        decidedAfterDeadline: false,
        executionPoint: 'AS_PLANNED',
        snapshot: { source: 'NOT_CONNECTED' },
      });
      expect(await h.count('budget_commitments')).toBe(commitmentsBefore);
      expect(await h.count('subscriptions')).toBeGreaterThan(0);
      expect(h.codeOf(await h.decideRenewal(id, { choice: 'CANCEL' }, h.boss.account).expect(409))).toBe(
        'SUBSCRIPTION_RENEWAL.NOT_AWAITING_DECISION',
      );
      await expect(
        h.ctx.sql.query(`UPDATE subscription_renewals SET decided_choice = 'CANCEL' WHERE id = $1`, [id]),
      ).rejects.toMatchObject({ constraint: 'subscription_renewals_decision_is_final' });
      expect((await h.outcome(id, { outcome: 'UNCONFIRMED' }, h.boss.account)).status).toBe(403);
      const told = await h.notices('SUBSCRIPTION_RENEWAL_DECIDED', id);
      expect(told.map((row) => row.recipient_employee_id)).toEqual([h.it1.employeeId]);
      expect(await h.auditOf('SubscriptionRenewal', id)).toEqual(
        expect.arrayContaining([expect.objectContaining({ action: 'SUBSCRIPTION_RENEWAL.DECIDED' })]),
      );
    });

    it('warns of the people using a cancelled subscription and opens their revocations once confirmed (AC-2)', async () => {
      const cancelUnit = await h.unit(2);
      const { subscriptionId, seats } = await h.termWithSeats(cancelUnit, 18);
      const id = await h.proposedRenewal({ subscriptionId, choice: 'CANCEL' });

      const warned = await h.decideRenewal(id, { choice: 'CANCEL' }, h.boss.account).expect(409);
      expect(h.codeOf(warned)).toBe('SUBSCRIPTION_RENEWAL.ACTIVE_USERS_NOT_ACKNOWLEDGED');
      expect(h.detailsOf(warned)).toEqual({ seatsInUse: 2 });
      expect(await h.revocationReasons(seats)).toEqual([]);

      await h.decideRenewal(id, { choice: 'CANCEL', acknowledgeActiveUsers: true }, h.boss.account).expect(200);

      const reasons = await h.revocationReasons(seats);
      expect(reasons).toHaveLength(2);
      expect(reasons.every((row) => row.source === 'SUBSCRIPTION_CANCELLATION' && row.reference_id === id)).toBe(true);
    });

    it('takes back exactly the seats the decider chose from the ranked list when reducing below them (AC-13, AC-20)', async () => {
      const reduceUnit = await h.unit(3);
      const { subscriptionId, seats } = await h.termWithSeats(reduceUnit, 16, { quantity: 5 });
      await h.left(reduceUnit.members[2]);
      const id = await h.proposedRenewal({ subscriptionId, choice: 'REDUCE', proposedQuantity: 1 });

      const ranking = h.dataOf<{
        usage: { status: string };
        seatsInUse: number;
        items: { assignmentId: string; group: string }[];
      }>(await h.ranking(id, h.boss.account).expect(200));
      expect(ranking.usage.status).toBe('NOT_AVAILABLE');
      expect(ranking.seatsInUse).toBe(3);
      expect(ranking.items[0]).toMatchObject({ assignmentId: seats[2], group: 'HOLDER_LEFT' });
      expect(ranking.items.slice(1).every((item) => item.group === 'OTHER')).toBe(true);

      const short = await h
        .decideRenewal(id, { choice: 'REDUCE', quantity: 1, releasedAssignmentIds: [seats[2]] }, h.boss.account)
        .expect(422);
      expect(h.codeOf(short)).toBe('SUBSCRIPTION_RENEWAL.EXCESS_SELECTION_INVALID');
      expect(h.detailsOf(short)).toEqual({ required: 2, selected: 1 });

      const chosen = [seats[2], seats[0]];
      const decided = h.dataOf<{ renewal: DetailWire }>(
        await h
          .decideRenewal(id, { choice: 'REDUCE', quantity: 1, releasedAssignmentIds: chosen }, h.boss.account)
          .expect(200),
      ).renewal;

      expect(decided.decision?.releasedSeatCount).toBe(2);
      const { rows: stored } = await h.ctx.sql.query<{ assignment_id: string; rank_group: string }>(
        `SELECT assignment_id, rank_group FROM subscription_renewal_released_seats WHERE renewal_id = $1 ORDER BY position`,
        [id],
      );
      expect(stored).toEqual([
        { assignment_id: seats[2], rank_group: 'HOLDER_LEFT' },
        { assignment_id: seats[0], rank_group: 'OTHER' },
      ]);
      expect(decided.decision?.seatsInUseAtDecision).toBe(3);
      const reasons = await h.revocationReasons(seats);
      expect(reasons.map((row) => row.assignment_id).sort()).toEqual([...chosen].sort());
      expect(reasons.every((row) => row.source === 'SUBSCRIPTION_REDUCTION')).toBe(true);
    });

    it('blocks what owes more for a department without a Cost Center and lets a cancellation through (AC-22)', async () => {
      const bare = await h.bareDepartment();
      const renew = await h.term({ ownerDepartmentId: bare.id, noticeDeadline: h.inDays(14), quantity: 10 });
      const cancel = await h.term({ ownerDepartmentId: bare.id, noticeDeadline: h.inDays(14), quantity: 10 });
      const renewId = await h.proposedRenewal({ subscriptionId: renew, choice: 'RENEW' });
      const cancelId = await h.proposedRenewal({ subscriptionId: cancel, choice: 'CANCEL' });

      expect(h.codeOf(await h.decideRenewal(renewId, { choice: 'RENEW' }, h.boss.account).expect(409))).toBe(
        'FINANCE.SETUP_INCOMPLETE',
      );
      expect(
        h.codeOf(await h.decideRenewal(renewId, { choice: 'REDUCE', quantity: 8 }, h.boss.account).expect(409)),
      ).toBe('FINANCE.SETUP_INCOMPLETE');
      await h.decideRenewal(renewId, { choice: 'REDUCE', quantity: 0 }, h.boss.account).expect(200);
      await h.decideRenewal(cancelId, { choice: 'CANCEL' }, h.boss.account).expect(200);
    });

    it('never voids a decision after the milestone: mid-term where allowed, else at the next renewal (AC-10, AC-19)', async () => {
      const yearly = await h.term({
        ownerDepartmentId: unit.department.id,
        noticeDeadline: h.inDays(-3),
        quantity: 10,
      });
      const monthly = await h.term({
        ownerDepartmentId: unit.department.id,
        noticeDeadline: h.inDays(-3),
        quantity: 10,
        allowsMidTermReduction: true,
      });
      const yearlyId = await h.proposedRenewal({ subscriptionId: yearly, choice: 'CANCEL' });
      const monthlyId = await h.proposedRenewal({ subscriptionId: monthly, choice: 'CANCEL' });

      await h.decideRenewal(yearlyId, { choice: 'CANCEL' }, h.boss.account).expect(200);
      await h.decideRenewal(monthlyId, { choice: 'CANCEL' }, h.boss.account).expect(200);

      expect((await detail(yearlyId)).decision).toMatchObject({
        decidedAfterDeadline: true,
        executionPoint: 'NEXT_RENEWAL',
      });
      expect((await detail(monthlyId)).decision).toMatchObject({
        decidedAfterDeadline: true,
        executionPoint: 'MID_TERM',
      });
    });
  });
});
