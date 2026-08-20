import { ApprovalPolicy } from './approval.policy';

describe('ApprovalPolicy', () => {
  const policy = new ApprovalPolicy();

  it('allows the assigned approver to decide a pending step', () => {
    expect(
      policy.canDecide({
        requesterId: 'employee-1',
        approverId: 'employee-2',
        actorId: 'employee-2',
        stepStatus: 'PENDING',
      }),
    ).toEqual({ allowed: true });
  });

  it('denies self approval even when the requester is assigned', () => {
    expect(
      policy.canDecide({
        requesterId: 'employee-1',
        approverId: 'employee-1',
        actorId: 'employee-1',
        stepStatus: 'PENDING',
      }),
    ).toEqual({ allowed: false, reason: 'SELF_APPROVAL_FORBIDDEN' });
  });

  it('denies an actor who is not assigned to the step', () => {
    expect(
      policy.canDecide({
        requesterId: 'employee-1',
        approverId: 'employee-2',
        actorId: 'employee-3',
        stepStatus: 'PENDING',
      }),
    ).toEqual({ allowed: false, reason: 'APPROVER_MISMATCH' });
  });

  it('denies a decision on an already decided step', () => {
    expect(
      policy.canDecide({
        requesterId: 'employee-1',
        approverId: 'employee-2',
        actorId: 'employee-2',
        stepStatus: 'APPROVED',
      }),
    ).toEqual({ allowed: false, reason: 'STEP_ALREADY_DECIDED' });
  });
});
