import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { Prisma } from '../../../generated/prisma/client';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import { ProvisioningPlanBoundToDeviceError } from '../public/licensing.errors';
import { LicenseKeyAssignmentService } from './license-key-assignment.service';
import type { LicenseKeyRepo } from './license-key.repo';

describe('LicenseKeyAssignmentService (S-4)', () => {
  const tx = {} as DbTx;
  const actor = {
    subject: 'u-1',
    appUserId: 'u-1',
    employeeId: 'e-it',
    sessionId: 's-1',
    directRoles: ['IT_ADMIN'],
    roles: ['IT_ADMIN'],
  } as AuthenticatedPrincipal;

  it('maps DB constraint license_key_assignment_plan_account (23514) to ProvisioningPlanBoundToDeviceError without writing audit', async () => {
    const dbError = new Prisma.PrismaClientKnownRequestError('trigger error', {
      code: 'P2004',
      clientVersion: 'test',
      meta: {
        driverAdapterError: { cause: { originalCode: '23514', constraint: 'license_key_assignment_plan_account' } },
      },
    });
    const record = jest.fn();
    const service = new LicenseKeyAssignmentService(
      {
        lock: jest.fn().mockResolvedValue({
          id: 'k-1',
          subscriptionId: 'sub-1',
          status: 'IN_STORE',
          withdrawnAt: null,
        }),
        assign: jest.fn().mockRejectedValue(dbError),
      } as unknown as LicenseKeyRepo,
      { lockSeatTarget: jest.fn().mockResolvedValue(null) } as unknown as CatalogApi,
      { record } as unknown as AuditApi,
    );

    await expect(
      service.assign(tx, actor, {
        organizationId: 'org-1',
        licenseKeyId: 'k-1',
        assignmentId: 'asg-1',
        subscriptionId: 'sub-1',
      }),
    ).rejects.toBeInstanceOf(ProvisioningPlanBoundToDeviceError);

    expect(record).not.toHaveBeenCalled();
  });
});
