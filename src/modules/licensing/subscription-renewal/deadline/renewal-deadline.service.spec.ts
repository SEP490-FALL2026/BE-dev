import type { PeriodAdjustment, RenewalPeriodFacts } from '../../../catalog/public/subscription-period.types';
import type { SubscriptionRenewalLinesService } from '../lines/subscription-renewal-lines.service';
import { RenewalDeadlineService, type DeadlineSubject } from './renewal-deadline.service';

const adjustment: PeriodAdjustment = {
  kind: 'NOTICE_DEADLINE',
  deadline: '2026-12-01',
  point: '2026-11-01',
  end: '2026-12-06',
  redAlertOn: '2026-11-24',
  commitment: 'ANNUAL',
};
const period = {
  subscriptionId: 'sub-1',
  autoRenew: true,
  endDate: '2026-12-06',
} as unknown as RenewalPeriodFacts;
const people = { itAdmin: 'it', finance: 'fin', approver: 'boss', superAdmin: 'root' };

const subject = (kind: DeadlineSubject['kind'], autoRenew: boolean): DeadlineSubject => ({
  organizationId: 'org',
  today: '2026-12-07',
  period: { ...period, autoRenew },
  adjustment,
  kind,
  people,
});

describe('RenewalDeadlineService', () => {
  it('delegates lockCutoffIfDue, closeExpiredPeriod, and recordPassedRenewalDay to SubscriptionRenewalLinesService', async () => {
    const lockCutoffIfDue = jest.fn().mockResolvedValue(true);
    const closeExpiredPeriod = jest.fn().mockResolvedValue(true);
    const handlePassedRenewalDay = jest.fn().mockResolvedValue(true);
    const service = new RenewalDeadlineService({
      lockCutoffIfDue,
      closeExpiredPeriod,
      handlePassedRenewalDay,
    } as unknown as SubscriptionRenewalLinesService);

    expect(await service.lockCutoffIfDue({ period, adjustment, today: '2026-12-02' })).toBe(true);
    expect(lockCutoffIfDue).toHaveBeenCalledWith({ period, adjustment, today: '2026-12-02' });

    expect(await service.closeExpiredPeriod({ period, adjustment })).toBe(true);
    expect(closeExpiredPeriod).toHaveBeenCalledWith({ period, adjustment });

    const arg = subject('AUTO_RENEWAL_INCIDENT', true);
    expect(await service.recordPassedRenewalDay(arg)).toBe(true);
    expect(handlePassedRenewalDay).toHaveBeenCalledWith(arg);
  });
});
