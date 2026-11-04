import { routeNeedStep, type RoutingFacts } from './routing.policy';

const H = 'head';
const C = 'spending-approver';
const E = 'employee';

const facts = (patch: Partial<RoutingFacts> = {}): RoutingFacts => ({
  requesterEmployeeId: E,
  departmentHeadEmployeeId: H,
  spendingApproverEmployeeId: C,
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

  describe('the head who sends is the spending approver (the old row 3, removed by QĐ-93b)', () => {
    it('is not a case any more: the request waits for a valid spending approver and goes to nobody', () => {
      // `QĐ-93b` makes it impossible to hold both roles; data from before still routes safely — as row 2 with no valid approver.
      expect(routeNeedStep(facts({ requesterEmployeeId: H, spendingApproverEmployeeId: H }))).toEqual({
        outcome: 'WAITING',
        row: 8,
        reason: 'NO_SPENDING_APPROVER',
      });
    });
  });

  describe('row 4: a department with no head', () => {
    const headless = { departmentHeadEmployeeId: null };

    it('waits with NO_DEPARTMENT_HEAD on row 4 when the department has no head', () => {
      expect(routeNeedStep(facts(headless))).toEqual({ outcome: 'WAITING', row: 4, reason: 'NO_DEPARTMENT_HEAD' });
    });

    it('waits for the head whoever sends, and whoever holds the spending approver role', () => {
      for (const requesterEmployeeId of [E, C]) {
        for (const spendingApproverEmployeeId of [C, null, requesterEmployeeId]) {
          expect(routeNeedStep(facts({ ...headless, requesterEmployeeId, spendingApproverEmployeeId }))).toEqual({
            outcome: 'WAITING',
            row: 4,
            reason: 'NO_DEPARTMENT_HEAD',
          });
        }
      }
    });
  });

  describe('the guarantees of every row', () => {
    const people = [E, H, C, null] as const;
    const everyCase = people.flatMap((requester) =>
      people.flatMap((head) =>
        people.flatMap((spender) =>
          [true, false].map((chainHasSpendStep) =>
            facts({
              requesterEmployeeId: requester ?? E,
              departmentHeadEmployeeId: head,
              spendingApproverEmployeeId: spender,
              chainHasSpendStep,
            }),
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

    it('gives the step only to the head or the spending approver (AC-11), and never routes to a fallback approver', () => {
      for (const input of everyCase) {
        const decision = routeNeedStep(input);
        if (decision.outcome !== 'ASSIGNED') continue;
        expect([input.departmentHeadEmployeeId, input.spendingApproverEmployeeId]).toContain(
          decision.assigneeEmployeeId,
        );
        expect(['MANAGER', 'SPENDING_APPROVER']).toContain(decision.role);
        expect([1, 2]).toContain(decision.row);
      }
    });

    it('either gives the step to exactly one person or waits with NO_DEPARTMENT_HEAD or NO_SPENDING_APPROVER (AC-10)', () => {
      for (const input of everyCase) {
        const decision = routeNeedStep(input);
        if (decision.outcome === 'ASSIGNED') expect(typeof decision.assigneeEmployeeId).toBe('string');
        else {
          expect(['NO_DEPARTMENT_HEAD', 'NO_SPENDING_APPROVER']).toContain(decision.reason);
          expect(decision.row).toBe(decision.reason === 'NO_DEPARTMENT_HEAD' ? 4 : 8);
        }
      }
    });

    it('never routes to a fallback approver: the facts carry none and no outcome names one', () => {
      expect(Object.keys(facts())).not.toContain('fallbackApproverEmployeeId');
      expect(JSON.stringify(everyCase.map(routeNeedStep))).not.toMatch(/FALLBACK/);
    });
  });
});
