import { Test } from '@nestjs/testing';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { EmployeeNotFoundError } from '../public/organization.errors';
import { OrganizationContextService } from '../organization-context.service';
import { EmployeeRecordService } from '../employee/employee-record.service';
import { DepartmentUseService } from '../department/department-use.service';
import {
  DepartmentCreationWindowHook,
  DepartmentServiceAccountReaderHook,
} from '../public/organization.extension-points';
import { EmployeeAccountsHook, type EmployeeAccounts } from '../public/organization.extension-points';
import {
  DepartmentForbiddenError,
  DepartmentInUseError,
  DepartmentItAdminInvalidError,
  DepartmentItAdminLimitReachedError,
  DepartmentOutsideBudgetPeriodError,
} from '../department/department.errors';
import { DepartmentRepo } from '../department/department.repo';
import { DepartmentItAdminService } from './department-it-admin.service';
import { DepartmentService } from './department.service';

const principal = (role: string): AuthenticatedPrincipal => ({
  subject: 'app-user-1',
  appUserId: 'app-user-1',
  sessionId: 'session-1',
  employeeId: 'emp-actor',
  directRoles: [role],
  roles: [role],
});

/** An asymmetric matcher typed `unknown`, so it can sit inside another matcher without an `any` leaking in. */
const containing = (fields: object): unknown => expect.objectContaining(fields);

/**
 * The department use cases through their public methods with in-memory collaborators: who may (the policy runs in the service,
 * whatever the controller let through), the employee look-up behind the IT Admin check (it goes through the
 * organization facade, locks the employee `FOR UPDATE` before reading and counting in the same transaction, turns only a missing employee
 * into "none" and lets every other error through), and what keeps a department from being retired (`QĐ-90e`).
 */
describe('DepartmentService', () => {
  const tx = { name: 'tx' };
  const superAdmin = principal('SUPER_ADMIN');
  const activeEmployee = { id: 'emp-it', employeeCode: 'E-IT', status: 'ACTIVE' };
  const noGroup = { items: [], total: 0 };

  const organization = {
    getOrganization: jest.fn(),
    businessToday: jest.fn(),
    lockEmployee: jest.fn(),
    getEmployee: jest.fn(),
    ownedBy: jest.fn(),
    getDepartmentUse: jest.fn(),
  };
  const departments = {
    lock: jest.fn(),
    update: jest.fn(),
    insert: jest.fn(),
    members: jest.fn(),
    deactivate: jest.fn(),
    countActiveInChargeOf: jest.fn(),
  };
  const identity = { inspectEmployeeAccount: jest.fn() };
  const creationWindow = { windowOn: jest.fn() };
  const audit = { record: jest.fn() };
  const runner = { run: jest.fn((work: (transaction: unknown) => Promise<unknown>) => work(tx)) };

  async function service(): Promise<DepartmentService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DepartmentService,
        DepartmentItAdminService,
        { provide: DepartmentRepo, useValue: departments },
        {
          provide: OrganizationContextService,
          useValue: { businessToday: organization.businessToday, findOrganization: organization.getOrganization },
        },
        {
          provide: EmployeeRecordService,
          useValue: {
            lock: (tx: unknown, id: string, mode: string) => organization.lockEmployee(tx, id, mode) as Promise<void>,
            find: organization.getEmployee,
          },
        },
        { provide: DepartmentUseService, useValue: { readDepartment: organization.getDepartmentUse } },
        {
          provide: DepartmentServiceAccountReaderHook,
          useValue: { get: () => ({ ownedBy: organization.ownedBy }) },
        },
        {
          provide: EmployeeAccountsHook,
          useFactory: () => {
            const hook = new EmployeeAccountsHook();
            hook.bind(identity as unknown as EmployeeAccounts);

            return hook;
          },
        },
        { provide: DepartmentCreationWindowHook, useValue: { get: () => creationWindow } },
        { provide: AuditApi, useValue: audit },
        { provide: TransactionRunner, useValue: runner },
      ],
    }).compile();

    return moduleRef.get(DepartmentService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    organization.getOrganization.mockResolvedValue({ id: 'org-1' });
    organization.businessToday.mockResolvedValue('2026-10-19');
    organization.lockEmployee.mockResolvedValue(undefined);
    organization.getEmployee.mockResolvedValue(activeEmployee);
    organization.ownedBy.mockResolvedValue(noGroup);
    organization.getDepartmentUse.mockResolvedValue({ openWork: noGroup, subscriptions: noGroup });
    departments.lock.mockResolvedValue({
      id: 'dep-1',
      name: 'Design',
      functionDescription: null,
      status: 'ACTIVE',
      itAdmin: null,
    });
    departments.insert.mockResolvedValue('dep-new');
    departments.countActiveInChargeOf.mockResolvedValue(0);
    creationWindow.windowOn.mockResolvedValue({ kind: 'NO_CYCLE_YET' });
    departments.members.mockResolvedValue(noGroup);
    identity.inspectEmployeeAccount.mockResolvedValue({ usable: true, roles: ['IT_ADMIN'] });
  });

  describe('who may (F10, F13): the Super Admin alone, on an HR basis', () => {
    it.each([['IT_ADMIN'], ['FINANCE'], ['MANAGER'], ['EMPLOYEE']])(
      'refuses create, update and deactivate to the %s before it reads or writes anything',
      async (role) => {
        const departmentService = await service();
        const actor = principal(role);

        await expect(departmentService.create(actor, { code: 'P-NEW', name: 'New' })).rejects.toBeInstanceOf(
          DepartmentForbiddenError,
        );
        await expect(departmentService.update(actor, 'dep-1', { name: 'Other' })).rejects.toBeInstanceOf(
          DepartmentForbiddenError,
        );
        await expect(departmentService.deactivate(actor, 'dep-1')).rejects.toBeInstanceOf(DepartmentForbiddenError);

        expect(organization.getOrganization).not.toHaveBeenCalled();
        expect(runner.run).not.toHaveBeenCalled();
        expect(audit.record).not.toHaveBeenCalled();
      },
    );

    it('creates a department with no Cost Center and no activation step, and records the basis', async () => {
      const id = await (await service()).create(superAdmin, { code: ' P-NEW ', name: 'New' });

      expect(id).toBe('dep-new');
      expect(departments.insert).toHaveBeenCalledWith(tx, expect.objectContaining({ code: 'P-NEW', name: 'New' }));
      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          action: 'DEPARTMENT.CREATED',
          after: containing({ code: 'P-NEW' }),
        }),
      );
    });

    it('takes effect on 1 January of the next year when the cycle of that year is open, and today at the installation (R-I10)', async () => {
      const departmentService = await service();
      creationWindow.windowOn.mockResolvedValueOnce({ kind: 'OPEN', effectiveFrom: '2027-01-01' });

      await departmentService.create(superAdmin, { code: 'P-NEXT', name: 'Next' });
      await departmentService.create(superAdmin, { code: 'P-FIRST', name: 'First' });

      expect(departments.insert).toHaveBeenNthCalledWith(
        1,
        tx,
        expect.objectContaining({ effectiveFrom: '2027-01-01' }),
      );
      expect(departments.insert).toHaveBeenNthCalledWith(
        2,
        tx,
        expect.objectContaining({ effectiveFrom: '2026-10-19' }),
      );
      expect(creationWindow.windowOn).toHaveBeenCalledWith(tx, 'org-1', '2026-10-19');
      expect(audit.record).toHaveBeenNthCalledWith(
        1,
        tx,
        expect.objectContaining({ after: containing({ effectiveFrom: '2027-01-01' }) }),
      );
    });

    it('makes nothing outside the budgeting period, and records nothing', async () => {
      creationWindow.windowOn.mockResolvedValue({ kind: 'CLOSED' });

      await expect((await service()).create(superAdmin, { code: 'P-LATE', name: 'Late' })).rejects.toBeInstanceOf(
        DepartmentOutsideBudgetPeriodError,
      );

      expect(departments.insert).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('records the basis with a change, and nothing for a change that changes nothing', async () => {
      const departmentService = await service();

      await departmentService.update(superAdmin, 'dep-1', { name: 'Brand' });
      await departmentService.update(superAdmin, 'dep-1', { name: 'Design' });

      expect(departments.update).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          action: 'DEPARTMENT.UPDATED',
          before: { name: 'Design' },
          after: { name: 'Brand' },
        }),
      );
    });
  });

  describe('employee look-up', () => {
    it('refuses an IT Admin in charge who is not an employee, without reading or writing anything else', async () => {
      organization.lockEmployee.mockRejectedValue(new EmployeeNotFoundError('emp-missing'));
      const departmentService = await service();

      await expect(
        departmentService.update(superAdmin, 'dep-1', { itAdminEmployeeId: 'emp-missing' }),
      ).rejects.toBeInstanceOf(DepartmentItAdminInvalidError);
      expect(organization.getEmployee).not.toHaveBeenCalled();
      expect(departments.update).not.toHaveBeenCalled();
    });

    it('lets an error other than a missing employee through unchanged', async () => {
      const outage = new Error('connection reset');
      organization.lockEmployee.mockRejectedValue(outage);
      const departmentService = await service();

      await expect(departmentService.update(superAdmin, 'dep-1', { itAdminEmployeeId: 'emp-it' })).rejects.toBe(outage);
      expect(departments.update).not.toHaveBeenCalled();
    });

    it('locks a usable IT Admin for update, then reads it, in the same transaction, before saving the change', async () => {
      const departmentService = await service();

      await departmentService.update(superAdmin, 'dep-1', { itAdminEmployeeId: 'emp-it' });

      expect(organization.lockEmployee).toHaveBeenCalledWith(tx, 'emp-it', 'UPDATE');
      expect(organization.getEmployee).toHaveBeenCalledWith('emp-it', tx);
      expect(organization.lockEmployee.mock.invocationCallOrder[0]).toBeLessThan(
        organization.getEmployee.mock.invocationCallOrder[0],
      );
      expect(departments.update).toHaveBeenCalledWith(tx, 'dep-1', { itAdminEmployeeId: 'emp-it' }, expect.any(Date));
    });
  });

  describe('one IT Admin answers for at most four departments (QĐ-110l, US-01-11)', () => {
    it('refuses to name an IT Admin who already answers for four departments, on a change, and writes nothing', async () => {
      departments.countActiveInChargeOf.mockResolvedValue(4);

      await expect(
        (await service()).update(superAdmin, 'dep-1', { itAdminEmployeeId: 'emp-it' }),
      ).rejects.toBeInstanceOf(DepartmentItAdminLimitReachedError);

      expect(departments.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('refuses the same on creating a department, and creates nothing', async () => {
      departments.countActiveInChargeOf.mockResolvedValue(4);

      await expect(
        (await service()).create(superAdmin, { code: 'P-NEW', name: 'New', itAdminEmployeeId: 'emp-it' }),
      ).rejects.toBeInstanceOf(DepartmentItAdminLimitReachedError);

      expect(departments.insert).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('does not count again when the IT Admin is taken off or the department keeps the one it has', async () => {
      departments.lock.mockResolvedValue({
        id: 'dep-1',
        name: 'Design',
        functionDescription: null,
        status: 'ACTIVE',
        itAdmin: { employeeId: 'emp-it' },
      });
      const departmentService = await service();

      await departmentService.update(superAdmin, 'dep-1', { itAdminEmployeeId: 'emp-it', name: 'Brand' });
      await departmentService.update(superAdmin, 'dep-1', { itAdminEmployeeId: null });

      expect(departments.countActiveInChargeOf).not.toHaveBeenCalled();
    });
  });

  describe('retiring a department (F15, QĐ-90e): four groups, each bounded with its total', () => {
    const items = (kind: string, count: number) =>
      Array.from({ length: count }, (_unused, index) => ({ kind, id: `${kind}-${index}`, label: null }));

    it('retires one nothing keeps in use, and records the basis', async () => {
      await (await service()).deactivate(superAdmin, 'dep-1');

      expect(departments.deactivate).toHaveBeenCalledWith(tx, 'dep-1', expect.any(Date));
      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          action: 'DEPARTMENT.DEACTIVATED',
          after: { status: 'INACTIVE' },
        }),
      );
    });

    it.each<[string, () => void]>([
      [
        'a member',
        () => departments.members.mockResolvedValue({ items: [{ employeeCode: 'E1', fullName: 'A' }], total: 1 }),
      ],
      [
        'a service account it owns',
        () =>
          organization.ownedBy.mockResolvedValue({
            items: [{ assignmentId: 'a-1', accountIdentifier: 'ci-bot' }],
            total: 1,
          }),
      ],
      [
        'open work',
        () =>
          organization.getDepartmentUse.mockResolvedValue({
            openWork: { items: items('ACCESS_REQUEST', 1), total: 1 },
            subscriptions: noGroup,
          }),
      ],
      [
        'a subscription that owes a payment',
        () =>
          organization.getDepartmentUse.mockResolvedValue({
            openWork: noGroup,
            subscriptions: { items: items('SUBSCRIPTION', 1), total: 1 },
          }),
      ],
    ])('refuses while it still has %s, and retires nothing', async (_name, arrange) => {
      arrange();

      await expect((await service()).deactivate(superAdmin, 'dep-1')).rejects.toBeInstanceOf(DepartmentInUseError);
      expect(departments.deactivate).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('lists each group with its first twenty and the total, all four at once', async () => {
      departments.members.mockResolvedValue({ items: [{ employeeCode: 'E1', fullName: 'A' }], total: 41 });
      organization.ownedBy.mockResolvedValue({
        items: [{ assignmentId: 'a-1', accountIdentifier: 'ci-bot' }],
        total: 3,
      });
      organization.getDepartmentUse.mockResolvedValue({
        openWork: { items: items('ACCESS_REQUEST', 20), total: 57 },
        subscriptions: { items: items('SUBSCRIPTION', 2), total: 2 },
      });

      const refusal: unknown = await (await service()).deactivate(superAdmin, 'dep-1').catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(DepartmentInUseError);
      const { groups } = refusal as DepartmentInUseError;
      expect(groups.members).toEqual({ items: [{ employeeCode: 'E1', fullName: 'A' }], total: 41 });
      expect(groups.serviceAccounts.total).toBe(3);
      expect(groups.openWork.items).toHaveLength(20);
      expect(groups.openWork.total).toBe(57);
      expect(groups.subscriptions.total).toBe(2);
      // Every list is asked for at most twenty, inside the transaction that holds the department.
      expect(organization.getDepartmentUse).toHaveBeenCalledWith('dep-1', '2026-10-19', 20, tx);
      expect(departments.members).toHaveBeenCalledWith(tx, 'dep-1', '2026-10-19', { skip: 0, take: 20 });
    });

    it('answers the same for a department that is already retired, reading nothing of what keeps it in use', async () => {
      departments.lock.mockResolvedValue({ id: 'dep-1', status: 'INACTIVE' });

      await (await service()).deactivate(superAdmin, 'dep-1');

      expect(organization.getDepartmentUse).not.toHaveBeenCalled();
      expect(departments.deactivate).not.toHaveBeenCalled();
    });
  });
});
