import { DepartmentItAdminInvalidError, DepartmentItAdminLimitReachedError } from '../department/department.errors';
import type { DepartmentRepo } from '../department/department.repo';
import type { EmployeeRecordService } from '../employee/employee-record.service';
import { EmployeeAccountsHook, type EmployeeAccounts } from '../public/organization.extension-points';
import { DepartmentItAdminService } from './department-it-admin.service';

/**
 * Who may be named the IT Admin in charge of one more department (`US-01-11`, `QĐ-110l`): the person is judged first (a missing, left or
 * locked employee, or an account without the role, is 422), the departments they already answer for are counted after, under the lock of
 * the employee row taken `FOR UPDATE`, so two namings of the same person queue up.
 */
describe('DepartmentItAdminService', () => {
  const tx = { name: 'tx' } as never;
  const calls: string[] = [];
  const employees = {
    lock: jest.fn((_tx: unknown, _id: string, mode: string) => {
      calls.push(`lock:${mode}`);

      return Promise.resolve();
    }),
    find: jest.fn(() => Promise.resolve({ id: 'emp-it', status: 'ACTIVE' })),
  };
  const accounts = {
    inspectEmployeeAccount: jest.fn(() => {
      calls.push('account');

      return Promise.resolve({ usable: true, roles: ['IT_ADMIN'] });
    }),
  };
  const departments = {
    countActiveInChargeOf: jest.fn<(tx: unknown, id: string) => Promise<number>>().mockImplementation(() => {
      calls.push('count');

      return Promise.resolve(3);
    }),
  };

  const service = (): DepartmentItAdminService => {
    const hook = new EmployeeAccountsHook();
    hook.bind(accounts as unknown as EmployeeAccounts);

    return new DepartmentItAdminService(
      employees as unknown as EmployeeRecordService,
      hook,
      departments as unknown as DepartmentRepo,
    );
  };

  beforeEach(() => {
    calls.length = 0;
    jest.clearAllMocks();
  });

  it('locks the employee for update, reads the account, and only then counts the departments, in the same transaction', async () => {
    await service().assertUsable(tx, 'emp-it');

    expect(calls).toEqual(['lock:UPDATE', 'account', 'count']);
    expect(departments.countActiveInChargeOf).toHaveBeenCalledWith(tx, 'emp-it');
  });

  it('judges the person before the count: an unusable account is invalid and the departments are not even counted', async () => {
    accounts.inspectEmployeeAccount.mockResolvedValueOnce({ usable: false, roles: ['IT_ADMIN'] });

    await expect(service().assertUsable(tx, 'emp-it')).rejects.toBeInstanceOf(DepartmentItAdminInvalidError);
    expect(departments.countActiveInChargeOf).not.toHaveBeenCalled();
  });

  it('refuses a person who already answers for four departments and takes one who answers for three', async () => {
    await expect(service().assertUsable(tx, 'emp-it')).resolves.toBeUndefined();

    departments.countActiveInChargeOf.mockResolvedValueOnce(4);
    await expect(service().assertUsable(tx, 'emp-it')).rejects.toBeInstanceOf(DepartmentItAdminLimitReachedError);
  });
});
