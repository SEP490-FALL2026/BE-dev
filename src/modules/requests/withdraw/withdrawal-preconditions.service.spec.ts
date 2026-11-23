import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { LicensingApi } from '../../licensing/public/licensing.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AccessRequestRepo } from '../access-request/access-request.repo';
import type { SpendStatusService } from '../spend/spend-status.service';
import { WithdrawalPreconditions } from './withdrawal-preconditions.service';

describe('WithdrawalPreconditions.require', () => {
  it('forwards tx to organizationReads.getHeadedDepartment', async () => {
    const tx = { name: 'tx' } as unknown as DbTx;
    const actor = {
      employeeId: 'emp-head',
      appUserId: 'user-head',
      roles: ['MANAGER'],
      directRoles: ['MANAGER'],
    } as unknown as AuthenticatedPrincipal;
    const repo = {
      lockById: jest.fn().mockResolvedValue({
        id: 'req-1',
        state: 'PENDING',
        departmentId: 'dept-1',
        requesterEmployeeId: 'emp-head',
        beneficiaryEmployeeIds: ['emp-other'],
        policy: { chain: ['NEED'], slaWorkingDays: 2 },
        needStep: { state: 'PENDING', assigneeEmployeeId: 'emp-head' },
        spendStep: null,
        assessmentStep: null,
      }),
    };
    const licensing = {
      lockGrantOfRequest: jest.fn().mockResolvedValue(undefined),
    };
    const organizationReads = {
      businessToday: jest.fn().mockResolvedValue('2026-11-23'),
      getHeadedDepartment: jest.fn().mockResolvedValue({ departmentId: 'dept-1' }),
    };
    const spendStatus = {
      of: jest.fn().mockResolvedValue(null),
    };

    const service = new WithdrawalPreconditions(
      repo as unknown as AccessRequestRepo,
      licensing as unknown as LicensingApi,
      organizationReads as unknown as OrganizationReadApi,
      spendStatus as unknown as SpendStatusService,
    );

    await service.require(tx, actor, 'req-1', 'No longer needed');

    expect(organizationReads.getHeadedDepartment).toHaveBeenCalledWith('emp-head', '2026-11-23', tx);
  });
});
