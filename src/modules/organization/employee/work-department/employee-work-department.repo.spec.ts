import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { EmployeeWorkDepartmentRepo } from './employee-work-department.repo';

describe('EmployeeWorkDepartmentRepo', () => {
  const untouched = new Proxy(
    {},
    {
      get: (_target, property) => {
        throw new Error(`the service client was used (${String(property)}) instead of the transaction`);
      },
    },
  ) as PrismaService;

  it('reads workDepartmentsOf and employeeIdsOfWorkDepartments through the caller transaction and short-circuits empty lists', async () => {
    const used: string[] = [];
    const tx = {
      $queryRaw: jest.fn(() => {
        used.push('$queryRaw');
        return Promise.resolve([{ employee_id: 'emp-1', department_id: 'dep-1' }]);
      }),
    } as unknown as DbTx;
    const repo = new EmployeeWorkDepartmentRepo(untouched);

    expect(await repo.workDepartmentsOf([], '2026-11-23', tx)).toEqual(new Map());
    expect(await repo.employeeIdsOfWorkDepartments([], '2026-11-23', tx)).toEqual([]);
    expect(used).toEqual([]);

    const map = await repo.workDepartmentsOf(['emp-1'], '2026-11-23', tx);
    const ids = await repo.employeeIdsOfWorkDepartments(['dep-1'], '2026-11-23', tx);

    expect(map).toEqual(new Map([['emp-1', 'dep-1']]));
    expect(ids).toEqual(['emp-1']);
    expect(used).toEqual(['$queryRaw', '$queryRaw']);
  });
});
