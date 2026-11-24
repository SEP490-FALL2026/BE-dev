import { Test } from '@nestjs/testing';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { DepartmentItSubstituteRepo } from '../department-it-substitute/department-it-substitute.repo';
import {
  DepartmentForbiddenError,
  DepartmentInactiveError,
  DepartmentItAdminInvalidError,
  DepartmentItAdminLimitReachedError,
  DepartmentNameInvalidError,
  DepartmentNotFoundError,
  DepartmentUpdateEmptyError,
} from '../department/department.errors';
import { DepartmentRepo } from '../department/department.repo';
import { DepartmentUseService } from '../department/department-use.service';
import { EmployeeRecordService } from '../employee/employee-record.service';
import { OrganizationContextService } from '../organization-context.service';
import { EmployeeNotFoundError } from '../public/organization.errors';
import {
  DepartmentCreationWindowHook,
  DepartmentServiceAccountReaderHook,
  EmployeeAccountsHook,
  type EmployeeAccounts,
} from '../public/organization.extension-points';
import { DepartmentItAdminService } from './department-it-admin.service';
import { toDepartmentApiException } from './department.http-errors';
import { DepartmentService } from './department.service';

const actor = (role: string): AuthenticatedPrincipal => ({
  subject: 'app-user-1',
  appUserId: 'app-user-1',
  sessionId: 'session-1',
  employeeId: 'emp-actor',
  directRoles: [role],
  roles: [role],
});

describe('DepartmentService.update lock order and guards (B-8 / S2-9)', () => {
  const tx = { name: 'tx' };
  const superAdmin = actor('SUPER_ADMIN');
  const lockCalls: string[] = [];
  type DeptRow = {
    id: string;
    name: string;
    functionDescription: string | null;
    status: 'ACTIVE' | 'INACTIVE';
    itAdmin: { employeeId: string } | null;
  } | null;
  let nextLockedDept: DeptRow = {
    id: 'dep-1',
    name: 'Design',
    functionDescription: null,
    status: 'ACTIVE',
    itAdmin: null,
  };

  const lockEmployee = jest.fn(() => {
    lockCalls.push('tier1:employee');
    return Promise.resolve();
  });
  const getEmployee = jest.fn().mockResolvedValue({ id: 'emp-it', status: 'ACTIVE' });
  const departments = {
    lock: jest.fn(() => {
      lockCalls.push('tier2:department');
      return Promise.resolve(nextLockedDept);
    }),
    update: jest.fn().mockResolvedValue(undefined),
    countActiveInChargeOf: jest.fn().mockResolvedValue(0),
    countActiveInChargeExcludingStarting: jest.fn().mockResolvedValue(1),
  };
  const substitutes = {
    endActiveForDepartment: jest.fn().mockResolvedValue(null),
    countActiveBySubstitute: jest.fn().mockResolvedValue(0),
  };
  const identity = { inspectEmployeeAccount: jest.fn().mockResolvedValue({ usable: true, roles: ['IT_ADMIN'] }) };

  async function buildService(): Promise<DepartmentService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DepartmentService,
        DepartmentItAdminService,
        { provide: DepartmentRepo, useValue: departments },
        { provide: DepartmentItSubstituteRepo, useValue: substitutes },
        {
          provide: OrganizationContextService,
          useValue: {
            businessToday: jest.fn().mockResolvedValue('2026-10-19'),
            findOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
          },
        },
        {
          provide: EmployeeRecordService,
          useValue: { lock: lockEmployee, find: getEmployee },
        },
        { provide: DepartmentUseService, useValue: { readDepartment: jest.fn() } },
        { provide: DepartmentServiceAccountReaderHook, useValue: { get: () => ({ ownedBy: jest.fn() }) } },
        {
          provide: EmployeeAccountsHook,
          useFactory: () => {
            const hook = new EmployeeAccountsHook();
            hook.bind(identity as unknown as EmployeeAccounts);
            return hook;
          },
        },
        { provide: DepartmentCreationWindowHook, useValue: { get: () => ({ windowOn: jest.fn() }) } },
        { provide: AuditApi, useValue: { record: jest.fn() } },
        { provide: NotificationsApi, useValue: { notifyInApp: jest.fn() } },
        { provide: TransactionRunner, useValue: { run: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)) } },
      ],
    }).compile();

    return moduleRef.get(DepartmentService);
  }

  beforeEach(() => {
    lockCalls.length = 0;
    nextLockedDept = {
      id: 'dep-1',
      name: 'Design',
      functionDescription: null,
      status: 'ACTIVE',
      itAdmin: null,
    };
    jest.clearAllMocks();
  });

  it('locks employee FOR UPDATE (tier 1) before department FOR UPDATE (tier 2) when naming a new IT Admin', async () => {
    const svc = await buildService();

    await svc.update(superAdmin, 'dep-1', { itAdminEmployeeId: 'emp-it' });

    expect(lockCalls).toEqual(['tier1:employee', 'tier2:department']);
    expect(lockEmployee).toHaveBeenCalledWith(tx, 'emp-it', 'UPDATE');
    expect(departments.lock).toHaveBeenCalledWith(tx, 'dep-1', 'UPDATE');
  });

  it('skips employee lock when clearing itAdminEmployeeId to null or updating name only', async () => {
    const svc = await buildService();
    nextLockedDept = {
      id: 'dep-1',
      name: 'Design',
      functionDescription: null,
      status: 'ACTIVE',
      itAdmin: { employeeId: 'emp-it' },
    };

    await svc.update(superAdmin, 'dep-1', { itAdminEmployeeId: null });
    await svc.update(superAdmin, 'dep-1', { name: 'Brand' });

    expect(lockCalls).toEqual(['tier2:department', 'tier2:department']);
    expect(lockEmployee).not.toHaveBeenCalled();
  });

  it('preserves all guards, error codes, and precedence on departmentUpdate', async () => {
    const svc = await buildService();
    const expectCode = async (work: Promise<unknown>, errorClass: new (...args: never[]) => Error, code: string) => {
      const err = await work.catch((e: unknown) => e);
      expect(err).toBeInstanceOf(errorClass);
      const apiErr = toDepartmentApiException(err) as ApiException;
      expect((apiErr.getResponse() as { code: string }).code).toBe(code);
    };

    await expectCode(
      svc.update(actor('IT_ADMIN'), 'dep-1', { name: 'X' }),
      DepartmentForbiddenError,
      'AUTHORIZATION.FORBIDDEN',
    );
    await expectCode(svc.update(superAdmin, 'dep-1', {}), DepartmentUpdateEmptyError, 'DEPARTMENT.UPDATE_EMPTY');
    await expectCode(
      svc.update(superAdmin, 'dep-1', { name: '  ' }),
      DepartmentNameInvalidError,
      'DEPARTMENT.NAME_INVALID',
    );

    nextLockedDept = null;
    lockEmployee.mockRejectedValueOnce(new EmployeeNotFoundError('emp-missing'));
    await expectCode(
      svc.update(superAdmin, 'dep-missing', { itAdminEmployeeId: 'emp-missing' }),
      DepartmentNotFoundError,
      'DEPARTMENT.NOT_FOUND',
    );

    nextLockedDept = { id: 'dep-1', name: 'Old', functionDescription: null, status: 'INACTIVE', itAdmin: null };
    lockEmployee.mockRejectedValueOnce(new EmployeeNotFoundError('emp-missing'));
    await expectCode(
      svc.update(superAdmin, 'dep-1', { itAdminEmployeeId: 'emp-missing' }),
      DepartmentInactiveError,
      'DEPARTMENT.INACTIVE',
    );

    nextLockedDept = { id: 'dep-1', name: 'Design', functionDescription: null, status: 'ACTIVE', itAdmin: null };
    identity.inspectEmployeeAccount.mockResolvedValueOnce({ usable: false, roles: ['IT_ADMIN'] });
    await expectCode(
      svc.update(superAdmin, 'dep-1', { itAdminEmployeeId: 'emp-it' }),
      DepartmentItAdminInvalidError,
      'DEPARTMENT.IT_ADMIN_INVALID',
    );

    departments.countActiveInChargeOf.mockResolvedValueOnce(4);
    await expectCode(
      svc.update(superAdmin, 'dep-1', { itAdminEmployeeId: 'emp-it' }),
      DepartmentItAdminLimitReachedError,
      'DEPARTMENT.IT_ADMIN_LIMIT_REACHED',
    );
  });
});
