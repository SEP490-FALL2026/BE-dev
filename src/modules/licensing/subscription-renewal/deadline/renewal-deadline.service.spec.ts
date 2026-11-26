import type { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../../audit/public/audit.api';
import type { PeriodAdjustment, RenewalPeriodFacts } from '../../../catalog/public/subscription-period.types';
import type { RenewalNotifier } from '../subscription-renewal-notifier.service';
import type { SubscriptionRenewalRepo } from '../subscription-renewal.repo';
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

type Written = Record<string, unknown>;

function build(inserted: boolean) {
  const insertDeadlineEvent = jest
    .fn<Promise<{ id: string } | null>, [tx: unknown, event: Written]>()
    .mockResolvedValue(inserted ? { id: 'event-1' } : null);
  const tell = jest.fn<Promise<string[]>, [tx: unknown, notice: Written]>().mockResolvedValue([]);
  const record = jest.fn<Promise<void>, [tx: unknown, event: Written]>().mockResolvedValue(undefined);
  const service = new RenewalDeadlineService(
    { insertDeadlineEvent } as unknown as SubscriptionRenewalRepo,
    { tell } as unknown as RenewalNotifier,
    { record } as unknown as AuditApi,
    { run: (work: (tx: unknown) => unknown) => work({}) } as unknown as TransactionRunner,
  );

  return { service, insertDeadlineEvent, tell, record };
}

const subject = (kind: DeadlineSubject['kind'], autoRenew: boolean): DeadlineSubject => ({
  organizationId: 'org',
  today: '2026-12-07',
  period: { ...period, autoRenew },
  adjustment,
  kind,
  people,
});

describe('the renewal day passed with no outcome (SBF-20 §4.5, §13)', () => {
  it('records an incident on the renewal day and tells the IT Admin, Finance and the spending approver (QĐ-99h)', async () => {
    const { service, insertDeadlineEvent, tell, record } = build(true);

    expect(await service.recordPassedRenewalDay(subject('AUTO_RENEWAL_INCIDENT', true))).toBe(true);

    expect(insertDeadlineEvent.mock.calls[0][1]).toMatchObject({
      subscriptionId: 'sub-1',
      kind: 'AUTO_RENEWAL_INCIDENT',
      noticeBaseDate: '2026-12-06',
      autoRenewAtTime: true,
      recordedOn: '2026-12-07',
    });
    expect(tell.mock.calls[0][1]).toMatchObject({
      recipients: ['it', 'fin', 'boss'],
      code: 'SUBSCRIPTION_AUTO_RENEWAL_INCIDENT',
      params: { subscriptionId: 'sub-1', baseDate: '2026-12-06', renewalId: null },
      eventKey: 'subscription-incident:sub-1:2026-12-06',
    });
    expect(record.mock.calls[0][1]).toMatchObject({
      action: 'SUBSCRIPTION.AUTO_RENEWAL_INCIDENT',
      after: { baseDate: '2026-12-06', reason: 'NO_OUTCOME_BY_RENEWAL_DAY' },
    });
  });

  it('marks the end of a period that does not renew itself and tells the IT Admin and Finance, never the spending approver', async () => {
    const { service, tell, record } = build(true);

    expect(await service.recordPassedRenewalDay(subject('EXPIRY_MARKED', false))).toBe(true);

    expect(tell.mock.calls[0][1]).toMatchObject({
      recipients: ['it', 'fin'],
      code: 'SUBSCRIPTION_EXPIRY_MARKED',
      params: { subscriptionId: 'sub-1', baseDate: '2026-12-06', endDate: '2026-12-06' },
      eventKey: 'subscription-expiry:sub-1:2026-12-06',
    });
    expect(record.mock.calls[0][1]).toMatchObject({ action: 'SUBSCRIPTION.EXPIRY_MARKED' });
  });

  it('writes and tells nothing when the period already has its event', async () => {
    const { service, tell, record } = build(false);

    expect(await service.recordPassedRenewalDay(subject('AUTO_RENEWAL_INCIDENT', true))).toBe(false);

    expect(tell).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('delegates lockCutoffIfDue and recordPassedRenewalDay to SubscriptionRenewalLinesService when bound', async () => {
    const lockCutoffIfDue = jest.fn().mockResolvedValue(true);
    const handlePassedRenewalDay = jest.fn().mockResolvedValue(true);
    const service = new RenewalDeadlineService(
      {} as unknown as SubscriptionRenewalRepo,
      {} as unknown as RenewalNotifier,
      {} as unknown as AuditApi,
      {} as unknown as TransactionRunner,
      { lockCutoffIfDue, handlePassedRenewalDay } as never,
    );

    expect(await service.lockCutoffIfDue({ period, adjustment, today: '2026-12-02' })).toBe(true);
    expect(await service.recordPassedRenewalDay(subject('AUTO_RENEWAL_INCIDENT', true))).toBe(true);
    expect(handlePassedRenewalDay).toHaveBeenCalled();
  });
});
