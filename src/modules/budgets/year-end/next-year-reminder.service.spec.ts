import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { NotificationsApi } from '../../notifications/public/notifications.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { BudgetFactsRepo } from '../budget/budget-facts.repo';
import type { BudgetFactsService } from '../budget/budget-facts.service';
import { NextYearReminderService } from './next-year-reminder.service';

describe('NextYearReminderService (aggregated per recipient)', () => {
  const createHarness = (overrides: { notifyImpl?: jest.Mock } = {}) => {
    const notifyInApp = overrides.notifyImpl ?? jest.fn().mockResolvedValue(true);
    const run = jest.fn((work: (tx: unknown) => Promise<number>) => work({ tx: true }));
    const runner = { run } as unknown as TransactionRunner;
    const facts = {
      today: jest.fn().mockResolvedValue('2026-12-01'),
      organizationId: jest.fn().mockResolvedValue('org-1'),
      financeEmployeeId: jest.fn().mockResolvedValue('fin-1'),
      usableSpendingApproverEmployeeId: jest.fn().mockResolvedValue('app-1'),
    } as unknown as BudgetFactsService;
    const budgets = {
      approvedOfCostCenters: jest.fn().mockResolvedValue(new Set(['cc-covered'])),
    } as unknown as BudgetFactsRepo;
    const organizationReads = {
      getActiveDepartmentIds: jest.fn().mockResolvedValue(['d-1', 'd-2', 'd-3', 'd-4']),
      getUnitCostCenterIds: jest.fn().mockResolvedValue(
        new Map([
          ['d-1', 'cc-1'],
          ['d-2', 'cc-2'],
          ['d-3', 'cc-3'],
          ['d-4', 'cc-covered'],
        ]),
      ),
    } as unknown as OrganizationReadApi;
    const notifications = { notifyInApp } as unknown as NotificationsApi;
    const service = new NextYearReminderService(runner, facts, budgets, organizationReads, notifications);

    return { service, notifyInApp, run };
  };

  it('sends one aggregated notice with subject=null and costCenterCount per recipient in its own transaction', async () => {
    const { service, notifyInApp, run } = createHarness();

    const result = await service.noticeDue(new Date('2026-12-01T09:00:00Z'));

    expect(result).toEqual({ notices: 2 });
    expect(run).toHaveBeenCalledTimes(2);
    expect(notifyInApp).toHaveBeenCalledTimes(2);
    expect(notifyInApp).toHaveBeenNthCalledWith(1, expect.anything(), {
      organizationId: 'org-1',
      recipientEmployeeId: 'fin-1',
      code: 'BUDGET_NEXT_YEAR_MISSING',
      subject: null,
      params: { year: 2027, costCenterCount: 3 },
      eventKey: 'nextYearBudget:2027:2026-12-01',
    });
    expect(notifyInApp).toHaveBeenNthCalledWith(2, expect.anything(), {
      organizationId: 'org-1',
      recipientEmployeeId: 'app-1',
      code: 'BUDGET_NEXT_YEAR_MISSING',
      subject: null,
      params: { year: 2027, costCenterCount: 3 },
      eventKey: 'nextYearBudget:2027:2026-12-01',
    });
  });

  it('keeps sending to the next recipient when one recipient transaction fails', async () => {
    const notifyInApp = jest.fn().mockRejectedValueOnce(new Error('transient')).mockResolvedValueOnce(true);
    const { service } = createHarness({ notifyImpl: notifyInApp });

    const result = await service.noticeDue(new Date('2026-12-01T09:00:00Z'));

    expect(result).toEqual({ notices: 1 });
    expect(notifyInApp).toHaveBeenCalledTimes(2);
  });
});
