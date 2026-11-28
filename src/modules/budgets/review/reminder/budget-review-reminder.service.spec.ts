import type { DbTx, TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { NotificationsApi } from '../../../notifications/public/notifications.api';
import type { OperatingParametersApi } from '../../../operating-parameters/public/operating-parameters.api';
import type { BudgetFactsService } from '../../budget/budget-facts.service';
import type { SharedPoolLineAlertService } from '../../shared-pool-line/shared-pool-line-alert.service';
import type { BudgetReviewExplanationReminderService } from '../budget-review-explanation-reminder.service';
import type { BudgetReviewPoolWatchService } from '../budget-review-pool-watch.service';
import type { BudgetReviewRepo } from '../budget-review.repo';
import { BudgetReviewReminderService } from './budget-review-reminder.service';

describe('BudgetReviewReminderService', () => {
  const build = () => {
    const runner = {
      run: jest.fn((fn: (tx: DbTx) => Promise<unknown>) => fn({} as DbTx)),
    };
    const facts = {
      today: jest.fn().mockResolvedValue('2026-12-05'),
      organizationId: jest.fn().mockResolvedValue('org-1'),
      financeEmployeeId: jest.fn().mockResolvedValue('fin-1'),
    };
    const repo = {
      findByMonth: jest.fn().mockResolvedValue(null),
    };
    const parameters = {
      getNonWorkingDates: jest.fn().mockResolvedValue(new Set()),
    };
    const notifications = {
      notifyInApp: jest.fn().mockResolvedValue(true),
    };
    const poolWatch = {
      figuresOf: jest.fn().mockResolvedValue({
        unallocatedMinor: 12_100_000n,
        reserveMinor: 12_000_000n,
        annualCeilingMinor: null,
        overReserve: true,
      }),
      tellFinance: jest.fn().mockResolvedValue(true),
    };
    const explanations = {
      remind: jest.fn().mockResolvedValue(0),
    };
    const poolLineAlert = {
      warnIdleRatioForMonth: jest.fn().mockResolvedValue(2),
    };

    const service = new BudgetReviewReminderService(
      runner as unknown as TransactionRunner,
      facts as unknown as BudgetFactsService,
      repo as unknown as BudgetReviewRepo,
      parameters as unknown as OperatingParametersApi,
      notifications as unknown as NotificationsApi,
      poolWatch as unknown as BudgetReviewPoolWatchService,
      explanations as unknown as BudgetReviewExplanationReminderService,
      poolLineAlert as unknown as SharedPoolLineAlertService,
    );

    return { service, poolWatch, poolLineAlert, explanations };
  };

  it('checks over-reserve on last ended month and dispatches idle-ratio alerts once per ended month', async () => {
    const { service, poolWatch, poolLineAlert } = build();

    const result = await service.noticeDue(new Date('2026-12-05T08:00:00Z'));

    expect(poolWatch.figuresOf).toHaveBeenCalledWith('org-1', 2026, 11);
    expect(poolWatch.tellFinance).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      2026,
      11,
      expect.objectContaining({ overReserve: true }),
    );
    expect(poolLineAlert.warnIdleRatioForMonth).toHaveBeenCalledWith('2026-11-01');
    expect(result.notices).toBe(3);
  });

  it('continues pool reserve & explanation checks if idle-ratio alerting throws', async () => {
    const { service, poolWatch, poolLineAlert, explanations } = build();
    poolWatch.figuresOf.mockResolvedValue({
      unallocatedMinor: 12_000_000n,
      reserveMinor: 12_000_000n,
      annualCeilingMinor: null,
      overReserve: false,
    });
    poolLineAlert.warnIdleRatioForMonth.mockRejectedValue(new Error('transient read error'));
    explanations.remind.mockResolvedValue(1);

    const result = await service.noticeDue(new Date('2026-12-05T08:00:00Z'));

    expect(poolWatch.tellFinance).not.toHaveBeenCalled();
    expect(result.notices).toBe(1);
  });
});
