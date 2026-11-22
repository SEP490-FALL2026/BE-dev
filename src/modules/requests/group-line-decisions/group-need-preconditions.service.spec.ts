import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { GroupNeedPreconditions } from './group-need-preconditions.service';

describe('GroupNeedPreconditions', () => {
  const tx = {} as DbTx;
  const actor: AuthenticatedPrincipal = {
    subject: 'u-e2',
    appUserId: 'u-e2',
    sessionId: 'sess-1',
    employeeId: 'e2',
    directRoles: ['MANAGER'],
    roles: ['MANAGER'],
  };

  it('ignores WITHDRAWN lines so a beneficiary who became head can decide remaining open lines once their line is withdrawn', async () => {
    const requests = {
      lockById: jest.fn().mockResolvedValue({
        id: 'req-group',
        type: 'GROUP_GRANT',
        organizationId: 'org-1',
        requesterEmployeeId: 'e1',
        beneficiaryEmployeeIds: ['e1', 'e3'],
        departmentId: 'dept-1',
        planId: 'plan-1',
        state: 'PENDING',
        routing: { mode: 'VIA_HEAD', oneStepReason: null, oneStepBlockedReason: null },
        policy: { chain: ['NEED', 'SPEND_APPROVAL'], slaWorkingDays: 2 },
        needStep: { state: 'PENDING', assigneeEmployeeId: 'e2' },
        needSteps: [
          {
            id: 'step-need',
            state: 'PENDING',
            assigneeEmployeeId: 'e2',
            sequence: 1,
            createdAt: new Date(),
            assignedAt: new Date(),
          },
        ],
        spendStep: null,
        assessmentStep: null,
      }),
    };
    const lines = {
      lock: jest.fn().mockResolvedValue([
        { employeeId: 'e1', needStepId: 'step-need', state: 'AWAITING_NEED' },
        { employeeId: 'e2', needStepId: 'step-need', state: 'WITHDRAWN' },
        { employeeId: 'e3', needStepId: 'step-need', state: 'AWAITING_NEED' },
      ]),
    };
    const licensing = {
      getSeatsHeldInPlans: jest.fn().mockResolvedValue({ total: 0 }),
    };

    const service = new GroupNeedPreconditions(requests as never, lines as never, licensing as never);
    const result = await service.require(tx, actor, 'req-group', {
      lines: [
        { employeeId: 'e1', decision: 'APPROVE' },
        { employeeId: 'e3', decision: 'APPROVE' },
      ],
    });

    expect(result.open.map((line) => line.employeeId)).toEqual(['e1', 'e3']);
    expect(result.approves).toBe(true);
    expect(licensing.getSeatsHeldInPlans).toHaveBeenCalledWith('e1', ['plan-1'], { skip: 0, take: 1 }, tx);
  });
});
