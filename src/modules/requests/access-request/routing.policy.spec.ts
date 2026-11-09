import { routeNeedStep, requestRoutingOf } from './routing.policy';
const base = {
  requesterEmployeeId: 'employee',
  departmentHeadEmployeeId: 'head',
  spendingApproverEmployeeId: 'spender',
  chainHasSpendStep: true,
};
describe('BR-MF1-02: routing fixed at submission', () => {
  it('sends a member to the head', () =>
    expect(routeNeedStep(base)).toMatchObject({ outcome: 'ASSIGNED', row: 1, assigneeEmployeeId: 'head' }));
  it('sends a head directly without a need approver', () =>
    expect(routeNeedStep({ ...base, requesterEmployeeId: 'head' })).toEqual({
      outcome: 'NOT_REQUIRED',
      row: 2,
      reason: null,
      oneStepReason: 'REQUESTER_IS_HEAD',
    }));
  it('M-15: a missing effective head means ONE_STEP even if a future successor is recorded', () =>
    expect(requestRoutingOf(routeNeedStep({ ...base, departmentHeadEmployeeId: null }))).toEqual({
      mode: 'ONE_STEP',
      oneStepReason: 'NO_DEPARTMENT_HEAD',
    }));
  it.each([false, true])('does not create a substitute need step when spending approver is absent (paid=%s)', (paid) =>
    expect(
      routeNeedStep({ ...base, requesterEmployeeId: 'head', spendingApproverEmployeeId: null, chainHasSpendStep: paid })
        .outcome,
    ).toBe('NOT_REQUIRED'),
  );
});
