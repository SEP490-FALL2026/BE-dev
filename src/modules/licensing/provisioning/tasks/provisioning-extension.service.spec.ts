import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../../audit/public/audit.api';
import type { IdentityAccessApi } from '../../../identity-access/public/identity-access.api';
import type { OperatingParametersApi } from '../../../operating-parameters/public/operating-parameters.api';
import type { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { ProvisioningTaskRepo } from '../provisioning-task.repo';
import { ProvisioningExtensionService } from './provisioning-extension.service';

describe('ProvisioningExtensionService (H18 defaultAssignee)', () => {
  it('assigns substitute ?? inCharge via workDepartmentsOf + itAdminsActingFor in tx', async () => {
    const tx = { name: 'tx' } as unknown as DbTx;
    const insert = jest.fn().mockResolvedValue({ id: 'task-ext-1' });
    const workDepartmentsOf = jest.fn().mockResolvedValue(new Map([['emp-1', 'dept-1']]));
    const itAdminsActingFor = jest
      .fn()
      .mockResolvedValue(
        new Map([
          ['dept-1', { inCharge: 'it-1', substitute: 'it-sub', defaultAssignee: 'it-sub', actors: ['it-1', 'it-sub'] }],
        ]),
      );
    const service = new ProvisioningExtensionService(
      { insert } as unknown as ProvisioningTaskRepo,
      {
        getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
        businessToday: jest.fn().mockResolvedValue('2026-11-23'),
        workDepartmentsOf,
        itAdminsActingFor,
      } as unknown as OrganizationReadApi,
      { findUsableItAdminEmployeeIds: jest.fn() } as unknown as IdentityAccessApi,
      { getValue: jest.fn().mockResolvedValue('3') } as unknown as OperatingParametersApi,
      { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi,
    );

    await service.open(tx, { appUserId: 'app-1' } as AuthenticatedPrincipal, {
      assignmentId: 'asg-1',
      holderEmployeeId: 'emp-1',
      requestId: 'req-1',
      now: new Date('2026-11-23T00:00:00Z'),
    });

    expect(workDepartmentsOf).toHaveBeenCalledWith(['emp-1'], '2026-11-23', tx);
    expect(itAdminsActingFor).toHaveBeenCalledWith(['dept-1'], expect.any(Function), tx);
    expect(insert).toHaveBeenCalledWith(tx, expect.objectContaining({ defaultResponsibleEmployeeId: 'it-sub' }));
  });
});
