import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { EmployeeRepo } from './employee.repo';

/**
 * The private reads behind the onboarding facts run on the client they are given. With a transaction, the
 * service's own Prisma client is never touched.
 */
describe('employee reads of the onboarding facts on the caller transaction', () => {
  const untouched = new Proxy(
    {},
    {
      get: (_target, property) => {
        throw new Error(`the service client was used (${String(property)}) instead of the transaction`);
      },
    },
  ) as PrismaService;

  it('counts the active employees through the transaction', async () => {
    const used: string[] = [];
    const tx = {
      employee: { count: jest.fn(() => (used.push('employee.count'), Promise.resolve(2))) },
    } as unknown as DbTx;

    await expect(new EmployeeRepo(untouched).countActive(tx)).resolves.toBe(2);

    expect(used).toEqual(['employee.count']);
  });
});
