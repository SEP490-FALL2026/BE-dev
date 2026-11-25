import { Logger } from '@nestjs/common';
import type { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import type { PeriodAdjustment, RenewalPeriodFacts } from '../../catalog/public/subscription-period.types';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { RenewalAlertsService } from './alerts/renewal-alerts.service';
import type { SeatPurchaseInvoiceDueService } from '../shared-pool/seat-purchase-invoice-due.service';
import type { RenewalDeadlineService } from './deadline/renewal-deadline.service';
import type { RenewalSeatsNeededService } from './seats-needed/renewal-seats-needed.service';
import type { RenewalPartiesService } from './subscription-renewal-parties.service';
import { SubscriptionRenewalSweepService } from './subscription-renewal-sweep.service';
import type { SubscriptionRenewalRepo } from './subscription-renewal.repo';
import type { RenewalRecord } from './subscription-renewal.types';

const annual: PeriodAdjustment = {
  kind: 'NOTICE_DEADLINE',
  deadline: '2026-12-01',
  point: '2026-11-01',
  end: '2026-12-06',
  redAlertOn: '2026-11-24',
  commitment: 'ANNUAL',
};
const periodOf = (id: string, adjustment: PeriodAdjustment | null, extra: Partial<RenewalPeriodFacts> = {}) =>
  ({
    subscriptionId: id,
    planId: `plan-${id}`,
    vendorMinimumSeats: null,
    isPrimaryForPlan: true,
    purchasedQuantity: 10,
    autoRenew: true,
    responsibleItAdminEmployeeId: null,
    adjustment,
    ...extra,
  }) as unknown as RenewalPeriodFacts;
const counts = { seatsNeeded: 3, target: 3, activeSeatsToday: 3 };
const TODAY = { value: '2026-11-10' };
type Written = Record<string, unknown>;

function build(
  subjects: RenewalPeriodFacts[],
  options: {
    cases?: Map<string, Partial<RenewalRecord>[]>;
    events?: string[];
    ending?: string[];
    counts?: Partial<typeof counts>;
  } = {},
) {
  const ofSubscriptions = jest.fn().mockResolvedValue(options.cases ?? new Map());
  const endingAmong = jest.fn().mockResolvedValue(new Set(options.ending ?? []));
  const deadlineEventsOf = jest.fn().mockResolvedValue(new Map((options.events ?? []).map((id) => [id, {}])));
  const sharedPeople = jest.fn().mockResolvedValue({ finance: 'fin', approver: 'boss', superAdmin: 'root' });
  const peopleOf = jest.fn((_period: unknown, shared: object) => Promise.resolve({ ...shared, itAdmin: 'it' }));
  const countFor = jest
    .fn<Promise<typeof counts>, [input: Written]>()
    .mockResolvedValue({ ...counts, ...options.counts });
  const sendDue = jest.fn<Promise<number>, [subject: Written]>().mockResolvedValue(1);
  const dataQualityWarning = jest.fn<Promise<number>, [subject: Written]>().mockResolvedValue(1);
  const recordPassedRenewalDay = jest.fn<Promise<boolean>, [subject: Written]>().mockResolvedValue(true);
  const workspaceAdminSweep = jest.fn<Promise<number>, [organizationId: string]>().mockResolvedValue(0);
  const service = new SubscriptionRenewalSweepService(
    { listAdjustmentSubjects: jest.fn().mockResolvedValue(subjects) } as unknown as SubscriptionPeriodApi,
    { ofSubscriptions, endingAmong, deadlineEventsOf } as unknown as SubscriptionRenewalRepo,
    { sharedPeople, peopleOf } as unknown as RenewalPartiesService,
    {
      getOrganization: jest.fn().mockResolvedValue({ id: 'org' }),
      businessToday: jest.fn(() => Promise.resolve(TODAY.value)),
    } as unknown as OrganizationReadApi,
    { countFor } as unknown as RenewalSeatsNeededService,
    { sendDue, dataQualityWarning, sweepWorkspaceAdmins: workspaceAdminSweep } as unknown as RenewalAlertsService,
    { recordPassedRenewalDay } as unknown as RenewalDeadlineService,
    {
      remindOverdue: jest.fn().mockResolvedValue({ told: 0, failed: 0 }),
    } as unknown as SeatPurchaseInvoiceDueService,
  );

  return {
    service,
    ofSubscriptions,
    sharedPeople,
    countFor,
    sendDue,
    dataQualityWarning,
    recordPassedRenewalDay,
    workspaceAdminSweep,
  };
}

const sweep = (service: SubscriptionRenewalSweepService) => service.sweep(new Date('2026-11-10T05:00:00.000Z'));

describe('the pass over the points of adjustment (SBF-20 §4.5)', () => {
  beforeEach(() => {
    TODAY.value = '2026-11-10';
  });

  it('counts the seats and tells the IT Admin of a period at its point, reading the cases of all in ONE read', async () => {
    const { service, ofSubscriptions, countFor, sendDue } = build([periodOf('a', annual)]);

    expect(await sweep(service)).toEqual({ told: 1, deadlineEvents: 0, failed: 0 });

    expect(ofSubscriptions).toHaveBeenCalledWith(['a']);
    expect(countFor).toHaveBeenCalledWith({
      subscriptionId: 'a',
      planId: 'plan-a',
      vendorMinimumSeats: null,
      isPrimaryForPlan: true,
      renewalOn: '2026-12-06',
      today: '2026-11-10',
    });
    expect(sendDue.mock.calls[0][0]).toMatchObject({ kinds: ['ADJUSTMENT_POINT'], seatsNeeded: 3 });
  });

  it('does not count the seats of a period with nothing due, nor read who is told (R2-12)', async () => {
    TODAY.value = '2026-10-20';
    const { service, countFor, sendDue, sharedPeople } = build([periodOf('a', annual), periodOf('b', annual)]);

    expect(await sweep(service)).toEqual({ told: 0, deadlineEvents: 0, failed: 0 });

    expect(countFor).not.toHaveBeenCalled();
    expect(sendDue).not.toHaveBeenCalled();
    expect(sharedPeople).not.toHaveBeenCalled();
  });

  it('counts nothing for a period for which a case stands, nor for a case left DECIDED before the one-write renewal', async () => {
    const cases = new Map<string, Partial<RenewalRecord>[]>([
      ['a', [{ state: 'OUTCOME_RECORDED', noticeBaseDate: '2026-12-01' }]],
      ['b', [{ state: 'DECIDED', noticeBaseDate: '2026-11-15' }]],
    ]);
    const { service, countFor } = build([periodOf('a', annual), periodOf('b', annual)], { cases });

    await sweep(service);

    expect(countFor).not.toHaveBeenCalled();
  });

  it('records the incident of a period that renewed itself past its renewal day while seats are held', async () => {
    TODAY.value = '2026-12-07';
    const { service, recordPassedRenewalDay, sendDue } = build([periodOf('a', annual)]);

    expect(await sweep(service)).toEqual({ told: 0, deadlineEvents: 1, failed: 0 });

    expect(recordPassedRenewalDay.mock.calls[0][0]).toMatchObject({
      kind: 'AUTO_RENEWAL_INCIDENT',
      today: '2026-12-07',
    });
    expect(sendDue).not.toHaveBeenCalled();
  });

  it('marks the end of a plan that does not renew itself, and records nothing when no seat is held or the event exists', async () => {
    TODAY.value = '2026-12-07';
    const ends = periodOf('a', annual, { autoRenew: false });
    const marked = build([ends]);
    await sweep(marked.service);
    expect(marked.recordPassedRenewalDay.mock.calls[0][0]).toMatchObject({ kind: 'EXPIRY_MARKED' });

    const empty = build([ends], { counts: { activeSeatsToday: 0 } });
    expect(await sweep(empty.service)).toEqual({ told: 0, deadlineEvents: 0, failed: 0 });
    expect(empty.recordPassedRenewalDay).not.toHaveBeenCalled();

    const already = build([ends], { events: ['a'] });
    await sweep(already.service);
    expect(already.countFor).not.toHaveBeenCalled();
  });

  it('warns of the quality of the data of a period with no point of adjustment, and counts nothing for it', async () => {
    const { service, dataQualityWarning, countFor } = build([periodOf('a', null)]);

    expect(await sweep(service)).toEqual({ told: 1, deadlineEvents: 0, failed: 0 });

    expect(dataQualityWarning).toHaveBeenCalledTimes(1);
    expect(dataQualityWarning.mock.calls[0][0]).toMatchObject({
      organizationId: 'org',
      period: { subscriptionId: 'a' },
      itAdmin: 'it',
      problem: 'NO_ALERT_ANCHOR',
    });
    expect(countFor).not.toHaveBeenCalled();
  });

  it('warns of no deadline to cancel for a plan by the year counted from its renewal date, besides its alerts', async () => {
    const byRenewalDate: PeriodAdjustment = { ...annual, kind: 'RENEWAL_DATE' };
    const { service, dataQualityWarning, sendDue } = build([periodOf('a', byRenewalDate)]);

    await sweep(service);

    expect(dataQualityWarning.mock.calls[0][0]).toMatchObject({ problem: 'NO_NOTICE_DEADLINE' });
    expect(sendDue).toHaveBeenCalledTimes(1);
  });

  it('tells a plan by the month that keeps its seats on its payment day, when more are bought than the target', async () => {
    TODAY.value = '2026-12-01';
    const monthly: PeriodAdjustment = {
      kind: 'PAYMENT_DATE',
      deadline: '2026-12-01',
      point: '2026-11-24',
      end: '2026-12-01',
      redAlertOn: null,
      commitment: 'MONTHLY',
    };
    const { service, sendDue } = build([periodOf('a', monthly)]);

    await sweep(service);

    expect(sendDue.mock.calls[0][0]).toMatchObject({ kinds: ['ADJUSTMENT_POINT', 'KEPT'] });
  });

  it('passes over a subscription recorded as cancelled whole: no alert, no warning, no event, the seats not even counted (A1C-02)', async () => {
    TODAY.value = '2026-12-01';
    const monthly: PeriodAdjustment = {
      kind: 'PAYMENT_DATE',
      deadline: '2026-12-01',
      point: '2026-11-24',
      end: '2026-12-01',
      redAlertOn: null,
      commitment: 'MONTHLY',
    };
    const { service, sendDue, countFor, dataQualityWarning, recordPassedRenewalDay } = build(
      [periodOf('a', monthly), periodOf('b', null)],
      { ending: ['a', 'b'] },
    );

    expect(await sweep(service)).toEqual({ told: 0, deadlineEvents: 0, failed: 0 });

    expect(countFor).not.toHaveBeenCalled();
    expect(sendDue).not.toHaveBeenCalled();
    expect(dataQualityWarning).not.toHaveBeenCalled();
    expect(recordPassedRenewalDay).not.toHaveBeenCalled();
  });

  it('a subscription that fails does not stop the others: the next one is told, the failure is counted and logged without its data (O-2)', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    try {
      const { service, countFor, sendDue } = build([periodOf('a', annual), periodOf('b', annual)]);
      countFor.mockRejectedValueOnce(new Error('alice@example.com holds 12 seats'));

      expect(await sweep(service)).toEqual({ told: 1, deadlineEvents: 0, failed: 1 });

      expect(sendDue).toHaveBeenCalledTimes(1);
      expect(sendDue.mock.calls[0][0]).toMatchObject({ period: { subscriptionId: 'b' } });
      expect(error).toHaveBeenCalledTimes(1);
      const logged = String(error.mock.calls[0][0]);
      expect(logged).toContain('a');
      expect(logged).toContain('Error');
      expect(logged).not.toContain('alice@example.com');
    } finally {
      error.mockRestore();
    }
  });

  it('runs the workspace admin alert sweep even when no renewal subjects are due (W3-12)', async () => {
    const { service, workspaceAdminSweep } = build([]);
    workspaceAdminSweep.mockResolvedValue(2);

    expect(await sweep(service)).toEqual({ told: 2, deadlineEvents: 0, failed: 0 });
    expect(workspaceAdminSweep).toHaveBeenCalledWith('org');
  });
});
