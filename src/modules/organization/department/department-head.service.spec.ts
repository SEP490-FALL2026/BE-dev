import { Test } from '@nestjs/testing';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { IdentityAccessService } from '../../identity-access/identity-access.service';
import { EmployeeNotFoundError } from '../organization.errors';
import { OrganizationService } from '../organization.service';
import { HeadAssignmentError } from './department.errors';
import { DepartmentHeadService } from './department-head.service';
import { DepartmentRepo } from './department.repo';

/**
 * The employee look-up behind the head check (H4.1, F-12): a person who is not an employee is refused as
 * EMPLOYEE_NOT_FOUND, after the department is locked. Driven through the public service method.
 */
describe('DepartmentHeadService employee look-up', () => {
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

  const organization = {
    getOrganization: jest.fn(),
    businessToday: jest.fn(),
    lockEmployeeForShare: jest.fn(),
    getEmployee: jest.fn(),
  };
  const departments = { lock: jest.fn() };
  const runner = { run: jest.fn((work: (transaction: unknown) => Promise<unknown>) => work(tx)) };

  async function service(): Promise<DepartmentHeadService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DepartmentHeadService,
        { provide: DepartmentRepo, useValue: departments },
        { provide: OrganizationService, useValue: organization },
        { provide: IdentityAccessService, useValue: { inspectEmployeeAccount: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: TransactionRunner, useValue: runner },
      ],
    }).compile();

    return moduleRef.get(DepartmentHeadService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    organization.getOrganization.mockResolvedValue({ id: 'org-1' });
    organization.businessToday.mockResolvedValue('2026-10-19');
    departments.lock.mockResolvedValue({ id: 'dep-1', status: 'ACTIVE' });
  });

  it('answers EMPLOYEE_NOT_FOUND when the person named head is not an employee', async () => {
    organization.lockEmployeeForShare.mockRejectedValue(new EmployeeNotFoundError('emp-missing'));
    const headService = await service();

    const refusal: unknown = await headService
      .assign(actor, 'dep-1', { employeeId: 'emp-missing', effectiveFrom: '2026-10-19' })
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(HeadAssignmentError);
    expect((refusal as HeadAssignmentError).problem).toBe('EMPLOYEE_NOT_FOUND');
    expect(departments.lock).toHaveBeenCalledWith(tx, 'dep-1', 'UPDATE');
    expect(organization.getEmployee).not.toHaveBeenCalled();
  });
});
