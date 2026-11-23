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
});
