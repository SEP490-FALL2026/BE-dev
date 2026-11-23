import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { OrganizationChangeService } from '../change-announcement/organization-change.service';
import type { CostCenterCatalogueService } from '../cost-center/cost-center-catalogue.service';
import type { DepartmentRecordService } from '../department/department-record.service';
import type { EmployeeRecordService } from '../employee/employee-record.service';
import type { OrganizationContextService } from '../organization-context.service';
import type { OrganizationRepo } from '../organization.repo';
import { OrganizationReadApi } from './organization-read.api';

describe('OrganizationReadApi tx forwarding', () => {
  const tx = { name: 'tx' } as unknown as DbTx;

  const makeApi = () => {
    const departments = {
      hasHeadPeriodFrom: jest.fn().mockResolvedValue(true),
      headedDepartment: jest.fn().mockResolvedValue({ departmentId: 'dept-1' }),
      itAdminScopeOf: jest.fn().mockResolvedValue(['dept-1', 'dept-2']),
      itAdminActingScopeOf: jest.fn().mockResolvedValue(['dept-1']),
      findMany: jest.fn().mockResolvedValue([
        { id: 'dept-1', itAdmin: { employeeId: 'ha', employeeStatus: 'ACTIVE' } },
        { id: 'dept-2', itAdmin: null },
      ]),
      activeItSubstitutesFor: jest
        .fn()
        .mockResolvedValue([{ departmentId: 'dept-1', substituteEmployeeId: 'minh', substituteStatus: 'ACTIVE' }]),
    };
    const employees = {
      workDepartmentsOf: jest.fn().mockResolvedValue(new Map([['emp-1', 'dept-1']])),
      employeeIdsOfWorkDepartments: jest.fn().mockResolvedValue(['emp-1']),
    };
    const context = {
      businessToday: jest.fn().mockResolvedValue('2026-11-23'),
    };
    const api = new OrganizationReadApi(
      {} as OrganizationRepo,
      departments as unknown as DepartmentRecordService,
      employees as unknown as EmployeeRecordService,
      {} as CostCenterCatalogueService,
      {} as OrganizationChangeService,
      context as unknown as OrganizationContextService,
    );

    return { api, departments, employees, context };
  };

  it('forwards tx in isDepartmentHead to businessToday and hasHeadPeriodFrom', async () => {
    const { api, departments, context } = makeApi();

    const result = await api.isDepartmentHead('emp-1', tx);

    expect(result).toBe(true);
    expect(context.businessToday).toHaveBeenCalledWith(expect.any(Date), tx);
    expect(departments.hasHeadPeriodFrom).toHaveBeenCalledWith(tx, 'emp-1', '2026-11-23');
  });

  it('forwards tx in getHeadedDepartment to businessToday and headedDepartment', async () => {
    const { api, departments, context } = makeApi();

    const result = await api.getHeadedDepartment('emp-1', undefined, tx);

    expect(result).toEqual({ departmentId: 'dept-1' });
    expect(context.businessToday).toHaveBeenCalledWith(expect.any(Date), tx);
    expect(departments.headedDepartment).toHaveBeenCalledWith('emp-1', '2026-11-23', tx);
  });

  it('resolves acting scope, acting IT admins batch, workDepartmentsOf and getEmployeeIdsOfWorkDepartments', async () => {
    const { api, departments, employees } = makeApi();
    const usable = jest.fn().mockResolvedValue(new Set(['minh']));

    expect(await api.getItAdminActingScope('minh', usable, tx)).toEqual(['dept-1']);
    expect(departments.itAdminActingScopeOf).toHaveBeenCalledWith('minh', usable, tx);

    const acting = await api.itAdminsActingFor(['dept-1', 'dept-2', 'dept-missing'], usable, tx);
    expect(departments.findMany).toHaveBeenCalledWith(['dept-1', 'dept-2', 'dept-missing'], tx);
    expect(departments.activeItSubstitutesFor).toHaveBeenCalledWith(['dept-1', 'dept-2', 'dept-missing'], tx);
    expect(usable).toHaveBeenCalledWith(['ha', 'minh']);
    expect(acting.get('dept-1')).toEqual({
      inCharge: null,
      substitute: 'minh',
      defaultAssignee: 'minh',
      actors: ['minh'],
    });
    expect(acting.get('dept-2')).toEqual({
      inCharge: null,
      substitute: null,
      defaultAssignee: null,
      actors: [],
    });
    expect(acting.has('dept-missing')).toBe(false);

    expect(await api.workDepartmentsOf(['emp-1'], '2026-11-23', tx)).toEqual(new Map([['emp-1', 'dept-1']]));
    expect(employees.workDepartmentsOf).toHaveBeenCalledWith(['emp-1'], '2026-11-23', tx);

    expect(await api.getEmployeeIdsOfWorkDepartments(['dept-1'], '2026-11-23', tx)).toEqual(['emp-1']);
    expect(employees.employeeIdsOfWorkDepartments).toHaveBeenCalledWith(['dept-1'], '2026-11-23', tx);
  });
});
