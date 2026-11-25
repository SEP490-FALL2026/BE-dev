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
    const txFindMany = jest.fn().mockResolvedValue([{ id: 'key-1', subscriptionId: 'sub-2', licenseLotId: null }]);
    const prismaFindMany = jest.fn().mockResolvedValue([{ id: 'key-2', subscriptionId: 'sub-1', licenseLotId: null }]);
    const tx = { licenseKey: { findMany: txFindMany } } as unknown as DbTx;
    const prisma = { licenseKey: { findMany: prismaFindMany } } as unknown as PrismaService;
    const repo = new DeviceActivationRepo(prisma);

    const fromTx = await repo.keySubscriptionIds(['key-1', 'key-missing'], tx);
    const fromPrisma = await repo.keySubscriptionIds(['key-2']);

    expect(txFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['key-1', 'key-missing'] } },
      select: { id: true, subscriptionId: true, licenseLotId: true },
    });
    expect(fromTx).toEqual(new Map([['key-1', 'sub-2']]));
    expect(prismaFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['key-2'] } },
      select: { id: true, subscriptionId: true, licenseLotId: true },
    });
    expect(fromPrisma).toEqual(new Map([['key-2', 'sub-1']]));
  });

  it('names the lot of a key as its purchase, and the subscription only for a key with no lot', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'key-1', subscriptionId: 'sub-1', licenseLotId: 'lot-1' },
      { id: 'key-2', subscriptionId: null, licenseLotId: 'lot-2' },
      { id: 'key-3', subscriptionId: 'sub-3', licenseLotId: null },
    ]);
    const repo = new DeviceActivationRepo({ licenseKey: { findMany } } as unknown as PrismaService);

    const result = await repo.keySubscriptionIds(['key-1', 'key-2', 'key-3']);

    expect(result).toEqual(
      new Map([
        ['key-1', 'lot-1'],
        ['key-2', 'lot-2'],
        ['key-3', 'sub-3'],
      ]),
    );
  });
});
