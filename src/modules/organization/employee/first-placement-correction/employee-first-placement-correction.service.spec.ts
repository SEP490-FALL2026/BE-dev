import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { DepartmentInactiveError, DepartmentNotYetEffectiveError } from '../../department/department.errors';
import { EmployeeNotFoundError } from '../../public/organization.errors';
import { EmployeeFirstPlacementCorrectionService } from './employee-first-placement-correction.service';
import {
  EmployeeForbiddenError,
  EmployeeSelfChangeForbiddenError,
  EmployeeUpdateEmptyError,
  FirstPlacementCorrectionError,
  FirstPlacementError,
} from '../employee.errors';

const principal = (role: string): AuthenticatedPrincipal => ({
  subject: 'app-user-1',
  appUserId: 'app-user-1',
  sessionId: 'session-1',
  employeeId: 'emp-actor',
  directRoles: [role],
  roles: [role],
});

/** The correction of the first placement (`QĐ-113e`) through its public method with in-memory collaborators. */
describe('EmployeeFirstPlacementCorrectionService', () => {
  const tx = { name: 'tx' };
  const superAdmin = principal('SUPER_ADMIN');
  const employee = {
    id: 'emp-1',
    organizationId: 'org-1',
    employeeCode: 'NV-1',
    fullName: 'Person',
    workEmail: null,
    employmentType: 'STAFF',
    hireDate: '2026-01-01',
    contractEndDate: null,
    status: 'ACTIVE',
    workState: 'WORKING',
  };
  const placement = { id: 'pl-1', departmentId: 'dep-old', validFrom: '2026-12-01' };
  const departments = { lock: jest.fn() };
  const employees = {
    lock: jest.fn(),
    find: jest.fn(),
    placementsOf: jest.fn(),
    correctFirstPlacement: jest.fn(),
    profileNotices: jest.fn(),
  };
  const use = { read: jest.fn() };
  const context = { businessToday: jest.fn() };
  const audit = { record: jest.fn() };
  const notifications = { notifyInApp: jest.fn() };
  const runner = { run: jest.fn((work: (transaction: unknown) => Promise<unknown>) => work(tx)) };

  const service = () =>
    new EmployeeFirstPlacementCorrectionService(
      runner as never,
      departments as never,
      employees as never,
      use as never,
      context as never,
      audit as never,
      notifications as never,
    );
  const newDepartment = { id: 'dep-new', code: 'P-NEW', name: 'New', status: 'ACTIVE', effectiveFrom: '2026-01-01' };
  const oldDepartment = { id: 'dep-old', code: 'P-OLD', name: 'Old', status: 'ACTIVE', effectiveFrom: '2026-01-01' };

  beforeEach(() => {
    jest.clearAllMocks();
    context.businessToday.mockResolvedValue('2026-11-18');
    employees.find.mockResolvedValue(employee);
    employees.placementsOf.mockResolvedValue([placement]);
    employees.profileNotices.mockResolvedValue([{ id: 'notice-1' }]);
    use.read.mockResolvedValue(null);
    departments.lock.mockImplementation((_tx: unknown, id: string) =>
      Promise.resolve(id === 'dep-new' ? newDepartment : oldDepartment),
    );
  });

  it('refuses everyone but the Super Admin, and the Super Admin for their own record, before reading anything', async () => {
    await expect(
      service().correct(principal('IT_ADMIN'), 'emp-1', { departmentId: 'dep-new', reason: 'x' }),
    ).rejects.toBeInstanceOf(EmployeeForbiddenError);
    await expect(
      service().correct(superAdmin, 'emp-actor', { departmentId: 'dep-new', reason: 'x' }),
    ).rejects.toBeInstanceOf(EmployeeSelfChangeForbiddenError);
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('needs at least one of the two fields', async () => {
    await expect(service().correct(superAdmin, 'emp-1', { reason: 'x' })).rejects.toBeInstanceOf(
      EmployeeUpdateEmptyError,
    );
  });

  it('answers not found for an unknown employee', async () => {
    employees.find.mockResolvedValue(null);
    await expect(
      service().correct(superAdmin, 'emp-1', { departmentId: 'dep-new', reason: 'x' }),
    ).rejects.toBeInstanceOf(EmployeeNotFoundError);
  });

  it.each([
    ['EMPLOYEE_INACTIVE', { employee: { ...employee, status: 'TERMINATED' } }],
    ['EMPLOYEE_LEAVING', { employee: { ...employee, workState: 'HANDING_OVER' } }],
    ['NOT_PLACED', { placements: [] }],
    ['ALREADY_EFFECTIVE', { placements: [{ ...placement, validFrom: '2026-11-18' }] }],
    ['IN_USE', { use: 'REQUEST' }],
  ])('refuses with %s', async (problem, change: { employee?: object; placements?: object[]; use?: string }) => {
    if (change.employee) employees.find.mockResolvedValue(change.employee);
    if (change.placements) employees.placementsOf.mockResolvedValue(change.placements);
    if (change.use) use.read.mockResolvedValue(change.use);

    const failure: unknown = await service()
      .correct(superAdmin, 'emp-1', { departmentId: 'dep-new', reason: 'x' })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(FirstPlacementCorrectionError);
    expect((failure as FirstPlacementCorrectionError).problem).toBe(problem);
    expect(employees.correctFirstPlacement).not.toHaveBeenCalled();
  });

  it('checks the new values like a first placement: a retired department, one not yet in effect, a day before today', async () => {
    departments.lock.mockResolvedValueOnce({ ...newDepartment, status: 'INACTIVE' });
    await expect(
      service().correct(superAdmin, 'emp-1', { departmentId: 'dep-new', reason: 'x' }),
    ).rejects.toBeInstanceOf(DepartmentInactiveError);
    departments.lock.mockResolvedValueOnce({ ...newDepartment, effectiveFrom: '2027-01-01' });
    await expect(
      service().correct(superAdmin, 'emp-1', { departmentId: 'dep-new', reason: 'x' }),
    ).rejects.toBeInstanceOf(DepartmentNotYetEffectiveError);
    const failure: unknown = await service()
      .correct(superAdmin, 'emp-1', { effectiveFrom: '2026-11-17', reason: 'x' })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(FirstPlacementError);
    expect((failure as FirstPlacementError).problem).toBe('DATE_INVALID');
    expect(employees.correctFirstPlacement).not.toHaveBeenCalled();
  });

  it('changes the department in place, audits before and after with the reason, and tells the new department like a first placement', async () => {
    const view = await service().correct(superAdmin, 'emp-1', { departmentId: 'dep-new', reason: 'Wrong team' });

    expect(employees.correctFirstPlacement).toHaveBeenCalledWith(tx, 'pl-1', {
      departmentId: 'dep-new',
      effectiveFrom: undefined,
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'EMPLOYEE.FIRST_PLACEMENT_CORRECTED',
        resourceType: 'Employee',
        resourceId: 'emp-1',
        before: { departmentId: 'dep-old', effectiveFrom: '2026-12-01' },
        after: { departmentId: 'dep-new', effectiveFrom: '2026-12-01', reason: 'Wrong team' },
      }),
    );
    expect(employees.profileNotices).toHaveBeenCalledWith(tx, {
      kind: 'CREATED',
      organizationId: 'org-1',
      employeeId: 'emp-1',
      onDate: '2026-12-01',
    });
    expect(notifications.notifyInApp).toHaveBeenCalledTimes(1);
    expect(view).toMatchObject({ memberSince: '2026-12-01', department: { id: 'dep-new' }, unplaced: false });
  });

  it('changes only the day without telling anybody', async () => {
    const view = await service().correct(superAdmin, 'emp-1', { effectiveFrom: '2026-12-15', reason: 'Later start' });

    expect(employees.correctFirstPlacement).toHaveBeenCalledWith(tx, 'pl-1', {
      departmentId: undefined,
      effectiveFrom: '2026-12-15',
    });
    expect(employees.profileNotices).not.toHaveBeenCalled();
    expect(notifications.notifyInApp).not.toHaveBeenCalled();
    expect(view).toMatchObject({ memberSince: '2026-12-15', department: { id: 'dep-old' } });
  });

  it('changes only the day although the current department has been retired, and still refuses a retired new department', async () => {
    departments.lock.mockImplementation((_tx: unknown, id: string) =>
      Promise.resolve(id === 'dep-new' ? newDepartment : { ...oldDepartment, status: 'INACTIVE' }),
    );
    await service().correct(superAdmin, 'emp-1', { effectiveFrom: '2026-12-15', reason: 'Later start' });
    expect(employees.correctFirstPlacement).toHaveBeenCalledWith(tx, 'pl-1', {
      departmentId: undefined,
      effectiveFrom: '2026-12-15',
    });
    // Naming the current department again changes nothing about it: still a day-only change.
    await service().correct(superAdmin, 'emp-1', { departmentId: 'dep-old', effectiveFrom: '2026-12-16', reason: 'x' });
    expect(employees.correctFirstPlacement).toHaveBeenCalledTimes(2);

    departments.lock.mockResolvedValue({ ...newDepartment, status: 'INACTIVE' });
    await expect(
      service().correct(superAdmin, 'emp-1', { departmentId: 'dep-new', reason: 'x' }),
    ).rejects.toBeInstanceOf(DepartmentInactiveError);
  });

  it('records nothing for values that are the ones it has', async () => {
    await service().correct(superAdmin, 'emp-1', {
      departmentId: 'dep-old',
      effectiveFrom: '2026-12-01',
      reason: 'x',
    });

    expect(employees.correctFirstPlacement).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
