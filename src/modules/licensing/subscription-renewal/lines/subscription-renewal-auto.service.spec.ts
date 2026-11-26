import type { TransactionRunner, DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../../audit/public/audit.api';
import type { SeatLedgerApi } from '../../../catalog/public/seat-ledger.api';
import type { SubscriptionPeriodApi } from '../../../catalog/public/subscription-period.api';
import type { PeriodAdjustment, RenewalPeriodFacts } from '../../../catalog/public/subscription-period.types';
import { RenewalNotifier } from '../subscription-renewal-notifier.service';
import type { RenewalPeople } from '../subscription-renewal-parties.service';
import type { SubscriptionRenewalRepo } from '../subscription-renewal.repo';
import type { RenewalOutcomeService } from '../outcome/renewal-outcome.service';
import { SubscriptionRenewalAutoService } from './subscription-renewal-auto.service';
import type { SubscriptionRenewalLinesFactsService } from './subscription-renewal-lines-facts.service';

const ADJUSTMENT: PeriodAdjustment = {
  kind: 'NOTICE_DEADLINE',
  point: '2027-05-02',
  deadline: '2027-06-01',
  end: '2027-07-01',
  redAlertOn: '2027-05-25',
  commitment: 'ANNUAL',
};

function makePeriod(extra: Partial<RenewalPeriodFacts> = {}): RenewalPeriodFacts {
  return {
    subscriptionId: 'sub-1',
    planId: 'plan-std',
    planName: 'Standard',
    planPricingModel: 'PER_SEAT',
    applicationId: 'app-1',
    applicationName: 'Slack',
    applicationKind: 'SAAS',
    responsibleItAdminEmployeeId: 'it-1',
    provisioningType: 'K2',
    commitmentTermMonths: 12,
    vendorMinimumSeats: null,
    isPrimaryForPlan: false,
    kind: 'TERM',
    status: 'ACTIVE',
    purchasedQuantity: 14,
    unitPrice: null,
    billingCycle: 'ANNUAL',
    startDate: '2026-07-01',
    endDate: '2027-06-30',
    renewalDate: '2027-07-01',
    autoRenew: true,
    allowsMidTermReduction: false,
    notice: { source: 'DECLARED', deadline: '2027-06-01', baseDate: '2027-06-01' },
    adjustment: ADJUSTMENT,
    renewedFromId: null,
    renewedById: null,
    seatCounting: 'FIXED',
    workspaceId: 'ws-1',
    minimumSeatsTotal: 5,
    noticePeriodDays: null,
    ...extra,
  };
}

const PEOPLE: RenewalPeople = {
  itAdmin: 'it-1',
  finance: 'fin-1',
  approver: 'ceo-1',
  superAdmin: 'root-1',
};

describe('SubscriptionRenewalAutoService (W3-21 cutoff lock, Ca B auto-renew, Ca C expiry)', () => {
  function setup() {
    const tx = {} as DbTx;
    const repo = {
      ofSubscriptions: jest.fn().mockResolvedValue(new Map()),
      deadlineEventsOf: jest.fn().mockResolvedValue(new Map()),
      insert: jest.fn().mockResolvedValue({ id: 'ren-auto-1', subscriptionId: 'sub-1', state: 'PROPOSED' }),
      recordDecision: jest.fn().mockResolvedValue({
        id: 'ren-auto-1',
        subscriptionId: 'sub-1',
        state: 'DECIDED',
        decision: { choice: 'RENEW', quantity: 14, deciderRole: 'SYSTEM' },
      }),
      insertDeadlineEvent: jest.fn().mockResolvedValue({ id: 'evt-1' }),
    };
    const periods = {
      lockPeriod: jest.fn().mockResolvedValue(makePeriod()),
      closeExpiredLines: jest.fn().mockResolvedValue(undefined),
    };
    const seatLedger = {
      linesOfSubscription: jest.fn().mockResolvedValue([
        { id: 'line-std', planId: 'plan-std', closedReason: null, closedOn: null, monthlyUnitPriceMinor: 500000n },
        { id: 'line-prm', planId: 'plan-prm', closedReason: null, closedOn: null, monthlyUnitPriceMinor: 2500000n },
      ]),
      seatsOnDays: jest.fn().mockResolvedValue(
        new Map([
          ['line-std', new Map([['2027-06-30', 12]])],
          ['line-prm', new Map([['2027-06-30', 2]])],
        ]),
      ),
    };
    const linesReader = {
      computeForPeriod: jest.fn().mockResolvedValue({
        lines: [
          {
            subscriptionLineId: 'line-std',
            planId: 'plan-std',
            seatsToday: 12,
            seatsAtDeadline: 12,
            minimumSeats: null,
            need: 11,
            target: 11,
          },
          {
            subscriptionLineId: 'line-prm',
            planId: 'plan-prm',
            seatsToday: 2,
            seatsAtDeadline: 2,
            minimumSeats: null,
            need: 2,
            target: 2,
          },
        ],
        shortfall: 0,
      }),
      servingLinesOn: jest.fn().mockResolvedValue([
        { id: 'line-std', planId: 'plan-std', closedReason: null, closedOn: null, monthlyUnitPriceMinor: 500000n },
        { id: 'line-prm', planId: 'plan-prm', closedReason: null, closedOn: null, monthlyUnitPriceMinor: 2500000n },
      ]),
      lockCutoffTargets: jest.fn().mockResolvedValue(true),
      persistProposalTargets: jest.fn().mockResolvedValue(undefined),
    };
    const outcomes = {
      recordIn: jest
        .fn()
        .mockResolvedValue({ recorded: { id: 'ren-auto-1' }, next: { subscriptionId: 'sub-2' }, carried: 11 }),
    };
    const notifier = { tell: jest.fn().mockResolvedValue(undefined) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const runner = { run: jest.fn((fn: (t: DbTx) => Promise<unknown>) => fn(tx)) } as unknown as TransactionRunner;

    const service = new SubscriptionRenewalAutoService(
      repo as unknown as SubscriptionRenewalRepo,
      periods as unknown as SubscriptionPeriodApi,
      seatLedger as unknown as SeatLedgerApi,
      linesReader as unknown as SubscriptionRenewalLinesFactsService,
      outcomes as unknown as RenewalOutcomeService,
      notifier as unknown as RenewalNotifier,
      audit as unknown as AuditApi,
      runner,
    );

    return { tx, service, repo, periods, seatLedger, linesReader, outcomes, notifier, audit };
  }

  it('locks line targets as SYSTEM with recordedQuantity=null once deadline has passed', async () => {
    const { tx, service, linesReader } = setup();
    const locked = await service.lockCutoffIfDue({
      period: makePeriod(),
      adjustment: ADJUSTMENT,
      today: '2027-06-02',
      now: new Date('2027-06-02T01:00:00Z'),
    });

    expect(locked).toBe(true);
    expect(linesReader.lockCutoffTargets).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ subscriptionId: 'sub-1' }),
      '2027-07-01',
      '2027-06-02',
      expect.any(Date),
    );
  });

  it('Ca B (autoRenew=true): creates SYSTEM/UNCONFIRMED case, calls RenewalOutcomeService with seats(L, renewalOn-1), and records AUTO_RENEWAL_INCIDENT', async () => {
    const { tx, service, repo, linesReader, outcomes, notifier } = setup();
    const recorded = await service.handlePassedRenewalDay({
      organizationId: 'org-1',
      today: '2027-07-02',
      period: makePeriod({ autoRenew: true }),
      adjustment: ADJUSTMENT,
      kind: 'AUTO_RENEWAL_INCIDENT',
      people: PEOPLE,
      now: new Date('2027-07-02T01:00:00Z'),
    });

    expect(recorded).toBe(true);
    expect(repo.recordDecision).toHaveBeenCalledWith(
      tx,
      'ren-auto-1',
      expect.objectContaining({ deciderRole: 'SYSTEM', choice: 'RENEW', quantity: 14 }),
    );
    expect(linesReader.persistProposalTargets).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        renewalOn: '2027-07-01',
        renewalId: 'ren-auto-1',
        lockedBy: 'SYSTEM',
        autoRecorded: true,
        decisions: [
          expect.objectContaining({ subscriptionLineId: 'line-std', recordedQuantity: 12 }),
          expect.objectContaining({ subscriptionLineId: 'line-prm', recordedQuantity: 2 }),
        ],
      }),
    );
    expect(outcomes.recordIn).toHaveBeenCalledTimes(1);
    const call = outcomes.recordIn.mock.calls[0] as unknown[];
    expect(call[1]).toEqual({ kind: 'SYSTEM', correlationId: 'auto-renewal:ren-auto-1' });
    expect(call[3]).toMatchObject({
      outcome: 'UNCONFIRMED',
      nextPeriod: {
        startDate: '2027-07-01',
        endDate: '2028-06-30',
        renewalDate: '2028-07-01',
        renewalId: 'ren-auto-1',
        autoRecorded: true,
        lines: [
          { subscriptionLineId: 'line-std', quantity: 12 },
          { subscriptionLineId: 'line-prm', quantity: 2 },
        ],
      },
    });
    expect(call[5]).toMatchObject({ endingBy: '2027-07-01' });
    expect(repo.insertDeadlineEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ kind: 'AUTO_RENEWAL_INCIDENT', noticeBaseDate: '2027-07-01' }),
    );
    expect(notifier.tell).toHaveBeenCalledWith(tx, {
      organizationId: 'org-1',
      recipients: ['it-1', 'fin-1', 'ceo-1'],
      code: 'SUBSCRIPTION_AUTO_RENEWAL_INCIDENT',
      subject: { type: 'SUBSCRIPTION', id: 'sub-1' },
      params: { subscriptionId: 'sub-1', baseDate: '2027-07-01', renewalId: 'ren-auto-1' },
      eventKey: 'subscription-incident:sub-1:2027-07-01',
    });
  });

  it('Ca C (autoRenew=false): records EXPIRY_MARKED, closes lines ENDED on endDate, and creates no renewal case', async () => {
    const { tx, service, repo, periods, outcomes } = setup();
    periods.lockPeriod.mockResolvedValue(makePeriod({ autoRenew: false }));

    const recorded = await service.handlePassedRenewalDay({
      organizationId: 'org-1',
      today: '2027-07-02',
      period: makePeriod({ autoRenew: false }),
      adjustment: ADJUSTMENT,
      kind: 'EXPIRY_MARKED',
      people: PEOPLE,
      now: new Date('2027-07-02T01:00:00Z'),
    });

    expect(recorded).toBe(true);
    expect(repo.insert).not.toHaveBeenCalled();
    expect(outcomes.recordIn).not.toHaveBeenCalled();
    expect(repo.insertDeadlineEvent).toHaveBeenCalledWith(tx, expect.objectContaining({ kind: 'EXPIRY_MARKED' }));
    expect(periods.closeExpiredLines).toHaveBeenCalledWith(tx, 'sub-1', '2027-06-30');
  });

  it('F-11: when endDate is null and renewalDate is 2027-07-01, closes lines ENDED on 2027-06-30', async () => {
    const { tx, service, periods } = setup();
    const noEnd = makePeriod({ autoRenew: false, endDate: null, renewalDate: '2027-07-01' });
    periods.lockPeriod.mockResolvedValue(noEnd);

    const recorded = await service.handlePassedRenewalDay({
      organizationId: 'org-1',
      today: '2027-07-02',
      period: noEnd,
      adjustment: ADJUSTMENT,
      kind: 'EXPIRY_MARKED',
      people: PEOPLE,
      now: new Date('2027-07-02T01:00:00Z'),
    });

    expect(recorded).toBe(true);
    expect(periods.closeExpiredLines).toHaveBeenCalledWith(tx, 'sub-1', '2027-06-30');
  });

  it('2-instance guard: returns false without writing when locked period already has renewedById', async () => {
    const { service, periods, repo, outcomes } = setup();
    periods.lockPeriod.mockResolvedValue(makePeriod({ renewedById: 'sub-2' }));

    const recorded = await service.handlePassedRenewalDay({
      organizationId: 'org-1',
      today: '2027-07-02',
      period: makePeriod({ autoRenew: true }),
      adjustment: ADJUSTMENT,
      kind: 'AUTO_RENEWAL_INCIDENT',
      people: PEOPLE,
    });

    expect(recorded).toBe(false);
    expect(repo.insert).not.toHaveBeenCalled();
    expect(outcomes.recordIn).not.toHaveBeenCalled();
  });
});
