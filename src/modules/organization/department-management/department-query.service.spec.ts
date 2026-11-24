import type { ObjectStoragePort } from '../../../infrastructure/object-storage/object-storage.port';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { DepartmentItSubstituteRepo } from '../department-it-substitute/department-it-substitute.repo';
import type { DepartmentRecordService } from '../department/department-record.service';
import type { DepartmentRepo } from '../department/department.repo';
import type { OrganizationContextService } from '../organization-context.service';
import { EmployeeAccountsHook, type EmployeeAccounts } from '../public/organization.extension-points';
import { DepartmentQueryService } from './department-query.service';
import type { DepartmentTechnicalMembersRepo } from './department-technical-members.repo';

const admin: AuthenticatedPrincipal = {
  subject: 'app-user-1',
  appUserId: 'app-user-1',
  sessionId: 'session-1',
  employeeId: 'emp-admin',
  directRoles: ['SUPER_ADMIN'],
  roles: ['SUPER_ADMIN'],
};

describe('DepartmentQueryService (itSubstitute & itCoverage)', () => {
  const baseDept = (id: string, itAdminId: string | null) => ({
    id,
    code: id.toUpperCase(),
    name: `Dept ${id}`,
    functionDescription: null,
    status: 'ACTIVE' as const,
    costCenter: null,
    itAdmin: itAdminId
      ? {
          employeeId: itAdminId,
          employeeCode: `E-${itAdminId}`,
          fullName: `Name ${itAdminId}`,
          employeeStatus: 'ACTIVE' as const,
        }
      : null,
    effectiveFrom: '2026-10-01',
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    deactivatedAt: null,
    avatarObjectKey: null,
    avatarContentType: null,
    starting: false,
  });

  it('batches active substitute and usability lookups across departmentList and computes itCoverage', async () => {
    const repo = {
      list: jest.fn().mockResolvedValue({
        items: [baseDept('d1', 'ha'), baseDept('d2', 'locked'), baseDept('d3', null)],
        total: 3,
      }),
      memberCounts: jest.fn().mockResolvedValue(new Map()),
    };
    const departments = {
      headsOn: jest.fn().mockResolvedValue(new Map()),
      itAdminScopeOf: jest.fn(),
    };
    const substitutes = {
      activeByDepartmentIds: jest.fn().mockResolvedValue(
        new Map([
          [
            'd2',
            {
              id: 'sub-2',
              employee: { id: 'minh', fullName: 'Minh' },
              employeeStatus: 'ACTIVE' as const,
              appointedAt: new Date('2026-11-23T10:00:00.000Z'),
            },
          ],
        ]),
      ),
    };
    const accounts = {
      findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(['ha', 'minh'])),
    };
    const hook = new EmployeeAccountsHook();
    hook.bind(accounts as unknown as EmployeeAccounts);

    const queryService = new DepartmentQueryService(
      repo as unknown as DepartmentRepo,
      {} as DepartmentTechnicalMembersRepo,
      { businessToday: jest.fn().mockResolvedValue('2026-11-23') } as unknown as OrganizationContextService,
      departments as unknown as DepartmentRecordService,
      substitutes as unknown as DepartmentItSubstituteRepo,
      hook,
      { createDownloadUrl: jest.fn() } as unknown as ObjectStoragePort,
    );

    const page = await queryService.list(admin, { page: 1, pageSize: 20 });

    expect(substitutes.activeByDepartmentIds).toHaveBeenCalledWith(['d1', 'd2', 'd3']);
    expect(accounts.findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['ha', 'locked', 'minh']);
    expect(
      page.items.map((item) => ({ id: item.id, itCoverage: item.itCoverage, itSubstitute: item.itSubstitute })),
    ).toEqual([
      { id: 'd1', itCoverage: 'IN_CHARGE', itSubstitute: null },
      {
        id: 'd2',
        itCoverage: 'SUBSTITUTE',
        itSubstitute: {
          id: 'sub-2',
          employee: { id: 'minh', fullName: 'Minh' },
          appointedAt: new Date('2026-11-23T10:00:00.000Z'),
        },
      },
      { id: 'd3', itCoverage: 'NONE', itSubstitute: null },
    ]);
  });
});
