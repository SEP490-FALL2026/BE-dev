import { hasSpendStep, policyFor, proposalPolicy } from './access-request.policy';
import { routeNeedStep, requestRoutingOf, type RoutingFacts } from './routing.policy';

/** The chain of each branch decides whether the request has a spend step, which is what tells paid and unknown-price software from a free one. */
const chainOf = {
  paid: hasSpendStep(policyFor('SAAS', 3)),
  caseB: hasSpendStep(proposalPolicy(3)),
  free: hasSpendStep(policyFor('INTERNAL', 3)),
} as const;

const base: RoutingFacts = {
  requesterEmployeeId: 'employee',
  departmentHeadEmployeeId: 'head',
  spendingApproverEmployeeId: 'spender',
  chainHasSpendStep: chainOf.paid,
};
const noHead: RoutingFacts = { ...base, departmentHeadEmployeeId: null };

describe('BR-MF1-02 / QĐ-110i / QĐ-111bc: routing fixed at submission, five cases', () => {
  it('the branches differ in the spend step only: paid and case B have one, a free internal request has none', () =>
    expect(chainOf).toEqual({ paid: true, caseB: true, free: false }));

  // 1. A paid request of an employee of a department with no head waits for one (QĐ-110i): no one-step route.
  it('case 1: a paid request of an employee waits at the need step (NO_DEPARTMENT_HEAD)', () => {
    const decision = routeNeedStep({ ...noHead, chainHasSpendStep: chainOf.paid });

    expect(decision).toEqual({ outcome: 'WAITING', row: 4, reason: 'NO_DEPARTMENT_HEAD' });
    expect(requestRoutingOf(decision)).toEqual({ mode: 'VIA_HEAD', oneStepReason: null });
  });

  // 2. A case B proposal does not know yet whether it ends free or paid (R-43): it waits too, and never goes to the IT assessment.
  it('case 2: a case B proposal of an employee waits at the need step, never one-step to the IT assessment (R-43)', () => {
    const decision = routeNeedStep({ ...noHead, chainHasSpendStep: chainOf.caseB });

    expect(decision).toEqual({ outcome: 'WAITING', row: 4, reason: 'NO_DEPARTMENT_HEAD' });
    expect(requestRoutingOf(decision).mode).toBe('VIA_HEAD');
  });

  // 3. The head asking for themselves is the one request that goes in one step, whatever the branch.
  it.each(['paid', 'caseB', 'free'] as const)(
    'case 3: the head asking for themselves goes in one step (%s)',
    (kind) => {
      const decision = routeNeedStep({ ...base, requesterEmployeeId: 'head', chainHasSpendStep: chainOf[kind] });

      expect(decision).toEqual({ outcome: 'NOT_REQUIRED', row: 2, reason: null, oneStepReason: 'REQUESTER_IS_HEAD' });
      expect(requestRoutingOf(decision)).toEqual({ mode: 'ONE_STEP', oneStepReason: 'REQUESTER_IS_HEAD' });
    },
  );

  // 4. Free internal software already in the catalog costs nothing, so it goes straight to the IT Admin (QĐ-111bc); the audit flag is the one-step reason.
  it('case 4: a free internal request goes straight to the IT Admin, with the reason NO_DEPARTMENT_HEAD for the audit flag', () => {
    const decision = routeNeedStep({ ...noHead, chainHasSpendStep: chainOf.free });

    expect(decision).toEqual({ outcome: 'NOT_REQUIRED', row: 4, reason: null, oneStepReason: 'NO_DEPARTMENT_HEAD' });
    expect(requestRoutingOf(decision)).toEqual({ mode: 'ONE_STEP', oneStepReason: 'NO_DEPARTMENT_HEAD' });
  });

  // 5. A department with a head routes as before, whatever the branch.
  it.each(['paid', 'caseB', 'free'] as const)(
    'case 5: a department with a head sends a member to the head (%s)',
    (kind) => {
      const decision = routeNeedStep({ ...base, chainHasSpendStep: chainOf[kind] });

      expect(decision).toMatchObject({ outcome: 'ASSIGNED', row: 1, assigneeEmployeeId: 'head', role: 'MANAGER' });
      expect(requestRoutingOf(decision).mode).toBe('VIA_HEAD');
    },
  );

  it('M-15: a missing effective head waits for a paid request even if a future successor is recorded (the fact is only the head of today)', () =>
    expect(routeNeedStep({ ...noHead, chainHasSpendStep: true }).outcome).toBe('WAITING'));

  it.each([false, true])('does not create a substitute need step when spending approver is absent (paid=%s)', (paid) =>
    expect(
      routeNeedStep({ ...base, requesterEmployeeId: 'head', spendingApproverEmployeeId: null, chainHasSpendStep: paid })
        .outcome,
    ).toBe('NOT_REQUIRED'),
  );
});
