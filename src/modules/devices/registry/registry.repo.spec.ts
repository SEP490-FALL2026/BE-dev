import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { RegistryRepo } from './registry.repo';

describe('RegistryRepo', () => {
  it('writes retirementKind DISPOSED when retiring a device so the table CHECK holds', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const tx = { managedDevice: { update } } as unknown as DbTx;
    const repo = new RegistryRepo({} as PrismaService);
    const at = new Date('2026-11-23T12:00:00.000Z');

    await repo.retireDevice(tx, 'dev-1', at, 'End of life');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'dev-1' },
      data: { retiredAt: at, retirementReason: 'End of life', retirementKind: 'DISPOSED' },
    });
  });
});
