import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { BudgetPair } from './threshold-alert.service';
import { ThresholdAlertService } from './threshold-alert.service';

const M = 1_000_000n;

describe('ThresholdAlertService.watchBase and settleBase', () => {
  const tx = {} as DbTx;

  it('reads baseBefore without locking, detects 80% and 100% crossings on lowered base, and emits alerts', async () => {
    const totals = jest.fn().mockResolvedValue(new Map([['cc-1:2026', { held: 75n * M, spent: 0n }]]));
    const approvedOfCostCenters = jest
      .fn()
      .mockResolvedValueOnce(new Map([['cc-1', { baseMinor: 100n * M }]]))
      .mockResolvedValueOnce(new Map([['cc-1', { baseMinor: 75n * M }]]));
    const lock = jest.fn();
    const numbered = jest.fn((_tx: unknown, crossings: readonly Record<string, unknown>[]) =>
      Promise.resolve(crossings.map((crossing) => ({ ...crossing, episode: 1 }))),
    );
    const insertNew = jest.fn((_tx: unknown, alerts: readonly unknown[]) => Promise.resolve(alerts));
    const told = jest.fn().mockResolvedValue(undefined);

    const service = new ThresholdAlertService(
      { totals } as never,
      { approvedOfCostCenters } as never,
      { lock },
      { numbered, insertNew } as never,
      { told } as never,
    );

    const pairs: BudgetPair[] = [{ costCenterId: 'cc-1', year: 2026 }];
    const watch = await service.watchBase(tx, pairs);
    expect(lock).not.toHaveBeenCalled();

    const emitted = await service.settleBase(tx, watch, new Date('2026-11-10T00:00:00Z'));
    expect(emitted).toBe(2);
    expect(insertNew).toHaveBeenCalledWith(
      tx,
      [
        { costCenterId: 'cc-1', year: 2026, threshold: 80, episode: 1, baseMinor: 75n * M },
        { costCenterId: 'cc-1', year: 2026, threshold: 100, episode: 1, baseMinor: 75n * M },
      ],
      new Date('2026-11-10T00:00:00Z'),
    );
    expect(told).toHaveBeenCalledTimes(1);
  });
});
