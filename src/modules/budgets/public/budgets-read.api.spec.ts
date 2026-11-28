import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { BudgetFactsRepo } from '../budget/budget-facts.repo';
import type { RunningUncommittedFactsService } from '../running-uncommitted/running-uncommitted-facts.service';
import { BudgetsReadApi } from './budgets-read.api';

describe('BudgetsReadApi (B-4 D-13 & B-7)', () => {
  it('B-4 (D-13): requires RunningUncommittedFactsService via constructor and removes registerRunningUncommitted hook', () => {
    expect(BudgetsReadApi.length).toBe(2);
    expect('registerRunningUncommitted' in BudgetsReadApi.prototype).toBe(false);
  });

  it('B-7: runningUncommittedOfYear calls ofYear once for N cost centers and filters to requested costCenterIds', async () => {
    const factsRepo = {} as unknown as BudgetFactsRepo;
    const ofCostCenterYears = jest.fn();
    const ofYear = jest.fn().mockResolvedValue(
      new Map([
        ['cc-1', 1_200_000n],
        ['cc-2', 0n],
        ['cc-3', 3_400_000n],
        ['cc-other', 9_900_000n],
      ]),
    );
    const runningUncommitted = {
      ofCostCenterYears,
      ofYear,
    } as unknown as RunningUncommittedFactsService;

    const api = new BudgetsReadApi(factsRepo, runningUncommitted);

    const tx = { tag: 'tx' } as unknown as DbTx;
    const res = await api.runningUncommittedOfYear(
      ['cc-1', 'cc-2', 'cc-3', 'cc-1'],
      2027,
      { exceptRequestIds: ['req-x'] },
      tx,
    );

    expect(ofYear).toHaveBeenCalledTimes(1);
    expect(ofYear).toHaveBeenCalledWith(2027, undefined, tx, { exceptRequestIds: ['req-x'] });
    expect(ofCostCenterYears).not.toHaveBeenCalled();
    expect([...res.entries()]).toEqual([
      ['cc-1', 1_200_000n],
      ['cc-3', 3_400_000n],
    ]);
  });
});
