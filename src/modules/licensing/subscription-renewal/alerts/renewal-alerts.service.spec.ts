import type { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../../audit/public/audit.api';
import type { PeriodAdjustment, RenewalPeriodFacts } from '../../../catalog/public/subscription-period.types';
import type { RenewalNotifier } from '../subscription-renewal-notifier.service';
import { RenewalAlertsService, type AlertSubject } from './renewal-alerts.service';
import type { WorkspaceAdminAlertService } from './workspace-admin-alert.service';

const adjustment: PeriodAdjustment = {
  kind: 'NOTICE_DEADLINE',
  deadline: '2026-12-01',
  point: '2026-11-01',
  end: '2026-12-06',
  redAlertOn: '2026-11-24',
  commitment: 'ANNUAL',
};
const period = { subscriptionId: 'sub-1', purchasedQuantity: 10 } as unknown as RenewalPeriodFacts;
const people = { itAdmin: 'it', finance: 'fin', approver: 'boss', superAdmin: 'root' };

type Written = Record<string, unknown>;

function build(told?: string[]) {
  const tell = jest.fn((_tx: unknown, input: Written) => Promise.resolve(told ?? [...(input.recipients as string[])]));
  const record = jest.fn<Promise<void>, [tx: unknown, event: Written]>().mockResolvedValue(undefined);
  const service = new RenewalAlertsService(
    { tell } as unknown as RenewalNotifier,
    { record } as unknown as AuditApi,
    { run: (work: (tx: unknown) => unknown) => work({}) } as unknown as TransactionRunner,
    { sweep: jest.fn().mockResolvedValue(0) } as unknown as WorkspaceAdminAlertService,
  );

  return { service, tell, record };
}

const subject = (kinds: AlertSubject['kinds']): AlertSubject => ({
  organizationId: 'org',
  period,
  adjustment,
  seatsNeeded: 3,
  people,
  kinds,
});

describe('the alerts of the point of adjustment (SBF-20 §4.5, §13)', () => {
  it('tells the IT Admin alone of the point, with the new params and the key of the deadline', async () => {
    const { service, tell } = build();

    expect(await service.sendDue(subject(['ADJUSTMENT_POINT']))).toBe(1);

    expect(tell).toHaveBeenCalledTimes(1);
    expect(tell.mock.calls[0][1]).toMatchObject({
      recipients: ['it'],
      code: 'SUBSCRIPTION_RENEWAL_ALERT',
      subject: { type: 'SUBSCRIPTION', id: 'sub-1' },
      params: {
        subscriptionId: 'sub-1',
        renewalId: null,
        baseDate: '2026-12-01',
        renewalOn: '2026-12-06',
        seatsNeeded: 3,
        commitment: 'ANNUAL',
      },
      eventKey: 'subscription-adjustment-point:sub-1:2026-12-01',
    });
  });

  it('tells the IT Admin and Finance of the red alert, not the spending approver nor the Super Admin', async () => {
    const { service, tell } = build();

    expect(await service.sendDue(subject(['RED_ALERT']))).toBe(2);

    expect(tell.mock.calls[0][1]).toMatchObject({
      recipients: ['it', 'fin'],
      code: 'SUBSCRIPTION_RENEWAL_RED_ALERT',
      params: { subscriptionId: 'sub-1', baseDate: '2026-12-01', renewalOn: '2026-12-06', seatsNeeded: 3 },
      eventKey: 'subscription-renewal-red:sub-1:2026-12-01',
    });
  });

  it('tells the IT Admin of the seats a plan by the month keeps, with what was bought and what is needed', async () => {
    const { service, tell } = build();

    await service.sendDue(subject(['KEPT']));

    expect(tell.mock.calls[0][1]).toMatchObject({
      recipients: ['it'],
      code: 'SUBSCRIPTION_RENEWAL_KEPT',
      params: { subscriptionId: 'sub-1', renewalOn: '2026-12-06', purchasedQuantity: 10, seatsNeeded: 3 },
      eventKey: 'subscription-renewal-kept:sub-1:2026-12-01',
    });
  });

  it('writes one audit event for each person told now and none for a person told before', async () => {
    const { service, record } = build(['fin']);

    expect(await service.sendDue(subject(['RED_ALERT']))).toBe(1);

    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][1]).toMatchObject({
      actorKind: 'SYSTEM',
      action: 'SUBSCRIPTION_RENEWAL.ALERT_SENT',
      after: { kind: 'RED_ALERT', recipientEmployeeId: 'fin' },
    });
  });

  it('does nothing for no kind', async () => {
    const { service, tell } = build();

    expect(await service.sendDue(subject([]))).toBe(0);
    expect(tell).not.toHaveBeenCalled();
  });
});

describe('the warning of the quality of the contract data', () => {
  it('keeps the key it always had for a period with no date, and adds the problem to the key of the other', async () => {
    const { service, tell } = build();
    const base = { organizationId: 'org', period, itAdmin: 'it' };

    await service.dataQualityWarning({ ...base, problem: 'NO_ALERT_ANCHOR' });
    await service.dataQualityWarning({ ...base, problem: 'NO_NOTICE_DEADLINE' });

    expect(tell.mock.calls.map((call) => call[1])).toMatchObject([
      {
        recipients: ['it'],
        code: 'SUBSCRIPTION_RENEWAL_DATA_QUALITY',
        params: { subscriptionId: 'sub-1', problem: 'NO_ALERT_ANCHOR' },
        eventKey: 'subscription-renewal-data-quality:sub-1',
      },
      {
        params: { subscriptionId: 'sub-1', problem: 'NO_NOTICE_DEADLINE' },
        eventKey: 'subscription-renewal-data-quality:sub-1:NO_NOTICE_DEADLINE',
      },
    ]);
  });

  it('tells nobody when no IT Admin is usable', async () => {
    const { service, tell } = build();

    expect(
      await service.dataQualityWarning({ organizationId: 'org', period, itAdmin: null, problem: 'NO_ALERT_ANCHOR' }),
    ).toBe(0);
    expect(tell).not.toHaveBeenCalled();
  });
});
