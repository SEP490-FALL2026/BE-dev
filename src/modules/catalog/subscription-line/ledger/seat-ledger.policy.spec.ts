import type { BusinessDate } from '../../../../core/business-date';
import { SeatLedgerBelowOccupancyError } from '../subscription-line.errors';
import { SeatLedgerEffectiveInClosedMonthError, SeatLedgerInvalidEntryError } from './seat-ledger.errors';
import { toSeatLedgerApiException } from './seat-ledger.http-errors';
import {
  assertManualEffectiveOn,
  buildSeatChangeForDoor,
  computeSeatsOnDays,
  seatPurchaseInvoiceDue,
  type SeatPurchaseInvoiceDueInput,
} from './seat-ledger.policy';

describe('seat-ledger policy — effectiveOn closed month guard (B2-R15)', () => {
  it('rejects 2026-11-28 when recorded on 2026-12-02 with 422 SEAT_LEDGER.EFFECTIVE_IN_CLOSED_MONTH and earliestOn 2026-12-01', () => {
    let caught: unknown;
    try {
      assertManualEffectiveOn('2026-11-28', '2026-12-02');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SeatLedgerEffectiveInClosedMonthError);
    expect((caught as SeatLedgerEffectiveInClosedMonthError).earliestOn).toBe('2026-12-01');

    const apiError = toSeatLedgerApiException(caught) as {
      getStatus: () => number;
      getResponse: () => unknown;
    };
    expect(apiError.getStatus()).toBe(422);
    expect(apiError.getResponse()).toMatchObject({
      code: 'SEAT_LEDGER.EFFECTIVE_IN_CLOSED_MONTH',
      details: { earliestOn: '2026-12-01' },
    });
  });

  it('rejects 2026-11-30 (day before month start) and allows boundary 2026-12-01 on 2026-12-02', () => {
    expect(() => assertManualEffectiveOn('2026-11-30', '2026-12-02')).toThrow(SeatLedgerEffectiveInClosedMonthError);
    expect(() => assertManualEffectiveOn('2026-12-01', '2026-12-02')).not.toThrow();
    expect(() => assertManualEffectiveOn('2026-12-02', '2026-12-02')).not.toThrow();
  });

  it('maps SeatLedgerBelowOccupancyError to 409 SEAT_LEDGER.BELOW_OCCUPANCY', () => {
    const apiError = toSeatLedgerApiException(new SeatLedgerBelowOccupancyError()) as {
      getStatus: () => number;
      getResponse: () => unknown;
    };
    expect(apiError.getStatus()).toBe(409);
    expect(apiError.getResponse()).toMatchObject({ code: 'SEAT_LEDGER.BELOW_OCCUPANCY' });
  });
});

describe('seat-ledger policy — invoice due calculation', () => {
  it.each<{
    label: string;
    input: SeatPurchaseInvoiceDueInput;
    expectedObligation: 'WORKING_DAYS' | 'NONE' | 'LATE_INVOICE';
    expectedDueOn: BusinessDate | null;
  }>([
    {
      label: 'Saturday 21/11/2026 normal -> 5th working day 27/11/2026 (Mon 23/11 is day 1)',
      input: {
        purchasedOn: '2026-11-21',
        billingCycle: 'ANNUAL',
        invoicedLater: false,
        workingDays: 5,
        lateInvoiceDays: 95,
        nonWorkingDates: new Set(),
      },
      expectedObligation: 'WORKING_DAYS',
      expectedDueOn: '2026-11-27',
    },
    {
      label: 'Saturday 21/11/2026 invoicedLater + ANNUAL -> +95 days = 24/02/2027',
      input: {
        purchasedOn: '2026-11-21',
        billingCycle: 'ANNUAL',
        invoicedLater: true,
        workingDays: 5,
        lateInvoiceDays: 95,
        nonWorkingDates: new Set(),
      },
      expectedObligation: 'LATE_INVOICE',
      expectedDueOn: '2027-02-24',
    },
    {
      label: 'Saturday 21/11/2026 invoicedLater + MONTHLY -> NONE',
      input: {
        purchasedOn: '2026-11-21',
        billingCycle: 'MONTHLY',
        invoicedLater: true,
        workingDays: 5,
        lateInvoiceDays: 95,
        nonWorkingDates: new Set(),
      },
      expectedObligation: 'NONE',
      expectedDueOn: null,
    },
    {
      label: 'Q-B Thursday 01/07/2027 normal -> 5th working day 07/07/2027',
      input: {
        purchasedOn: '2027-07-01',
        billingCycle: 'ANNUAL',
        invoicedLater: false,
        workingDays: 5,
        lateInvoiceDays: 95,
        nonWorkingDates: new Set(),
      },
      expectedObligation: 'WORKING_DAYS',
      expectedDueOn: '2027-07-07',
    },
    {
      label: 'skips public holiday when counting 5 working days',
      input: {
        purchasedOn: '2027-07-01',
        billingCycle: 'MONTHLY',
        invoicedLater: false,
        workingDays: 5,
        lateInvoiceDays: 95,
        nonWorkingDates: new Set(['2027-07-05']),
      },
      expectedObligation: 'WORKING_DAYS',
      expectedDueOn: '2027-07-08',
    },
  ])('$label', ({ input, expectedObligation, expectedDueOn }) => {
    expect(seatPurchaseInvoiceDue(input)).toEqual({
      invoiceObligation: expectedObligation,
      invoiceDueOn: expectedDueOn,
    });
  });
});

describe('seat-ledger policy — 4 doors validation', () => {
  const base = {
    organizationId: 'org-1',
    subscriptionLineId: 'line-1',
    effectiveOn: '2026-11-21' as BusinessDate,
    recordedByEmployeeId: 'emp-it',
  };

  it('builds ADJUSTMENT for INITIAL and RENEWAL and rejects invalid reason/purchase', () => {
    expect(
      buildSeatChangeForDoor({
        ...base,
        source: 'ADJUSTMENT',
        reason: 'INITIAL',
        delta: 10,
      }),
    ).toMatchObject({ source: 'ADJUSTMENT', reason: 'INITIAL', delta: 10, basis: 'NONE', seatPurchaseId: null });

    expect(
      buildSeatChangeForDoor({
        ...base,
        source: 'ADJUSTMENT',
        reason: 'RENEWAL',
        delta: 11,
        renewalId: 'ren-1',
      }),
    ).toMatchObject({ source: 'ADJUSTMENT', reason: 'RENEWAL', delta: 11, renewalId: 'ren-1' });

    expect(() =>
      buildSeatChangeForDoor({
        ...base,
        source: 'ADJUSTMENT',
        reason: 'TOP_UP' as never,
        delta: 1,
      }),
    ).toThrow(SeatLedgerInvalidEntryError);
  });

  it('builds GRANT for TOP_UP +1 with request item and seatPurchaseId', () => {
    expect(
      buildSeatChangeForDoor({
        ...base,
        source: 'GRANT',
        requestId: 'req-1',
        beneficiaryEmployeeId: 'emp-1',
        seatPurchaseId: 'pur-1',
      }),
    ).toMatchObject({
      source: 'GRANT',
      reason: 'TOP_UP',
      delta: 1,
      basis: 'REQUEST_ITEM',
      requestId: 'req-1',
      beneficiaryEmployeeId: 'emp-1',
      seatPurchaseId: 'pur-1',
    });

    expect(() =>
      buildSeatChangeForDoor({
        ...base,
        source: 'GRANT',
        requestId: 'req-1',
        beneficiaryEmployeeId: 'emp-1',
        seatPurchaseId: '',
      }),
    ).toThrow(SeatLedgerInvalidEntryError);
  });

  it('builds VENDOR_RECORD with trimmed non-empty note and enforces tier/refund rules', () => {
    expect(
      buildSeatChangeForDoor({
        ...base,
        source: 'VENDOR_RECORD',
        delta: -2,
        note: '  vendor reduced 2 seats  ',
        refundedSeatChangeId: 'chg-1',
      }),
    ).toMatchObject({
      source: 'VENDOR_RECORD',
      reason: 'REDUCE',
      delta: -2,
      note: 'vendor reduced 2 seats',
      refundedSeatChangeId: 'chg-1',
    });

    expect(() =>
      buildSeatChangeForDoor({
        ...base,
        source: 'VENDOR_RECORD',
        delta: 1,
        note: '   ',
      }),
    ).toThrow(SeatLedgerInvalidEntryError);

    expect(() =>
      buildSeatChangeForDoor({
        ...base,
        source: 'VENDOR_RECORD',
        delta: 0,
        note: 'ok',
      }),
    ).toThrow(SeatLedgerInvalidEntryError);
  });

  it('builds MEMBER for +1 and -1 only', () => {
    expect(buildSeatChangeForDoor({ ...base, source: 'MEMBER', delta: 1 })).toMatchObject({
      source: 'MEMBER',
      reason: 'TOP_UP',
      delta: 1,
      basis: 'NONE',
    });
    expect(buildSeatChangeForDoor({ ...base, source: 'MEMBER', delta: -1 })).toMatchObject({
      source: 'MEMBER',
      reason: 'REDUCE',
      delta: -1,
      basis: 'NONE',
    });
    expect(() => buildSeatChangeForDoor({ ...base, source: 'MEMBER', delta: 2 as never })).toThrow(
      SeatLedgerInvalidEntryError,
    );
  });
});

describe('seat-ledger policy — Table 1A (SPEC-B3:307-313) via computeSeatsOnDays', () => {
  const oldLine = {
    id: 'line-2026',
    ledgerOpenedOn: '2026-07-01' as BusinessDate,
    fallbackQuantity: 10,
  };
  const oldChanges = [
    { effectiveOn: '2026-07-01' as BusinessDate, delta: 10 },
    { effectiveOn: '2026-11-21' as BusinessDate, delta: 1 },
    { effectiveOn: '2026-11-21' as BusinessDate, delta: 1 },
  ];
  const nextLine = {
    id: 'line-2027',
    ledgerOpenedOn: '2027-07-01' as BusinessDate,
    fallbackQuantity: 11,
  };
  const nextChanges = [
    { effectiveOn: '2027-07-01' as BusinessDate, delta: 11 },
    { effectiveOn: '2027-07-01' as BusinessDate, delta: 1 },
  ];

  it.each<{ day: BusinessDate; line: typeof oldLine; changes: typeof oldChanges; expected: number }>([
    { day: '2026-07-01', line: oldLine, changes: oldChanges, expected: 10 },
    { day: '2026-11-20', line: oldLine, changes: oldChanges, expected: 10 },
    { day: '2026-11-21', line: oldLine, changes: oldChanges, expected: 12 },
    { day: '2027-06-20', line: oldLine, changes: oldChanges, expected: 12 },
    { day: '2027-07-01', line: nextLine, changes: nextChanges, expected: 12 },
  ])('on $day line $line.id serves $expected seats', ({ day, line, changes, expected }) => {
    const result = computeSeatsOnDays(line, changes, day, day);
    expect(result.get(day)).toBe(expected);
  });

  it('uses fallbackQuantity before ledgerOpenedOn or when ledgerOpenedOn is null', () => {
    const backfilled = {
      id: 'line-bf',
      ledgerOpenedOn: '2026-11-25' as BusinessDate,
      fallbackQuantity: 8,
    };
    const bfChanges = [{ effectiveOn: '2026-11-25' as BusinessDate, delta: 8 }];
    const map = computeSeatsOnDays(backfilled, bfChanges, '2026-11-24', '2026-11-26');
    expect(map.get('2026-11-24')).toBe(8);
    expect(map.get('2026-11-25')).toBe(8);
    expect(map.get('2026-11-26')).toBe(8);

    const noLedger = { id: 'line-old', ledgerOpenedOn: null, fallbackQuantity: 5 };
    expect(computeSeatsOnDays(noLedger, [], '2026-11-21', '2026-11-21').get('2026-11-21')).toBe(5);
  });
});
