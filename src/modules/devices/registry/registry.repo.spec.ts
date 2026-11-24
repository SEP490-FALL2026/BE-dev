import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { RegistryRepo } from './registry.repo';

describe('RegistryRepo', () => {
  it('writes retirementKind DISPOSED by default or LOST when specified when retiring a device', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const tx = { managedDevice: { update } } as unknown as DbTx;
    const repo = new RegistryRepo({} as PrismaService);
    const at = new Date('2026-11-23T12:00:00.000Z');

    await repo.retireDevice(tx, 'dev-1', at, 'End of life');
    await repo.retireDevice(tx, 'dev-2', at, 'Lost on transit', 'LOST');

    expect(update).toHaveBeenNthCalledWith(1, {
      where: { id: 'dev-1' },
      data: { retiredAt: at, retirementReason: 'End of life', retirementKind: 'DISPOSED' },
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: 'dev-2' },
      data: { retiredAt: at, retirementReason: 'Lost on transit', retirementKind: 'LOST' },
    });
  });

  it('finds an open registration without locking, voids a device, and reads void history flags', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'reg-1',
      organizationId: 'org-1',
      deviceId: 'dev-1',
      holderEmployeeId: 'emp-1',
      validFrom: new Date('2026-10-01T00:00:00.000Z'),
      validUntil: null,
      endedAt: null,
      endCause: null,
      collectorInstalled: true,
      acknowledgedFrom: null,
      collectionStoppedAt: null,
    });
    const update = jest.fn().mockResolvedValue(undefined);
    const sigCount = jest.fn().mockResolvedValue(1);
    const credCount = jest.fn().mockResolvedValue(0);
    const tx = {
      deviceRegistration: { findFirst },
      managedDevice: { update },
      deviceSignatureRecord: { count: sigCount },
      deviceCredential: { count: credCount },
    } as unknown as DbTx;
    const repo = new RegistryRepo({} as PrismaService);
    const voidedAt = new Date('2026-11-24T09:00:00.000Z');

    const open = await repo.findOpenRegistration('dev-1', tx);
    await repo.voidDevice(tx, 'dev-1', {
      voidedAt,
      voidReason: 'Duplicate entry',
      voidedByAppUserId: 'user-1',
    });
    const history = await repo.readVoidHistory(tx, 'dev-1');

    expect(findFirst).toHaveBeenCalledWith({ where: { deviceId: 'dev-1', endedAt: null } });
    expect(open?.validFrom).toBe('2026-10-01');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'dev-1' },
      data: { voidedAt, voidReason: 'Duplicate entry', voidedByAppUserId: 'user-1' },
    });
    expect(sigCount).toHaveBeenCalledWith({ where: { registration: { deviceId: 'dev-1' } }, take: 1 });
    expect(credCount).toHaveBeenCalledWith({ where: { deviceId: 'dev-1' }, take: 1 });
    expect(history).toEqual({ hasSignatureRecord: true, hasCredential: false });
  });
});
