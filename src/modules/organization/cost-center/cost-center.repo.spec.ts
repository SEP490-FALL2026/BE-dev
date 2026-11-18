import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CostCenterRepo } from './cost-center.repo';

/**
 * The private reads behind the onboarding facts run on the client they are given. With a transaction, the
 * service's own Prisma client is never touched.
 */
describe('Cost Center reads of the onboarding facts on the caller transaction', () => {
  const untouched = new Proxy(
    {},
    {
      get: (_target, property) => {
        throw new Error(`the service client was used (${String(property)}) instead of the transaction`);
      },
    },
  ) as PrismaService;

  it('reads the departments without a Cost Center and whether the direction is activated through the transaction', async () => {
    const used: string[] = [];
    const tx = {
      $queryRaw: jest.fn(() => (used.push('$queryRaw'), Promise.resolve([{ total: 0 }]))),
      costCenterDirectionActivation: {
        count: jest.fn(() => (used.push('costCenterDirectionActivation.count'), Promise.resolve(0))),
      },
    } as unknown as DbTx;
    const costCenters = new CostCenterRepo(untouched);

    await costCenters.departmentsWithoutCostCenter(tx);
    await expect(costCenters.isDirectionActivated(tx)).resolves.toBe(false);

    expect(used).toEqual(['$queryRaw', 'costCenterDirectionActivation.count']);
  });
});
