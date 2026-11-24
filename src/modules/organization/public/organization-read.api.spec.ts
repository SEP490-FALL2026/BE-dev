import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { OrganizationChangeService } from '../change-announcement/organization-change.service';
import type { CostCenterCatalogueService } from '../cost-center/cost-center-catalogue.service';
import type { DepartmentRecordService } from '../department/department-record.service';
import type { EmployeeRecordService } from '../employee/employee-record.service';
import type { OrganizationContextService } from '../organization-context.service';
import type { OrganizationRepo } from '../organization.repo';
import type { UnplacedWorkDesignationRepo } from '../unplaced-work-designation/unplaced-work-designation.repo';
import { OrganizationReadApi } from './organization-read.api';
import { EmployeeNotStartedError } from './organization.errors';
import { unplacedWorkKey } from './organization.types';

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
      activeWithItAdmin: jest.fn().mockResolvedValue([
        {
          id: 'dept-start',
          code: 'START',
          name: 'Starting',
          itAdminEmployeeId: null,
          itAdminStatus: null,
          starting: true,
        },
        {
          id: 'dept-1',
          code: 'DES',
          name: 'Design',
          itAdminEmployeeId: 'ha',
          itAdminStatus: 'ACTIVE',
          starting: false,
        },
      ]),
    };
    const employees = {
      workDepartmentsOf: jest.fn().mockResolvedValue(new Map([['emp-1', 'dept-1']])),
      employeeIdsOfWorkDepartments: jest.fn().mockResolvedValue(['emp-1']),
      notStartedAmong: jest.fn().mockResolvedValue(new Set()),
    };
    const context = {
      businessToday: jest.fn().mockResolvedValue('2026-11-23'),
    };
    const unplacedWorkDesignations = {
      findActiveForResolution: jest.fn().mockResolvedValue([
        {
          workKind: 'PROVISIONING_TASK',
          workId: 'task-1',
          employeeId: 'emp-binh',
          designeeEmployeeId: 'emp-it-b',
          designeeStatus: 'ACTIVE',
          employeeHasAnyPlacement: false,
        },
        {
          workKind: 'OFFBOARDING_CASE',
          workId: 'case-placed',
          employeeId: 'emp-placed',
          designeeEmployeeId: 'emp-it-b',
          designeeStatus: 'ACTIVE',
          employeeHasAnyPlacement: true,
        },
        {
          workKind: 'DEVICE',
          workId: 'dev-mismatch',
          employeeId: 'emp-wrong',
          designeeEmployeeId: 'emp-it-b',
          designeeStatus: 'ACTIVE',
          employeeHasAnyPlacement: false,
        },
        {
          workKind: 'DEVICE_RETURN_TASK',
          workId: 'ret-unusable',
          employeeId: 'emp-binh',
          designeeEmployeeId: 'emp-it-locked',
          designeeStatus: 'ACTIVE',
          employeeHasAnyPlacement: false,
        },
      ]),
      findActiveWorkIdsForDesignee: jest.fn().mockResolvedValue(['task-1']),
      listActiveForUnplacedEmployees: jest.fn().mockResolvedValue([
        {
          id: 'des-1',
          organizationId: 'org-1',
          workKind: 'PROVISIONING_TASK',
          workId: 'task-1',
          employeeId: 'emp-binh',
          designeeEmployeeId: 'emp-it-b',
          designeeStatus: 'ACTIVE',
        },
      ]),
    };
    const api = new OrganizationReadApi(
      {} as OrganizationRepo,
      departments as unknown as DepartmentRecordService,
      employees as unknown as EmployeeRecordService,
      {} as CostCenterCatalogueService,
      {} as OrganizationChangeService,
      context as unknown as OrganizationContextService,
      unplacedWorkDesignations as unknown as UnplacedWorkDesignationRepo,
    );

    return { api, departments, employees, context, unplacedWorkDesignations };
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

  it('filters out starting departments and omits starting in getActiveDepartmentsForItCoverage', async () => {
    const { api, departments } = makeApi();

    const result = await api.getActiveDepartmentsForItCoverage(tx);

    expect(departments.activeWithItAdmin).toHaveBeenCalledWith(tx);
    expect(result).toEqual([
      {
        id: 'dept-1',
        code: 'DES',
        name: 'Design',
        itAdminEmployeeId: 'ha',
        itAdminStatus: 'ACTIVE',
      },
    ]);
  });

  it('resolves unplaced-work acting designees in one batch and filters out placed, mismatched, or unusable rows', async () => {
    const { api, unplacedWorkDesignations } = makeApi();
    const usable = jest.fn().mockResolvedValue(new Set(['emp-it-b']));

    const works = [
      { workKind: 'PROVISIONING_TASK' as const, workId: 'task-1', employeeId: 'emp-binh' },
      { workKind: 'OFFBOARDING_CASE' as const, workId: 'case-placed', employeeId: 'emp-placed' },
      { workKind: 'DEVICE' as const, workId: 'dev-mismatch', employeeId: 'emp-binh' },
      { workKind: 'DEVICE_RETURN_TASK' as const, workId: 'ret-unusable', employeeId: 'emp-binh' },
      { workKind: 'PROVISIONING_TASK' as const, workId: 'task-none', employeeId: 'emp-binh' },
    ];

    const resolved = await api.itAdminsActingForUnplacedWork(works, usable, tx);

    expect(unplacedWorkDesignations.findActiveForResolution).toHaveBeenCalledWith(works, tx);
    expect(usable).toHaveBeenCalledWith(['emp-it-b', 'emp-it-locked']);
    expect(resolved.get(unplacedWorkKey('PROVISIONING_TASK', 'task-1'))).toBe('emp-it-b');
    expect(resolved.get(unplacedWorkKey('OFFBOARDING_CASE', 'case-placed'))).toBeNull();
    expect(resolved.get(unplacedWorkKey('DEVICE', 'dev-mismatch'))).toBeNull();
    expect(resolved.get(unplacedWorkKey('DEVICE_RETURN_TASK', 'ret-unusable'))).toBeNull();
    expect(resolved.get(unplacedWorkKey('PROVISIONING_TASK', 'task-none'))).toBeNull();

    expect(await api.itAdminsActingForUnplacedWork([], usable, tx)).toEqual(new Map());

    expect(await api.findActiveUnplacedWorkIdsForDesignee('emp-it-b', 'PROVISIONING_TASK', tx)).toEqual(['task-1']);
    expect(unplacedWorkDesignations.findActiveWorkIdsForDesignee).toHaveBeenCalledWith(
      'emp-it-b',
      'PROVISIONING_TASK',
      tx,
    );

    expect(await api.listActiveUnplacedWorkDesignations(tx)).toEqual([
      {
        id: 'des-1',
        organizationId: 'org-1',
        workKind: 'PROVISIONING_TASK',
        workId: 'task-1',
        employeeId: 'emp-binh',
        designeeEmployeeId: 'emp-it-b',
        designeeStatus: 'ACTIVE',
      },
    ]);
    expect(unplacedWorkDesignations.listActiveForUnplacedEmployees).toHaveBeenCalledWith(tx);
  });

  it('forwards notStartedAmong with explicit or default businessToday and asserts in assertStartedInDepartment', async () => {
    const { api, employees, context } = makeApi();
    employees.notStartedAmong.mockResolvedValueOnce(new Set(['emp-future']));

    expect(await api.notStartedAmong([], undefined, tx)).toEqual(new Set());
    expect(context.businessToday).not.toHaveBeenCalled();

    expect(await api.notStartedAmong(['emp-future'], undefined, tx)).toEqual(new Set(['emp-future']));
    expect(context.businessToday).toHaveBeenCalledWith(expect.any(Date), tx);
    expect(employees.notStartedAmong).toHaveBeenCalledWith(['emp-future'], '2026-11-23', tx);

    employees.notStartedAmong.mockResolvedValueOnce(new Set(['emp-2']));
    await expect(api.assertStartedInDepartment(['emp-1', 'emp-2'], '2026-11-24', tx)).rejects.toThrow(
      EmployeeNotStartedError,
    );
    expect(employees.notStartedAmong).toHaveBeenLastCalledWith(['emp-1', 'emp-2'], '2026-11-24', tx);

    employees.notStartedAmong.mockResolvedValueOnce(new Set());
    await expect(api.assertStartedInDepartment(['emp-1'], '2026-11-24', tx)).resolves.toBeUndefined();
  });
});
