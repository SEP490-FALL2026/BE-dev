import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { CostCenterRepo } from './cost-center/cost-center.repo';
import { DepartmentRepo } from './department/department.repo';
import { EmployeeRepo } from './employee/employee.repo';

/**
 * P23-RV-02: the private reads behind the onboarding facts run on the client they are given. With a transaction, the
 * service's own Prisma client is never touched.
 */
describe('onboarding fact reads on the caller transaction', () => {
  const untouched = new Proxy(
    {},
    {
      get: (_target, property) => {
        throw new Error(`the service client was used (${String(property)}) instead of the transaction`);
      },
    },
  ) as PrismaService;

  function transaction() {
    const used: string[] = [];
    const tx = {
      $queryRaw: jest.fn(() => (used.push('$queryRaw'), Promise.resolve([{ total: 0 }]))),
      department: { count: jest.fn(() => (used.push('department.count'), Promise.resolve(1))) },
      employee: { count: jest.fn(() => (used.push('employee.count'), Promise.resolve(2))) },
    };
    return { tx: tx as unknown as DbTx, used };
  }

  it('reads departments, employees and free cost centers through the transaction', async () => {
    const { tx, used } = transaction();
    const departments = new DepartmentRepo(untouched);

    await expect(departments.countActiveDepartments(tx)).resolves.toBe(1);
    await departments.activeDepartmentsWithoutHead('2026-10-20', tx);
    await departments.activeDepartmentsWithItAdmin(tx);
    await expect(new EmployeeRepo(untouched).countActive(tx)).resolves.toBe(2);
    await expect(new CostCenterRepo(untouched).countFreeUnits(tx)).resolves.toBe(0);

    expect(used).toEqual(['department.count', '$queryRaw', '$queryRaw', 'employee.count', '$queryRaw']);
  });
});
