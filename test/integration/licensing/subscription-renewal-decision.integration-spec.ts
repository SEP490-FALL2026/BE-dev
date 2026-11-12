import request from 'supertest';
import { RenewalHarness, type RenewalUnit } from '../../support/renewal-harness';

const h = new RenewalHarness();

interface DetailWire {
  id: string;
  state: string;
  milestone: { basis: string; baseDate: string };
  usage: { status: string };
  period: { seatsInUse: number };
  waitingReason: string | null;
  proposal: {
    choice: string;
    quantity: number | null;
    releasedSeatCount: number;
  };
  decision: {
    choice: string;
    deciderRole: string;
    decidedAfterDeadline: boolean;
    executionPoint: string;
    seatsInUseAtDecision: number;
    releasedSeatCount: number;
    snapshot: { source: string } | null;
  } | null;
}

/**
 * EP-11 on real PostgreSQL: the proposal of the IT Admin with the seats to take back (`US-11-05`) and the confirmation of the head
 * of the department that owns the subscription (`QĐ-94d`(2), `US-11-02`) — who may do and read what (SoD), the queue, a department
 * with no head, a cancellation in use, a reduction below the seats in use, no wait for a Cost Center, the execution point of a late
 * confirmation, the frozen decision, and no budget commitment.
 */
describe('the proposal and the confirmation of a renewal (integration, real PostgreSQL)', () => {
  let unit: RenewalUnit;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    unit = await h.unit(3);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const detail = async (id: string, account = h.it1) =>
    h.dataOf<{ renewal: DetailWire }>(await h.read(id, account).expect(200)).renewal;
  const alertsOf = async (renewalId: string) =>
    (
      await h.ctx.sql.query<{ recipient_employee_id: string; params: Record<string, unknown>; event_key: string }>(
        `SELECT recipient_employee_id, params, event_key FROM in_app_notifications
          WHERE code = 'CONTROLLED_WAIT_ALERT' AND subject_id = $1 ORDER BY created_at, id`,
        [renewalId],
      )
    ).rows;

  describe('the proposal (US-11-05 AC-1, AC-3, AC-5 → AC-8, AC-15)', () => {
    it('puts the case in the queue of the head of the owner department, who is told, with the seats to take back', async () => {
      const reduceUnit = await h.unit(3);
      const { subscriptionId, seats } = await h.termWithSeats(reduceUnit, 20, { quantity: 5 });

      const response = await h
        .propose({
          subscriptionId,
          choice: 'REDUCE',
          proposedQuantity: 1,
          releasedAssignmentIds: [seats[2], seats[0]],
        })
        .expect(201);
      const renewal = h.dataOf<{ renewal: DetailWire }>(response).renewal;

      expect(renewal).toMatchObject({
        state: 'PROPOSED',
        waitingReason: null,
        milestone: { basis: 'DECLARED', baseDate: h.inDays(20) },
        usage: { status: 'NOT_AVAILABLE' },
        period: { seatsInUse: 3 },
        proposal: { choice: 'REDUCE', quantity: 1, releasedSeatCount: 2 },
        decision: null,
      });
      expect(
        (await h.notices('SUBSCRIPTION_RENEWAL_PROPOSED', renewal.id)).map((row) => row.recipient_employee_id),
      ).toEqual([reduceUnit.head.employeeId]);
      const queue = h.dataOf<{ items: { id: string }[] }>(
        await h.renewals(`?state=PROPOSED&subscriptionId=${subscriptionId}`, reduceUnit.head.account).expect(200),
      );
      expect(queue.items.map((item) => item.id)).toEqual([renewal.id]);
      const { rows: stored } = await h.ctx.sql.query<{ assignment_id: string }>(
        `SELECT assignment_id FROM subscription_renewal_released_seats WHERE renewal_id = $1 ORDER BY position`,
        [renewal.id],
      );
      expect(stored.map((row) => row.assignment_id).sort()).toEqual([seats[0], seats[2]].sort());
      expect(await h.auditOf('SubscriptionRenewal', renewal.id)).toEqual(
        expect.arrayContaining([expect.objectContaining({ action: 'SUBSCRIPTION_RENEWAL.PROPOSED' })]),
      );
      expect(h.codeOf(await h.propose({ subscriptionId, choice: 'RENEW' }).expect(409))).toBe(
        'SUBSCRIPTION_RENEWAL.ALREADY_PROPOSED',
      );
    });

    it('refuses seats that are not exactly the excess, seats on a renewal or a cancellation, and writes nothing', async () => {
      const { subscriptionId, seats } = await h.termWithSeats(await h.unit(3), 20, { quantity: 5 });
      const before = await h.count('subscription_renewals');

      const short = await h
        .propose({ subscriptionId, choice: 'REDUCE', proposedQuantity: 1, releasedAssignmentIds: [seats[0]] })
        .expect(422);
      expect(h.codeOf(short)).toBe('SUBSCRIPTION_RENEWAL.EXCESS_SELECTION_INVALID');
      expect(h.detailsOf(short)).toEqual({ required: 2, selected: 1 });
      for (const choice of ['RENEW', 'CANCEL']) {
        expect(
          h.codeOf(await h.propose({ subscriptionId, choice, releasedAssignmentIds: [seats[0]] }).expect(422)),
        ).toBe('SUBSCRIPTION_RENEWAL.EXCESS_SELECTION_INVALID');
      }
      expect(await h.count('subscription_renewals')).toBe(before);
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

    it('waits for a head when the owner department has none, and tells the Super Admin once (QĐ-93c, US-11-05 AC-23)', async () => {
      const bare = await h.bareDepartment();
      const subscriptionId = await h.term({ ownerDepartmentId: bare.id, noticeDeadline: h.inDays(21), quantity: 10 });

      const id = await h.proposedRenewal({ subscriptionId, choice: 'RENEW' });

      expect(await detail(id)).toMatchObject({ state: 'PROPOSED', waitingReason: 'NO_HEAD' });
      const alerts = await alertsOf(id);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].recipient_employee_id).toBe(h.seed.superAdmin.employeeId);
      expect(alerts[0].params).toEqual({
        renewalId: id,
        subscriptionId,
        waitingReason: 'NO_HEAD',
        configurationHint: 'ASSIGN_DEPARTMENT_HEAD',
      });
      expect(alerts[0].event_key).toMatch(new RegExp(`^CONTROLLED_WAIT_ALERT:SUBSCRIPTION_RENEWAL:${id}:sent:\\d+$`));
      expect(await h.notices('SUBSCRIPTION_RENEWAL_PROPOSED', id)).toEqual([]);
      // Nobody takes the place of the head: the spending approver and the IT Admin who proposed are refused, and role changes tell nothing.
      for (const account of [h.boss.account, h.it1, h.finance]) {
        expect(h.codeOf(await h.confirmRenewal(id, account).expect(403))).toBe('SUBSCRIPTION_RENEWAL.NOT_DECIDER');
      }
      await h.clearRole('SPENDING_APPROVER');
      await h.setRole('SPENDING_APPROVER', h.boss);
      expect(await alertsOf(id)).toHaveLength(1);
    });
  });

  describe('who reads the cases (QĐ-94d(2), SoD-2)', () => {
    it('gives the IT Admin and Finance every case, a head only the cases of their department, and the others none', async () => {
      const mine = await h.termWithSeats(unit, 26);
      const other = await h.unit(1);
      const theirs = await h.termWithSeats(other, 26);
      const mineId = await h.proposedRenewal({ subscriptionId: mine.subscriptionId, choice: 'RENEW' });
      const theirsId = await h.proposedRenewal({ subscriptionId: theirs.subscriptionId, choice: 'RENEW' });
      const idsOf = async (account: typeof h.it1) =>
        h
          .dataOf<{ items: { id: string }[] }>(await h.renewals('?pageSize=100', account).expect(200))
          .items.map((item) => item.id);

      expect(await idsOf(h.it1)).toEqual(expect.arrayContaining([mineId, theirsId]));
      expect(await idsOf(h.finance)).toEqual(expect.arrayContaining([mineId, theirsId]));
      const headSees = await idsOf(unit.head.account);
      expect(headSees).toContain(mineId);
      expect(headSees).not.toContain(theirsId);
      await h.read(mineId, unit.head.account).expect(200);
      expect(h.codeOf(await h.read(theirsId, unit.head.account).expect(404))).toBe('SUBSCRIPTION_RENEWAL.NOT_FOUND');
      for (const account of [h.boss.account, h.employee, unit.members[0].account, h.bystander.account]) {
        expect(h.codeOf(await h.renewals('', account).expect(403))).toBe('SUBSCRIPTION_RENEWAL.READ_FORBIDDEN');
        expect(h.codeOf(await h.read(mineId, account).expect(403))).toBe('SUBSCRIPTION_RENEWAL.READ_FORBIDDEN');
      }
    });

    it('shows the head the holder by code and name, the seats proposed, the last activity when there is one, and no email; Finance does not read the seats', async () => {
      const seatUnit = await h.unit(3);
      const { subscriptionId, seats } = await h.termWithSeats(seatUnit, 27, { quantity: 5 });
      const id = await h.proposedRenewal({
        subscriptionId,
        choice: 'REDUCE',
        proposedQuantity: 1,
        releasedAssignmentIds: [seats[0], seats[1]],
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
      expect(
        all.items
          .filter((item) => item.inProposal)
          .map((item) => item.assignmentId)
          .sort(),
      ).toEqual([seats[0], seats[1]].sort());
      expect(proposed.items.map((item) => item.assignmentId).sort()).toEqual([seats[0], seats[1]].sort());
      expect(proposed.pagination.totalItems).toBe(2);
      for (const item of all.items) {
        expect(Object.keys(item.employee).sort()).toEqual(['employeeCode', 'fullName', 'id']);
        expect(item.lastActivityOn).toBeNull();
      }
      expect(JSON.stringify(all)).not.toMatch(/@acme\.vn/);
      expect(h.codeOf(await h.ranking(id, h.finance).expect(403))).toBe('SUBSCRIPTION_RENEWAL.READ_FORBIDDEN');
      const otherHead = (await h.unit(1)).head.account;
      expect(h.codeOf(await h.ranking(id, otherHead).expect(404))).toBe('SUBSCRIPTION_RENEWAL.NOT_FOUND');
    });

    it('lets neither the spending approver, Finance nor an employee propose', async () => {
      const subscriptionId = await h.term({ ownerDepartmentId: unit.department.id, noticeDeadline: h.inDays(25) });

      expect((await h.propose({ subscriptionId, choice: 'RENEW' }, h.boss.account)).status).toBe(403);
      expect((await h.propose({ subscriptionId, choice: 'RENEW' }, h.finance)).status).toBe(403);
      expect((await h.propose({ subscriptionId, choice: 'RENEW' }, unit.head.account)).status).toBe(403);
    });
  });

  describe('the confirmation (US-11-02, QĐ-94d(2))', () => {
    it('is the head’s alone, written once with its role and snapshot, tells the IT Admin and Finance, and holds no budget commitment', async () => {
      const { subscriptionId } = await h.termWithSeats({ ...unit, members: [] }, 15);
      const id = await h.proposedRenewal({ subscriptionId, choice: 'RENEW' });
      const commitmentsBefore = await h.count('budget_commitments');

      for (const account of [h.boss.account, h.it1, h.finance, h.employee]) {
        expect(h.codeOf(await h.confirmRenewal(id, account).expect(403))).toBe('SUBSCRIPTION_RENEWAL.NOT_DECIDER');
      }
      // The head of another department finds no such case (A-M2).
      expect(h.codeOf(await h.confirmRenewal(id, (await h.unit(1)).head.account).expect(404))).toBe(
        'SUBSCRIPTION_RENEWAL.NOT_FOUND',
      );
      const confirmed = h.dataOf<{ renewal: DetailWire }>(
        await h.confirmRenewal(id, unit.head.account, { reason: 'Still used by the team' }).expect(200),
      ).renewal;

      expect(confirmed.decision).toMatchObject({
        choice: 'RENEW',
        deciderRole: 'OWNER_DEPARTMENT_HEAD',
        decidedAfterDeadline: false,
        executionPoint: 'AS_PLANNED',
        snapshot: { source: 'NOT_CONNECTED' },
      });
      // The IT Admin does not read the money the head saw.
      expect((await detail(id, h.it1)).decision?.snapshot).toBeNull();
      expect((await detail(id, h.finance)).decision?.snapshot).toMatchObject({ source: 'NOT_CONNECTED' });
      expect(await h.count('budget_commitments')).toBe(commitmentsBefore);
      expect(h.codeOf(await h.confirmRenewal(id, unit.head.account).expect(409))).toBe(
        'SUBSCRIPTION_RENEWAL.NOT_AWAITING_DECISION',
      );
      await expect(
        h.ctx.sql.query(`UPDATE subscription_renewals SET decided_choice = 'CANCEL' WHERE id = $1`, [id]),
      ).rejects.toMatchObject({ constraint: 'subscription_renewals_decision_is_final' });
      expect((await h.outcome(id, { outcome: 'UNCONFIRMED' }, unit.head.account)).status).toBe(403);
      const told = await h.notices('SUBSCRIPTION_RENEWAL_DECIDED', id);
      expect(told.map((row) => row.recipient_employee_id).sort()).toEqual(
        [h.it1.employeeId, h.finance.employeeId].sort(),
      );
      expect(await h.auditOf('SubscriptionRenewal', id)).toEqual(
        expect.arrayContaining([expect.objectContaining({ action: 'SUBSCRIPTION_RENEWAL.DECIDED' })]),
      );
      const { rows } = await h.ctx.sql.query<{ decider_role: string }>(
        `SELECT decider_role FROM subscription_renewals WHERE id = $1`,
        [id],
      );
      expect(rows).toEqual([{ decider_role: 'OWNER_DEPARTMENT_HEAD' }]);
    });

    it('opens the revocations of the seats the IT Admin proposed when it confirms a reduction (F26)', async () => {
      const reduceUnit = await h.unit(3);
      const { subscriptionId, seats } = await h.termWithSeats(reduceUnit, 16, { quantity: 5 });
      await h.left(reduceUnit.members[2]);
      const chosen = [seats[2], seats[0]];
      const id = await h.proposedRenewal({
        subscriptionId,
        choice: 'REDUCE',
        proposedQuantity: 1,
        releasedAssignmentIds: chosen,
      });

      const confirmed = h.dataOf<{ renewal: DetailWire }>(
        await h.confirmRenewal(id, reduceUnit.head.account).expect(200),
      ).renewal;

      expect(confirmed.decision).toMatchObject({
        choice: 'REDUCE',
        deciderRole: 'OWNER_DEPARTMENT_HEAD',
        releasedSeatCount: 2,
        seatsInUseAtDecision: 3,
      });
      const reasons = await h.revocationReasons(seats);
      expect(reasons.map((row) => row.assignment_id).sort()).toEqual([...chosen].sort());
      expect(reasons.every((row) => row.source === 'SUBSCRIPTION_REDUCTION' && row.reference_id === id)).toBe(true);
    });

    it('closes a proposal that is out of date as STALE and lets the IT Admin propose again: a seat that was not proposed ended before the confirmation (PROPOSAL_STALE, A-H2)', async () => {
      const staleUnit = await h.unit(3);
      const { subscriptionId, seats } = await h.termWithSeats(staleUnit, 17, { quantity: 5 });
      const id = await h.proposedRenewal({
        subscriptionId,
        choice: 'REDUCE',
        proposedQuantity: 1,
        releasedAssignmentIds: [seats[0], seats[1]],
      });
      await h.ctx.sql.query(`UPDATE license_assignments SET valid_until = $2::date WHERE id = $1`, [
        seats[2],
        h.today(),
      ]);

      const stale = await h.confirmRenewal(id, staleUnit.head.account).expect(409);

      expect(h.codeOf(stale)).toBe('SUBSCRIPTION_RENEWAL.PROPOSAL_STALE');
      expect(h.detailsOf(stale)).toEqual({ required: 1, stillHeld: 2 });
      // Nothing is revoked, but the case is no dead end: it is closed and the period is free for a new proposal.
      expect((await h.caseRow(id)).state).toBe('STALE');
      expect(await h.revocationReasons(seats)).toEqual([]);
      expect(h.codeOf(await h.confirmRenewal(id, staleUnit.head.account).expect(409))).toBe(
        'SUBSCRIPTION_RENEWAL.NOT_AWAITING_DECISION',
      );
      const again = await h.proposedRenewal({
        subscriptionId,
        choice: 'REDUCE',
        proposedQuantity: 1,
        releasedAssignmentIds: [seats[0]],
      });
      expect(again).not.toBe(id);
      expect((await h.caseRow(again)).state).toBe('PROPOSED');
      expect(h.codeOf(await h.propose({ subscriptionId, choice: 'RENEW' }).expect(409))).toBe(
        'SUBSCRIPTION_RENEWAL.ALREADY_PROPOSED',
      );
      await h.confirmRenewal(again, staleUnit.head.account).expect(200);
      const listed = await h.renewals(`?subscriptionId=${subscriptionId}`, staleUnit.head.account).expect(200);
      expect(
        h
          .dataOf<{ items: { state: string }[] }>(listed)
          .items.map((item) => item.state)
          .sort(),
      ).toEqual(['DECIDED', 'STALE']);
    });

    it('warns of the people using a cancelled subscription and opens their revocations once confirmed (AC-2)', async () => {
      const cancelUnit = await h.unit(2);
      const { subscriptionId, seats } = await h.termWithSeats(cancelUnit, 18);
      const id = await h.proposedRenewal({ subscriptionId, choice: 'CANCEL' });

      const warned = await h.confirmRenewal(id, cancelUnit.head.account).expect(409);
      expect(h.codeOf(warned)).toBe('SUBSCRIPTION_RENEWAL.ACTIVE_USERS_NOT_ACKNOWLEDGED');
      expect(h.detailsOf(warned)).toEqual({ seatsInUse: 2 });
      expect(await h.revocationReasons(seats)).toEqual([]);

      await h.confirmRenewal(id, cancelUnit.head.account, { acknowledgeActiveUsers: true }).expect(200);

      const reasons = await h.revocationReasons(seats);
      expect(reasons).toHaveLength(2);
      expect(reasons.every((row) => row.source === 'SUBSCRIPTION_CANCELLATION' && row.reference_id === id)).toBe(true);
    });

    it('does not wait for a Cost Center: a department without one keeps what it pays for, and cancels (QĐ-94m(2))', async () => {
      const bare = await h.bareDepartment();
      const department = { ...bare, unitId: '' };
      const head = await h.staff(department, 'BARE-H1');
      await h.makeHead(department, head);
      const renew = await h.term({ ownerDepartmentId: bare.id, noticeDeadline: h.inDays(14), quantity: 10 });
      const cancel = await h.term({ ownerDepartmentId: bare.id, noticeDeadline: h.inDays(14), quantity: 10 });
      const renewId = await h.proposedRenewal({ subscriptionId: renew, choice: 'RENEW' });
      const cancelId = await h.proposedRenewal({ subscriptionId: cancel, choice: 'CANCEL' });

      await h.confirmRenewal(renewId, head.account).expect(200);
      await h.confirmRenewal(cancelId, head.account).expect(200);

      expect((await detail(renewId)).state).toBe('DECIDED');
    });

    it('never voids a confirmation after the milestone: mid-term where allowed, else at the next renewal (AC-10, AC-19)', async () => {
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

      await h.confirmRenewal(yearlyId, unit.head.account).expect(200);
      await h.confirmRenewal(monthlyId, unit.head.account).expect(200);

      expect((await detail(yearlyId)).decision).toMatchObject({
        decidedAfterDeadline: true,
        executionPoint: 'NEXT_RENEWAL',
      });
      expect((await detail(monthlyId)).decision).toMatchObject({
        decidedAfterDeadline: true,
        executionPoint: 'MID_TERM',
      });
    });

    it('lets one of two confirmations at the same time through and refuses the other (race)', async () => {
      const { subscriptionId } = await h.termWithSeats({ ...unit, members: [] }, 28);
      const id = await h.proposedRenewal({ subscriptionId, choice: 'RENEW' });

      const answers = await Promise.all([
        h.confirmRenewal(id, unit.head.account),
        h.confirmRenewal(id, unit.head.account),
      ]);

      expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
      expect(h.codeOf(answers.find((answer) => answer.status === 409) as request.Response)).toBe(
        'SUBSCRIPTION_RENEWAL.NOT_AWAITING_DECISION',
      );
      expect(await h.notices('SUBSCRIPTION_RENEWAL_DECIDED', id)).toHaveLength(2);
    });

    it('is the head of the day of the decision who confirms: a head named in their place takes over (QĐ-93c)', async () => {
      const handover = await h.unit(1);
      const successor = await h.staff(handover.department, 'SUC-H1');
      const { subscriptionId } = await h.termWithSeats({ ...handover, members: [] }, 29);
      const id = await h.proposedRenewal({ subscriptionId, choice: 'RENEW' });

      await h.makeHead(handover.department, successor);

      expect(h.codeOf(await h.confirmRenewal(id, handover.head.account).expect(403))).toBe(
        'SUBSCRIPTION_RENEWAL.NOT_DECIDER',
      );
      await h.confirmRenewal(id, successor.account).expect(200);
    });
  });
});
