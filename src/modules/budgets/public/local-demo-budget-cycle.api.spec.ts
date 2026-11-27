import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CycleRepo } from '../cycle/cycle.repo';
import { LocalDemoBudgetCycleApi } from './local-demo-budget-cycle.api';

describe('LocalDemoBudgetCycleApi', () => {
  const tx = {} as DbTx;
  const orgId = 'org-1';

  it('locks the cycle row, updates submissionDeadline, and returns the cycle id with the previous deadline', async () => {
    const lockByYear = jest.fn().mockResolvedValue({
      id: 'cycle-2026',
      organizationId: orgId,
      year: 2026,
      submissionDeadline: '2026-12-01',
    });
    const update = jest.fn().mockResolvedValue(undefined);
    const api = new LocalDemoBudgetCycleApi({ lockByYear, update } as unknown as CycleRepo);

    const moved = await api.setSubmissionDeadline(tx, orgId, 2026, '2026-11-30');

    expect(moved).toEqual({ id: 'cycle-2026', previous: '2026-12-01' });
    expect(lockByYear).toHaveBeenCalledWith(tx, orgId, 2026, 'UPDATE');
    expect(update).toHaveBeenCalledWith(tx, 'cycle-2026', {
      submissionDeadline: '2026-11-30',
    });
  });

  it('returns null without writing when the cycle does not exist', async () => {
    const lockByYear = jest.fn().mockResolvedValue(null);
    const update = jest.fn();
    const api = new LocalDemoBudgetCycleApi({ lockByYear, update } as unknown as CycleRepo);

    const moved = await api.setSubmissionDeadline(tx, orgId, 2026, '2026-11-30');

    expect(moved).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('inserts skipped seat_month_runs marks for months 1..upToMonth and returns 0 when empty', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 4 });
    const mockTx = { seatMonthRun: { createMany } } as unknown as DbTx;
    const api = new LocalDemoBudgetCycleApi({} as CycleRepo);

    expect(await api.markClosedSeatMonths(mockTx, orgId, 2026, 0, ['sub-1'])).toBe(0);
    expect(await api.markClosedSeatMonths(mockTx, orgId, 2026, 2, [])).toBe(0);
    expect(createMany).not.toHaveBeenCalled();

    const count = await api.markClosedSeatMonths(mockTx, orgId, 2026, 2, ['sub-1', 'sub-2']);
    expect(count).toBe(4);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          organizationId: orgId,
          subscriptionId: 'sub-1',
          month: new Date(Date.UTC(2026, 0, 1)),
          rows: 0,
        }),
        expect.objectContaining({
          organizationId: orgId,
          subscriptionId: 'sub-1',
          month: new Date(Date.UTC(2026, 1, 1)),
          rows: 0,
        }),
        expect.objectContaining({
          organizationId: orgId,
          subscriptionId: 'sub-2',
          month: new Date(Date.UTC(2026, 0, 1)),
          rows: 0,
        }),
        expect.objectContaining({
          organizationId: orgId,
          subscriptionId: 'sub-2',
          month: new Date(Date.UTC(2026, 1, 1)),
          rows: 0,
        }),
      ],
      skipDuplicates: true,
    });
  });
});
