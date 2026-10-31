import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { DepartmentRepo } from './department.repo';

/**
 * The private reads behind the onboarding facts run on the client they are given. With a transaction, the
 * service's own Prisma client is never touched.
 */
describe('department reads of the onboarding facts on the caller transaction', () => {
  const untouched = new Proxy(
    {},
    {
      get: (_target, property) => {
        throw new Error(`the service client was used (${String(property)}) instead of the transaction`);
      },
    },
  ) as PrismaService;

  it('counts active departments and reads those without a head or with an IT Admin through the transaction', async () => {
    const used: string[] = [];
    const tx = {
      $queryRaw: jest.fn(() => (used.push('$queryRaw'), Promise.resolve([{ total: 0 }]))),
      department: { count: jest.fn(() => (used.push('department.count'), Promise.resolve(1))) },
    } as unknown as DbTx;
    const departments = new DepartmentRepo(untouched);

    await expect(departments.countActiveDepartments(tx)).resolves.toBe(1);
    await departments.activeDepartmentsWithoutHead('2026-10-20', tx);
    await departments.activeDepartmentsWithItAdmin(tx);

    expect(used).toEqual(['department.count', '$queryRaw', '$queryRaw']);
  });
});
