import { SeatLedgerEffectiveInClosedMonthError } from '../subscription-line.errors';
import {
  SeatPurchaseBeforePeriodError,
  SeatPurchaseConflictingModeError,
  SeatPurchaseInFutureError,
  SeatPurchaseLineNotPurchasableError,
  SeatPurchaseReplacementOneItemError,
  SeatPurchaseStockAvailableError,
  SeatPurchaseTierStepOneItemError,
} from './seat-purchase.errors';
import {
  assertLinePurchasableForPurchase,
  assertPurchaseDateWithinBounds,
  assertPurchaseModeValid,
  assertStockAllowsSeatPurchase,
  isSeatPurchaseInvoiceOverdue,
  seatPurchaseExpectedAmount,
  seatPurchaseNetExpectedAmount,
  seatPurchaseRecipients,
} from './seat-purchase.policy';

describe('seat-purchase.policy (W3-18)', () => {
  const baseLine = {
    id: 'line-1',
    organizationId: 'org-1',
    subscriptionId: 'sub-1',
    workspaceId: 'ws-1',
    planId: 'plan-1',
    monthlyUnitPriceMinor: 500_000n,
    minimumSeats: null,
    ledgerOpenedOn: '2026-07-01',
    renewedFromLineId: null,
    closedOn: null,
    closedReason: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  };

  const basePeriod = {
    status: 'ACTIVE' as const,
    seatCounting: 'FIXED' as const,
    startDate: '2026-07-01',
    endDate: '2027-06-30',
  };

  describe('assertLinePurchasableForPurchase', () => {
    it.each([
      {
        name: 'period DRAFT -> PERIOD_NOT_ACTIVE',
        period: { ...basePeriod, status: 'DRAFT' as const },
        line: baseLine,
        provisioningType: 'K2' as const,
        purchasedOn: '2026-11-21',
        reason: 'PERIOD_NOT_ACTIVE',
      },
      {
        name: 'seatCounting MEMBERS -> NOT_FIXED_SEAT_COUNTING',
        period: { ...basePeriod, seatCounting: 'MEMBERS' as const },
        line: baseLine,
        provisioningType: 'K2' as const,
        purchasedOn: '2026-11-21',
        reason: 'NOT_FIXED_SEAT_COUNTING',
      },
      {
        name: 'plan K1 -> NOT_K2',
        period: basePeriod,
        line: baseLine,
        provisioningType: 'K1' as const,
        purchasedOn: '2026-11-21',
        reason: 'NOT_K2',
      },
      {
        name: 'line closed REMOVED -> NOT_SERVING_ON_DATE',
        period: basePeriod,
        line: { ...baseLine, closedReason: 'REMOVED' as const, closedOn: '2026-11-20' },
        provisioningType: 'K2' as const,
        purchasedOn: '2026-11-21',
        reason: 'NOT_SERVING_ON_DATE',
      },
      {
        name: 'line closed RENEWED before purchasedOn -> NOT_SERVING_ON_DATE',
        period: basePeriod,
        line: { ...baseLine, closedReason: 'RENEWED' as const, closedOn: '2026-11-20' },
        provisioningType: 'K2' as const,
        purchasedOn: '2026-11-21',
        reason: 'NOT_SERVING_ON_DATE',
      },
      {
        name: 'purchasedOn after period.endDate -> NOT_SERVING_ON_DATE',
        period: { ...basePeriod, endDate: '2026-11-20' },
        line: baseLine,
        provisioningType: 'K2' as const,
        purchasedOn: '2026-11-21',
        reason: 'NOT_SERVING_ON_DATE',
      },
    ])('refuses $name', ({ period, line, provisioningType, purchasedOn, reason }) => {
      let caught: unknown;
      try {
        assertLinePurchasableForPurchase({ line, period, provisioningType, purchasedOn });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(SeatPurchaseLineNotPurchasableError);
      expect((caught as SeatPurchaseLineNotPurchasableError).reason).toBe(reason);
    });

    it('accepts active FIXED K2 line serving on purchasedOn (including RENEWED line on closedOn itself)', () => {
      expect(() =>
        assertLinePurchasableForPurchase({
          line: { ...baseLine, closedReason: 'RENEWED', closedOn: '2026-11-21' },
          period: basePeriod,
          provisioningType: 'K2',
          purchasedOn: '2026-11-21',
        }),
      ).not.toThrow();
    });
  });

  describe('assertPurchaseDateWithinBounds', () => {
    it('allows purchasedOn within current business month up to today and >= period.startDate', () => {
      expect(() =>
        assertPurchaseDateWithinBounds({
          purchasedOn: '2026-11-21',
          today: '2026-11-21',
          periodStartDate: '2026-07-01',
        }),
      ).not.toThrow();
    });

    it('throws SeatPurchaseInFutureError when purchasedOn > today', () => {
      let caught: unknown;
      try {
        assertPurchaseDateWithinBounds({
          purchasedOn: '2026-11-22',
          today: '2026-11-21',
          periodStartDate: '2026-07-01',
        });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(SeatPurchaseInFutureError);
    });

    it('throws SeatPurchaseBeforePeriodError when purchasedOn < period.startDate', () => {
      let caught: unknown;
      try {
        assertPurchaseDateWithinBounds({
          purchasedOn: '2026-11-05',
          today: '2026-11-21',
          periodStartDate: '2026-11-10',
        });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(SeatPurchaseBeforePeriodError);
    });

    it('throws SeatLedgerEffectiveInClosedMonthError when purchasedOn < first day of today month', () => {
      let caught: unknown;
      try {
        assertPurchaseDateWithinBounds({
          purchasedOn: '2026-10-31',
          today: '2026-11-21',
          periodStartDate: '2026-07-01',
        });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(SeatLedgerEffectiveInClosedMonthError);
      expect((caught as SeatLedgerEffectiveInClosedMonthError).earliestOn).toBe('2026-11-01');
    });
  });

  describe('assertStockAllowsSeatPurchase (pending - free check)', () => {
    it.each([
      { pendingCount: 3, freeOnPurchasedOn: 0, requested: 3, allowed: true },
      { pendingCount: 3, freeOnPurchasedOn: 2, requested: 1, allowed: true },
      { pendingCount: 3, freeOnPurchasedOn: 2, requested: 2, allowed: false },
      { pendingCount: 3, freeOnPurchasedOn: 3, requested: 1, allowed: false },
    ])(
      'pending=$pendingCount free=$freeOnPurchasedOn requested=$requested -> allowed=$allowed',
      ({ pendingCount, freeOnPurchasedOn, requested, allowed }) => {
        if (allowed) {
          expect(() =>
            assertStockAllowsSeatPurchase({ requestedCount: requested, pendingCount, freeOnPurchasedOn }),
          ).not.toThrow();
        } else {
          let caught: unknown;
          try {
            assertStockAllowsSeatPurchase({ requestedCount: requested, pendingCount, freeOnPurchasedOn });
          } catch (e) {
            caught = e;
          }
          expect(caught).toBeInstanceOf(SeatPurchaseStockAvailableError);
          expect((caught as SeatPurchaseStockAvailableError).free).toBe(freeOnPurchasedOn);
        }
      },
    );
  });

  describe('seatPurchaseExpectedAmount (single rounding per purchase)', () => {
    it.each([
      {
        name: 'ANNUAL 2 seats on 2026-11-21 until 2027-07-01 -> 7,333,333 (not 7,333,334)',
        seats: 2,
        monthlyUnitPriceMinor: 500_000n,
        billingCycle: 'ANNUAL' as const,
        renewalDate: '2027-07-01',
        endDate: '2027-06-30',
        purchasedOn: '2026-11-21',
        expected: 7_333_333n,
      },
      {
        name: 'ANNUAL 1 seat on 2026-11-21 using endDate + 1 fallback -> 3,666,667',
        seats: 1,
        monthlyUnitPriceMinor: 500_000n,
        billingCycle: 'ANNUAL' as const,
        renewalDate: null,
        endDate: '2027-06-30',
        purchasedOn: '2026-11-21',
        expected: 3_666_667n,
      },
      {
        name: 'MONTHLY 1 seat on 2026-11-21 cycle 01 -> 166,667',
        seats: 1,
        monthlyUnitPriceMinor: 500_000n,
        billingCycle: 'MONTHLY' as const,
        renewalDate: '2026-12-01',
        endDate: '2027-06-30',
        purchasedOn: '2026-11-21',
        expected: 166_667n,
      },
      {
        name: 'QUARTERLY 1 seat on 2026-11-21 cycle 01/01 -> 666,667',
        seats: 1,
        monthlyUnitPriceMinor: 500_000n,
        billingCycle: 'QUARTERLY' as const,
        renewalDate: '2027-01-01',
        endDate: '2027-06-30',
        purchasedOn: '2026-11-21',
        expected: 666_667n,
      },
    ])('$name', ({ seats, monthlyUnitPriceMinor, billingCycle, renewalDate, endDate, purchasedOn, expected }) => {
      expect(
        seatPurchaseExpectedAmount({
          seats,
          monthlyUnitPriceMinor,
          billingCycle,
          renewalDate,
          endDate,
          purchasedOn,
        }),
      ).toBe(expected);
    });
  });

  describe('overdue boundary & R1 recipients', () => {
    it('considers invoiceDueOn strictly before today overdue (2026-11-27 false, 2026-11-28 true)', () => {
      expect(isSeatPurchaseInvoiceOverdue('2026-11-27', '2026-11-27')).toBe(false);
      expect(isSeatPurchaseInvoiceOverdue('2026-11-27', '2026-11-28')).toBe(true);
      expect(isSeatPurchaseInvoiceOverdue(null, '2026-11-28')).toBe(false);
    });

    it('picks R1 recipient (responsible IT admin if usable and not actor, else superAdmin if not actor)', () => {
      expect(
        seatPurchaseRecipients({
          responsible: 'it-1',
          responsibleUsable: true,
          superAdmin: 'sa-1',
          actor: 'it-2',
        }),
      ).toEqual(['it-1']);
      expect(
        seatPurchaseRecipients({
          responsible: 'it-1',
          responsibleUsable: true,
          superAdmin: 'sa-1',
          actor: 'it-1',
        }),
      ).toEqual([]);
      expect(
        seatPurchaseRecipients({
          responsible: 'it-1',
          responsibleUsable: false,
          superAdmin: 'sa-1',
          actor: 'it-2',
        }),
      ).toEqual(['sa-1']);
    });
  });

  describe('W3-19 tierStepSeats & replacesFromLineId', () => {
    it('validates mode exclusivity and single-item constraint', () => {
      expect(() =>
        assertPurchaseModeValid({
          itemCount: 1,
          tierStepSeats: 50,
          replacesFromLineId: 'line-old',
          targetLineId: 'line-new',
        }),
      ).toThrow(SeatPurchaseConflictingModeError);

      expect(() => assertPurchaseModeValid({ itemCount: 2, tierStepSeats: 50, targetLineId: 'line-new' })).toThrow(
        SeatPurchaseTierStepOneItemError,
      );

      expect(() =>
        assertPurchaseModeValid({ itemCount: 2, replacesFromLineId: 'line-old', targetLineId: 'line-new' }),
      ).toThrow(SeatPurchaseReplacementOneItemError);
    });

    it.each([
      {
        name: 'Ca 1 Zoom tier 50 on 2026-11-21 (50 x 150,000 x 22/3 = 55,000,000)',
        lines: [
          {
            seats: 50,
            monthlyUnitPriceMinor: 150_000n,
            billingCycle: 'ANNUAL' as const,
            renewalDate: '2027-07-01',
            endDate: '2027-06-30',
            purchasedOn: '2026-11-21',
          },
        ],
        expected: 55_000_000n,
      },
      {
        name: 'Ca 5 switch Standard 500,000 -> Premium 2,500,000 on 2026-11-21 rounds ONCE -> 14,666,667 (kills 14,666,666)',
        lines: [
          {
            seats: -1,
            monthlyUnitPriceMinor: 500_000n,
            billingCycle: 'ANNUAL' as const,
            renewalDate: '2027-07-01',
            endDate: '2027-06-30',
            purchasedOn: '2026-11-21',
          },
          {
            seats: 1,
            monthlyUnitPriceMinor: 2_500_000n,
            billingCycle: 'ANNUAL' as const,
            renewalDate: '2027-07-01',
            endDate: '2027-06-30',
            purchasedOn: '2026-11-21',
          },
        ],
        expected: 14_666_667n,
      },
    ])('$name', ({ lines, expected }) => {
      expect(seatPurchaseNetExpectedAmount(lines)).toBe(expected);
    });
  });
});
