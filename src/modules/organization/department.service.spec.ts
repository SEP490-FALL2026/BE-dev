import { Test } from '@nestjs/testing';
import { TransactionRunner } from '../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../audit/audit.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { CostCenterService } from './cost-center/cost-center.service';
import { DepartmentRepo } from './department.repo';
import { DepartmentService } from './department.service';
import { DepartmentItAdminInvalidError, HeadAssignmentError } from './errors/department.errors';
import { EmployeeNotFoundError } from './organization.errors';
import { OrganizationService } from './organization.service';
import { ProjectService } from './project/project.service';

/**
 * The employee look-up behind the IT Admin and head checks (H4.1, F-12): it goes through the organization facade,
 * locks the employee `FOR SHARE` before reading it in the same transaction, turns only a missing employee into "none",
 * and lets every other error through. Driven through the public service methods with in-memory collaborators.
 */
describe('DepartmentService employee look-up', () => {
  const tx = { name: 'tx' };
  const actor: AuthenticatedPrincipal = {
    subject: 'app-user-1',
    appUserId: 'app-user-1',
    sessionId: 'session-1',
    employeeId: 'emp-actor',
    directRoles: ['IT_ADMIN'],
    derivedRoles: [],
    roles: ['IT_ADMIN'],
  };
  const activeEmployee = { id: 'emp-it', employeeCode: 'E-IT', status: 'ACTIVE' };

  const organization = {
    getOrganization: jest.fn(),
    businessToday: jest.fn(),
    lockEmployeeForShare: jest.fn(),
    getEmployee: jest.fn(),
  };
  const departments = { lock: jest.fn(), update: jest.fn() };
  const identity = { inspectEmployeeAccount: jest.fn() };
  const audit = { record: jest.fn() };
  const runner = { run: jest.fn((work: (transaction: unknown) => Promise<unknown>) => work(tx)) };

  async function service(): Promise<DepartmentService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DepartmentService,
        { provide: DepartmentRepo, useValue: departments },
        { provide: CostCenterService, useValue: {} },
        { provide: OrganizationService, useValue: organization },
        { provide: ProjectService, useValue: {} },
        { provide: IdentityAccessService, useValue: identity },
        { provide: AuditService, useValue: audit },
        { provide: TransactionRunner, useValue: runner },
      ],
    }).compile();

    return moduleRef.get(DepartmentService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    organization.getOrganization.mockResolvedValue({ id: 'org-1' });
    organization.businessToday.mockResolvedValue('2026-10-19');
    organization.lockEmployeeForShare.mockResolvedValue(undefined);
    organization.getEmployee.mockResolvedValue(activeEmployee);
    departments.lock.mockResolvedValue({
      id: 'dep-1',
      name: 'Design',
      functionDescription: null,
      status: 'ACTIVE',
      itAdmin: null,
    });
    identity.inspectEmployeeAccount.mockResolvedValue({ usable: true, roles: ['IT_ADMIN'] });
  });

  it('refuses an IT Admin in charge who is not an employee, without reading or writing anything else', async () => {
    organization.lockEmployeeForShare.mockRejectedValue(new EmployeeNotFoundError('emp-missing'));
    const departmentService = await service();

    await expect(departmentService.update(actor, 'dep-1', { itAdminEmployeeId: 'emp-missing' })).rejects.toBeInstanceOf(
      DepartmentItAdminInvalidError,
    );
    expect(organization.getEmployee).not.toHaveBeenCalled();
    expect(departments.update).not.toHaveBeenCalled();
  });

  it('lets an error other than a missing employee through unchanged', async () => {
    const outage = new Error('connection reset');
    organization.lockEmployeeForShare.mockRejectedValue(outage);
    const departmentService = await service();

    await expect(departmentService.update(actor, 'dep-1', { itAdminEmployeeId: 'emp-it' })).rejects.toBe(outage);
    expect(departments.update).not.toHaveBeenCalled();
  });

  it('locks a usable IT Admin for share, then reads it, in the same transaction, before saving the change', async () => {
    const departmentService = await service();
    jest.spyOn(departmentService, 'profile').mockResolvedValue({} as Awaited<ReturnType<DepartmentService['profile']>>);

    await departmentService.update(actor, 'dep-1', { itAdminEmployeeId: 'emp-it' });

    expect(organization.lockEmployeeForShare).toHaveBeenCalledWith(tx, 'emp-it');
    expect(organization.getEmployee).toHaveBeenCalledWith('emp-it', tx);
    expect(organization.lockEmployeeForShare.mock.invocationCallOrder[0]).toBeLessThan(
      organization.getEmployee.mock.invocationCallOrder[0],
    );
    expect(departments.update).toHaveBeenCalledWith(tx, 'dep-1', { itAdminEmployeeId: 'emp-it' }, expect.any(Date));
  });

  it('answers EMPLOYEE_NOT_FOUND when the person named head is not an employee', async () => {
    organization.lockEmployeeForShare.mockRejectedValue(new EmployeeNotFoundError('emp-missing'));
    const departmentService = await service();

    const refusal: unknown = await departmentService
      .assignHead(actor, 'dep-1', { employeeId: 'emp-missing', effectiveFrom: '2026-10-19' })
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(HeadAssignmentError);
    expect((refusal as HeadAssignmentError).problem).toBe('EMPLOYEE_NOT_FOUND');
  });
});
