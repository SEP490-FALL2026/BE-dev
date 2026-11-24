import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { IdentityAccessApi } from '../../../identity-access/public/identity-access.api';
import type { OperatingParametersApi } from '../../../operating-parameters/public/operating-parameters.api';
import type { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { CatalogApi } from '../../../catalog/public/catalog.api';
import type { GrantRequestGateHook } from '../../public/licensing.extension-points';
import { ProvisioningGrantPlanner } from './provisioning-grant-planner.service';

const actor: AuthenticatedPrincipal = {
  subject: 'app-it-1',
  appUserId: 'app-it-1',
  sessionId: 'session-it-1',
  employeeId: 'it-1',
  directRoles: ['IT_ADMIN'],
  roles: ['IT_ADMIN'],
};

describe('ProvisioningGrantPlanner (H18 defaultAssignee)', () => {
  it('picks substitute ?? inCharge as default responsible via workDepartmentsOf + itAdminsActingFor', async () => {
    const workDepartmentsOf = jest.fn().mockResolvedValue(new Map([['emp-1', 'dept-1']]));
    const itAdminsActingFor = jest
      .fn()
      .mockResolvedValue(
        new Map([
          ['dept-1', { inCharge: 'it-1', substitute: 'it-sub', defaultAssignee: 'it-sub', actors: ['it-1', 'it-sub'] }],
        ]),
      );
    const planner = new ProvisioningGrantPlanner(
      {
        get: () => ({
          check: jest.fn().mockResolvedValue({
            status: 'GRANTABLE',
            seat: 'PERSONAL',
            employeeId: 'emp-1',
            planId: 'plan-1',
            departmentId: 'dept-1',
          }),
        }),
      } as unknown as GrantRequestGateHook,
      {
        findSeatTarget: jest.fn().mockResolvedValue({ planId: 'plan-1', provisioningType: 'K5' }),
      } as unknown as CatalogApi,
      {
        getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
        businessToday: jest.fn().mockResolvedValue('2026-11-23'),
        workDepartmentsOf,
        itAdminsActingFor,
        getEmployee: jest.fn().mockResolvedValue({ contractEndDate: null, employmentType: 'STAFF' }),
      } as unknown as OrganizationReadApi,
      { findUsableItAdminEmployeeIds: jest.fn() } as unknown as IdentityAccessApi,
      { getValue: jest.fn().mockResolvedValue('3') } as unknown as OperatingParametersApi,
    );

    const planned = await planner.plan(actor, { requestId: 'req-1' });

    expect(workDepartmentsOf).toHaveBeenCalledWith(['emp-1'], '2026-11-23');
    expect(itAdminsActingFor).toHaveBeenCalledWith(['dept-1'], expect.any(Function));
    expect(planned.inCharge).toEqual({ departmentId: 'dept-1', itAdminEmployeeId: 'it-sub' });
  });
});
