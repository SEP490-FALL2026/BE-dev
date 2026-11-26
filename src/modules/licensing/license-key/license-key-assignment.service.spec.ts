import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { Prisma } from '../../../generated/prisma/client';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { LicenseLotApi } from '../../catalog/public/license-lot.api';
import { ProvisioningPlanBoundToDeviceError } from '../public/licensing.errors';
import { LicenseKeyStateError } from './license-key.errors';
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

  it('locks the lot via LicenseLotApi before locking the key when assignment subscriptionId is null (W3-24)', async () => {
    const order: string[] = [];
    const lockLot = jest.fn().mockImplementation(() => {
      order.push('lockLot');
      return Promise.resolve(null);
    });
    const lock = jest.fn().mockImplementation(() => {
      order.push('lockKey');
      return Promise.resolve({
        id: 'k-1',
        subscriptionId: 'lot-1',
        licenseLotId: 'lot-1',
        costBorne: false,
        status: 'IN_STORE',
        withdrawnAt: null,
      });
    });
    const service = new LicenseKeyAssignmentService(
      { lock, assign: jest.fn().mockResolvedValue(undefined) } as unknown as LicenseKeyRepo,
      { lockSeatTarget: jest.fn() } as unknown as CatalogApi,
      { record: jest.fn() } as unknown as AuditApi,
      { lockLot } as unknown as LicenseLotApi,
    );

    const result = await service.assign(tx, actor, {
      organizationId: 'org-1',
      licenseKeyId: 'k-1',
      assignmentId: 'asg-1',
      subscriptionId: null,
      licenseLotId: 'lot-1',
    });

    expect(order).toEqual(['lockLot', 'lockKey']);
    expect(lockLot).toHaveBeenCalledWith(tx, 'lot-1');
    expect(result).toEqual({ licenseKeyId: 'k-1', licenseLotId: 'lot-1', costBorne: false });
  });

  it('refuses assigning a key belonging to a different lot than the chosen lot', async () => {
    const service = new LicenseKeyAssignmentService(
      {
        lock: jest.fn().mockResolvedValue({
          id: 'k-1',
          subscriptionId: 'lot-other',
          licenseLotId: 'lot-other',
          costBorne: true,
          status: 'IN_STORE',
          withdrawnAt: null,
        }),
        assign: jest.fn(),
      } as unknown as LicenseKeyRepo,
      { lockSeatTarget: jest.fn() } as unknown as CatalogApi,
      { record: jest.fn() } as unknown as AuditApi,
      { lockLot: jest.fn() } as unknown as LicenseLotApi,
    );

    await expect(
      service.assign(tx, actor, {
        organizationId: 'org-1',
        licenseKeyId: 'k-1',
        assignmentId: 'asg-1',
        subscriptionId: null,
        licenseLotId: 'lot-chosen',
      }),
    ).rejects.toMatchObject({ name: LicenseKeyStateError.name, problem: 'SUBSCRIPTION_MISMATCH' });
  });
});
