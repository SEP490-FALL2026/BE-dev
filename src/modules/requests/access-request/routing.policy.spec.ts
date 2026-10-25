import { routeNeedStep, type RoutingFacts } from './routing.policy';

const H = 'head';
const C = 'spending-approver';
const R0 = 'fallback-approver';
const E = 'employee';

const facts = (patch: Partial<RoutingFacts> = {}): RoutingFacts => ({
  requesterEmployeeId: E,
  departmentHeadEmployeeId: H,
  spendingApproverEmployeeId: C,
  fallbackApproverEmployeeId: R0,
  chainHasSpendStep: true,
  ...patch,
});

describe('routing of the need step (US-05-03)', () => {
  describe('row 1: an employee of a department that has a head', () => {
    it('goes to the head of the department', () => {
      expect(routeNeedStep(facts())).toEqual({
        outcome: 'ASSIGNED',
        row: 1,
        assigneeEmployeeId: H,
        role: 'MANAGER',
        samePersonAsSpend: false,
      });
    });

    it('stays with the head when the head is also the spending approver, and flags the two steps as one person', () => {
      expect(routeNeedStep(facts({ spendingApproverEmployeeId: H }))).toMatchObject({
        outcome: 'ASSIGNED',
        row: 1,
        assigneeEmployeeId: H,
        samePersonAsSpend: true,
      });
    });

    it('does not flag one person when the request has no spend step', () => {
      expect(routeNeedStep(facts({ spendingApproverEmployeeId: H, chainHasSpendStep: false }))).toMatchObject({
        assigneeEmployeeId: H,
        samePersonAsSpend: false,
      });
    });
  });

  describe('row 2: the head sends for themselves', () => {
    it('goes to the spending approver, never to the head and never up a management line', () => {
      expect(routeNeedStep(facts({ requesterEmployeeId: H }))).toEqual({
        outcome: 'ASSIGNED',
        row: 2,
        assigneeEmployeeId: C,
        role: 'SPENDING_APPROVER',
        samePersonAsSpend: true,
      });
    });

    it('waits under control, without handing it to the fallback approver, when no spending approver is set (QĐ-66k)', () => {
      expect(routeNeedStep(facts({ requesterEmployeeId: H, spendingApproverEmployeeId: null }))).toEqual({
        outcome: 'WAITING',
        row: 8,
        reason: 'NO_SPENDING_APPROVER',
      });
    });
  });

  describe('row 3: the head who sends is the spending approver', () => {
    it('goes to the fallback approver', () => {
      expect(routeNeedStep(facts({ requesterEmployeeId: H, spendingApproverEmployeeId: H }))).toEqual({
        outcome: 'ASSIGNED',
        row: 3,
        assigneeEmployeeId: R0,
        role: 'FALLBACK_APPROVER',
        samePersonAsSpend: false,
      });
    });

    it('waits when there is no fallback approver', () => {
      expect(
        routeNeedStep(
          facts({ requesterEmployeeId: H, spendingApproverEmployeeId: H, fallbackApproverEmployeeId: null }),
        ),
      ).toEqual({ outcome: 'WAITING', row: 8, reason: 'NO_FALLBACK_APPROVER' });
    });
  });

  describe('row 4: a department with no head', () => {
    const headless = { departmentHeadEmployeeId: null };

    it('goes to the fallback approver', () => {
      expect(routeNeedStep(facts(headless))).toEqual({
        outcome: 'ASSIGNED',
        row: 4,
        assigneeEmployeeId: R0,
        role: 'FALLBACK_APPROVER',
        samePersonAsSpend: false,
      });
    });

    it('waits when the fallback approver is the one who sends, and decides nothing (row 8)', () => {
      expect(routeNeedStep(facts({ ...headless, requesterEmployeeId: R0 }))).toEqual({
        outcome: 'WAITING',
        row: 8,
        reason: 'FALLBACK_IS_REQUESTER',
      });
    });

    it('waits when there is no fallback approver', () => {
      expect(routeNeedStep(facts({ ...headless, fallbackApproverEmployeeId: null }))).toEqual({
        outcome: 'WAITING',
        row: 8,
        reason: 'NO_FALLBACK_APPROVER',
      });
    });
  });

  describe('the guarantees of every row', () => {
    const people = [E, H, C, R0, null] as const;
    const everyCase = people.flatMap((requester) =>
      people.flatMap((head) =>
        people.flatMap((spender) =>
          people.flatMap((fallback) =>
            [true, false].map((chainHasSpendStep) =>
              facts({
                requesterEmployeeId: requester ?? E,
                departmentHeadEmployeeId: head,
                spendingApproverEmployeeId: spender,
                fallbackApproverEmployeeId: fallback,
                chainHasSpendStep,
              }),
            ),
          ),
        ),
      ),
    );

    it('never gives the step to the person who asked, whatever the data (SoD-4, INV-08)', () => {
      for (const input of everyCase) {
        const decision = routeNeedStep(input);
        if (decision.outcome === 'ASSIGNED') expect(decision.assigneeEmployeeId).not.toBe(input.requesterEmployeeId);
      }
    });

    it('gives the step only to the head, the spending approver or the fallback approver (AC-11)', () => {
      for (const input of everyCase) {
        const decision = routeNeedStep(input);
        if (decision.outcome !== 'ASSIGNED') continue;
        const allowed = [
          input.departmentHeadEmployeeId,
          input.spendingApproverEmployeeId,
          input.fallbackApproverEmployeeId,
        ];
        expect(allowed).toContain(decision.assigneeEmployeeId);
      }
    });

    it('either gives the step to exactly one person or waits with a reason (AC-10)', () => {
      for (const input of everyCase) {
        const decision = routeNeedStep(input);
        if (decision.outcome === 'ASSIGNED') expect(typeof decision.assigneeEmployeeId).toBe('string');
        else expect(decision.reason).toMatch(/^[A-Z_]+$/);
      }
    });
  });
});
