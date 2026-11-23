import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { SeatTarget } from '../../../catalog/public/catalog.types';
import type { AssignmentService } from '../../assignment/assignment.service';
import { AssignmentConflictError } from '../../public/licensing.errors';
import type { GrantRequestGateHook } from '../../public/licensing.extension-points';
import { NO_LONGER_APPLIES } from '../../public/licensing.types';
import type { ProvisioningTaskReasonRepo } from '../provisioning-task-reason.repo';
import type { ProvisioningTaskRepo } from '../provisioning-task.repo';
import type { ForRevocationWithdrawalService } from '../revocation-withdrawal/for-revocation-withdrawal.service';
import { ProvisioningReplacementService } from './provisioning-replacement.service';

describe('ProvisioningReplacementService', () => {
  const tx = { kind: 'tx' } as never;
  const actor = {
    appUserId: 'user-1',
    employeeId: 'admin-1',
    roles: ['IT_ADMIN'],
  } as unknown as AuthenticatedPrincipal;
  const target = {
    kind: 'SUBSCRIPTION',
    planId: 'plan-1',
    subscriptionId: 'sub-1',
    provisioningType: 'K2',
    status: 'ACTIVE',
    purchasedQuantity: 5,
    applicationStatus: 'ACTIVE',
  } as unknown as SeatTarget;

  const claimed = {
    status: 'GRANTABLE' as const,
    seat: 'PERSONAL' as const,
    employeeId: 'emp-1',
    planId: 'plan-1',
    departmentId: 'dept-1',
    replacesAssignmentId: 'asg-old',
    expectedEndDate: null,
    termBound: false,
    termMonths: 1,
  };

  beforeEach(() => jest.clearAllMocks());

  it('keeps the old path (returns null without 422) when the old right cannot end for this grant', async () => {
    const listOf = jest.fn();
    const service = new ProvisioningReplacementService(
      {} as unknown as ProvisioningTaskRepo,
      { listOf } as unknown as ProvisioningTaskReasonRepo,
      {} as unknown as ForRevocationWithdrawalService,
      { canEndReplacedByGrant: jest.fn(() => Promise.resolve(false)) } as unknown as AssignmentService,
      { get: jest.fn() } as unknown as GrantRequestGateHook,
    );

    const result = await service.endReplacedRight(tx, actor, {
      claimed,
      target,
      requestId: 'req-1',
      today: '2026-11-23',
      organizationId: 'org-1',
      lockedRevocation: { id: 'rev-1', status: 'IN_PROGRESS' } as never,
    });

    expect(result).toBeNull();
    expect(listOf).not.toHaveBeenCalled();
  });

  it('ends the old right and reports it when lockedRevocation is null', async () => {
    const endReplacedByGrant = jest.fn(() => Promise.resolve('asg-old'));
    const reportRightReplaced = jest.fn(() => Promise.resolve());
    const service = new ProvisioningReplacementService(
      {} as unknown as ProvisioningTaskRepo,
      {} as unknown as ProvisioningTaskReasonRepo,
      {} as unknown as ForRevocationWithdrawalService,
      {
        canEndReplacedByGrant: jest.fn(() => Promise.resolve(true)),
        endReplacedByGrant,
      } as unknown as AssignmentService,
      { get: () => ({ reportRightReplaced }) } as unknown as GrantRequestGateHook,
    );

    const result = await service.endReplacedRight(tx, actor, {
      claimed,
      target,
      requestId: 'req-1',
      today: '2026-11-23',
      organizationId: 'org-1',
      lockedRevocation: null,
    });

    expect(result).toBe('asg-old');
    expect(endReplacedByGrant).toHaveBeenCalledWith(tx, actor, {
      organizationId: 'org-1',
      requestId: 'req-1',
      employeeId: 'emp-1',
      replacesAssignmentId: 'asg-old',
      target,
      today: '2026-11-23',
      revocationUnderWay: false,
    });
    expect(reportRightReplaced).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ assignmentId: 'asg-old', provisioningType: 'K2', endedOn: '2026-11-23' }),
    );
  });

  it('withdraws TRANSFER reasons when QUEUED revocation has only TRANSFER reasons, then ends old right and reports it', async () => {
    const withdraw = jest.fn(() => Promise.resolve({ taskId: 'rev-1', outcome: 'CANCELLED' }));
    const endReplacedByGrant = jest.fn(() => Promise.resolve('asg-old'));
    const reportRightReplaced = jest.fn(() => Promise.resolve());
    const service = new ProvisioningReplacementService(
      {} as unknown as ProvisioningTaskRepo,
      {
        listOf: jest.fn(() => Promise.resolve([{ id: 'reason-1', source: 'TRANSFER', referenceId: 'transfer-1' }])),
      } as unknown as ProvisioningTaskReasonRepo,
      { withdraw } as unknown as ForRevocationWithdrawalService,
      {
        canEndReplacedByGrant: jest.fn(() => Promise.resolve(true)),
        endReplacedByGrant,
      } as unknown as AssignmentService,
      { get: () => ({ reportRightReplaced }) } as unknown as GrantRequestGateHook,
    );

    const result = await service.endReplacedRight(tx, actor, {
      claimed,
      target,
      requestId: 'req-1',
      today: '2026-11-23',
      organizationId: 'org-1',
      lockedRevocation: { id: 'rev-1', status: 'QUEUED' } as never,
    });

    expect(result).toBe('asg-old');
    expect(withdraw).toHaveBeenCalledWith(tx, actor, {
      assignmentId: 'asg-old',
      source: 'TRANSFER',
      referenceId: 'transfer-1',
      cause: NO_LONGER_APPLIES,
    });
    expect(endReplacedByGrant).toHaveBeenCalledWith(tx, actor, expect.objectContaining({ revocationUnderWay: false }));
    expect(reportRightReplaced).toHaveBeenCalledTimes(1);
  });

  it('throws AssignmentConflictError OVERLAP with blockingRevocation when QUEUED task also has DEPARTURE reason', async () => {
    const withdraw = jest.fn();
    const service = new ProvisioningReplacementService(
      {} as unknown as ProvisioningTaskRepo,
      {
        listOf: jest.fn(() =>
          Promise.resolve([
            { id: 'reason-1', source: 'TRANSFER', referenceId: 'transfer-1' },
            { id: 'reason-2', source: 'DEPARTURE', referenceId: 'dep-1' },
          ]),
        ),
      } as unknown as ProvisioningTaskReasonRepo,
      { withdraw } as unknown as ForRevocationWithdrawalService,
      { canEndReplacedByGrant: jest.fn(() => Promise.resolve(true)) } as unknown as AssignmentService,
      { get: jest.fn() } as unknown as GrantRequestGateHook,
    );

    await expect(
      service.endReplacedRight(tx, actor, {
        claimed,
        target,
        requestId: 'req-1',
        today: '2026-11-23',
        organizationId: 'org-1',
        lockedRevocation: { id: 'rev-1', status: 'QUEUED' } as never,
      }),
    ).rejects.toMatchObject({
      name: 'AssignmentConflictError',
      conflict: 'OVERLAP',
      conflictingAssignmentId: 'asg-old',
      blockingRevocation: { revocationTaskId: 'rev-1', revocationStatus: 'QUEUED' },
    });
    expect(withdraw).not.toHaveBeenCalled();
  });

  it.each(['IN_PROGRESS', 'FAILED', 'COMPLETED'] as const)(
    'throws AssignmentConflictError OVERLAP with blockingRevocation when task is %s',
    async (status) => {
      const service = new ProvisioningReplacementService(
        {} as unknown as ProvisioningTaskRepo,
        {
          listOf: jest.fn(() => Promise.resolve([{ id: 'reason-1', source: 'TRANSFER', referenceId: 'transfer-1' }])),
        } as unknown as ProvisioningTaskReasonRepo,
        { withdraw: jest.fn() } as unknown as ForRevocationWithdrawalService,
        { canEndReplacedByGrant: jest.fn(() => Promise.resolve(true)) } as unknown as AssignmentService,
        { get: jest.fn() } as unknown as GrantRequestGateHook,
      );

      let caught: unknown;
      try {
        await service.endReplacedRight(tx, actor, {
          claimed,
          target,
          requestId: 'req-1',
          today: '2026-11-23',
          organizationId: 'org-1',
          lockedRevocation: { id: 'rev-1', status } as never,
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(AssignmentConflictError);
      expect(caught).toMatchObject({
        conflict: 'OVERLAP',
        conflictingAssignmentId: 'asg-old',
        blockingRevocation: { revocationTaskId: 'rev-1', revocationStatus: status },
      });
    },
  );
});
