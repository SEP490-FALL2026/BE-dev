import { AccessRequestsService } from './access-requests.service';
import { ApprovalPolicy } from './policies/approval.policy';

describe('AccessRequestsService', () => {
  const service = new AccessRequestsService(new ApprovalPolicy());

  it('exposes the approval decision policy through the module facade', () => {
    expect(
      service.canDecideApproval({
        requesterId: 'employee-1',
        approverId: 'employee-2',
        actorId: 'employee-2',
        stepStatus: 'PENDING',
      }),
    ).toEqual({ allowed: true });
  });

  it('preserves the no-self-approval invariant', () => {
    expect(
      service.canDecideApproval({
        requesterId: 'employee-1',
        approverId: 'employee-1',
        actorId: 'employee-1',
        stepStatus: 'PENDING',
      }),
    ).toEqual({ allowed: false, reason: 'SELF_APPROVAL_FORBIDDEN' });
  });
});
