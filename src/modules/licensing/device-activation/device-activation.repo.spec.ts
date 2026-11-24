import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { DeviceActivationRepo } from './device-activation.repo';

describe('DeviceActivationRepo', () => {
  it('returns an empty map for empty licenseKeyIds without querying the database', async () => {
    const txFindMany = jest.fn();
    const prismaFindMany = jest.fn();
    const tx = { licenseKey: { findMany: txFindMany } } as unknown as DbTx;
    const prisma = { licenseKey: { findMany: prismaFindMany } } as unknown as PrismaService;
    const repo = new DeviceActivationRepo(prisma);

    const result = await repo.keySubscriptionIds([], tx);

    expect(result.size).toBe(0);
    expect(txFindMany).not.toHaveBeenCalled();
    expect(prismaFindMany).not.toHaveBeenCalled();
  });

  it('reads subscriptionId keyed by licenseKeyId using tx when provided and prisma otherwise', async () => {
    const txFindMany = jest.fn().mockResolvedValue([{ id: 'key-1', subscriptionId: 'sub-2' }]);
    const prismaFindMany = jest.fn().mockResolvedValue([{ id: 'key-2', subscriptionId: 'sub-1' }]);
    const tx = { licenseKey: { findMany: txFindMany } } as unknown as DbTx;
    const prisma = { licenseKey: { findMany: prismaFindMany } } as unknown as PrismaService;
    const repo = new DeviceActivationRepo(prisma);

    const fromTx = await repo.keySubscriptionIds(['key-1', 'key-missing'], tx);
    const fromPrisma = await repo.keySubscriptionIds(['key-2']);

    expect(txFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['key-1', 'key-missing'] } },
      select: { id: true, subscriptionId: true },
    });
    expect(fromTx).toEqual(new Map([['key-1', 'sub-2']]));
    expect(prismaFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['key-2'] } },
      select: { id: true, subscriptionId: true },
    });
    expect(fromPrisma).toEqual(new Map([['key-2', 'sub-1']]));
  });
});
