import type { PeriodAdjustment, RenewalPeriodFacts } from '../../catalog/public/subscription-period.types';
import type { SeatsNeededCounts } from './seats-needed/renewal-seats-needed.policy';
import { toAdjustmentWire } from './subscription-renewal.mapper';

const adjustment: PeriodAdjustment = {
  kind: 'PAYMENT_DATE',
  deadline: '2026-12-01',
  point: '2026-11-24',
  end: '2026-12-01',
  redAlertOn: null,
  commitment: 'MONTHLY',
};

const period = { subscriptionId: 'sub', purchasedQuantity: 10, vendorMinimumSeats: null } as RenewalPeriodFacts;

const counts = (extra: Partial<SeatsNeededCounts> = {}): SeatsNeededCounts => ({
  heldPastRenewal: 6,
  pendingContinuations: 1,
  approvedAwaitingGrant: 1,
  seatsNeeded: 8,
  vendorMinimumSeats: null,
  target: 8,
  activeSeatsToday: 7,
  openRequests: 1,
  ...extra,
});

const who = { responsibleItAdminEmployeeId: null, callerEmployeeId: 'caller', recordedRenewalId: null };

describe('the seats needed as the route reads them (SBF-20 §5)', () => {
  it('shows the point, the three parts of the count, the target and the choice it suggests', () => {
    expect(toAdjustmentWire(period, adjustment, counts(), who)).toEqual({
      subscriptionId: 'sub',
      commitment: 'MONTHLY',
      deadlineKind: 'PAYMENT_DATE',
      deadline: '2026-12-01',
      adjustmentPointOn: '2026-11-24',
      renewalOn: '2026-12-01',
      redAlertOn: null,
      purchasedQuantity: 10,
      vendorMinimumSeats: null,
      seatsNeeded: { total: 8, heldPastRenewal: 6, pendingContinuations: 1, approvedAwaitingGrant: 1 },
      target: 8,
      suggestedChoice: 'REDUCE',
      canCancel: false,
      activeSeatsToday: 7,
      openRequests: 1,
      responsibleItAdminEmployeeId: null,
      callerIsResponsible: false,
      recordedRenewalId: null,
    });
  });

  it('shows the target raised to the vendor minimum, apart from the need', () => {
    const wire = toAdjustmentWire(
      { ...period, vendorMinimumSeats: 10 },
      adjustment,
      counts({ vendorMinimumSeats: 10, target: 10 }),
      who,
    );

    expect(wire).toMatchObject({ vendorMinimumSeats: 10, target: 10, suggestedChoice: 'RENEW' });
    expect(wire.seatsNeeded.total).toBe(8);
  });

  it('allows a cancellation only when no seat is needed, none is in effect and no request is open', () => {
    const nothing = {
      heldPastRenewal: 0,
      pendingContinuations: 0,
      approvedAwaitingGrant: 0,
      seatsNeeded: 0,
      target: 0,
    };

    expect(
      toAdjustmentWire(period, adjustment, counts({ ...nothing, activeSeatsToday: 0, openRequests: 0 }), who),
    ).toMatchObject({
      canCancel: true,
      suggestedChoice: 'CANCEL',
    });
    expect(
      toAdjustmentWire(period, adjustment, counts({ ...nothing, activeSeatsToday: 2, openRequests: 0 }), who),
    ).toMatchObject({
      canCancel: false,
      suggestedChoice: 'CANCEL',
    });
    expect(
      toAdjustmentWire(period, adjustment, counts({ ...nothing, activeSeatsToday: 0, openRequests: 1 }), who),
    ).toMatchObject({
      canCancel: false,
    });
  });

  it('tells whether the caller is the IT Admin responsible, and the case that already stands for the period', () => {
    const own = toAdjustmentWire(period, adjustment, counts(), {
      responsibleItAdminEmployeeId: 'caller',
      callerEmployeeId: 'caller',
      recordedRenewalId: 'case',
    });
    const other = toAdjustmentWire(period, adjustment, counts(), {
      responsibleItAdminEmployeeId: 'someone',
      callerEmployeeId: 'caller',
      recordedRenewalId: null,
    });

    expect(own).toMatchObject({
      responsibleItAdminEmployeeId: 'caller',
      callerIsResponsible: true,
      recordedRenewalId: 'case',
    });
    expect(other).toMatchObject({ responsibleItAdminEmployeeId: 'someone', callerIsResponsible: false });
  });

  it('keeps the red alert day of a plan by the year and the seats bought that are not known', () => {
    const wire = toAdjustmentWire(
      { ...period, purchasedQuantity: null },
      { ...adjustment, kind: 'NOTICE_DEADLINE', commitment: 'ANNUAL', redAlertOn: '2026-11-28' },
      counts(),
      who,
    );

    expect(wire).toMatchObject({
      commitment: 'ANNUAL',
      deadlineKind: 'NOTICE_DEADLINE',
      redAlertOn: '2026-11-28',
      purchasedQuantity: null,
      suggestedChoice: null,
    });
  });
});
