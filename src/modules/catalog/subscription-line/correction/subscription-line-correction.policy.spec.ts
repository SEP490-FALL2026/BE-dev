import {
  SubscriptionLineClosedError,
  SubscriptionLineNotResponsibleError,
  SubscriptionLineStaleError,
} from '../subscription-line.errors';
import {
  SeatLedgerInvalidRefundTargetError,
  SeatLedgerMidTermReductionNotAllowedError,
  SeatLedgerReductionExceedsPurchaseError,
} from './subscription-line-correction.errors';
import { toSeatCorrectionApiException } from './subscription-line-correction.http-errors';
import {
  assertLineCorrectable,
  assertMidTermReductionAllowed,
  assertRefundReductionWithinPurchase,
  judgeVendorCorrection,
  vendorCorrectionRecipients,
} from './subscription-line-correction.policy';

const expectCorrectionError = (run: () => unknown, ErrorClass: new (...args: never[]) => Error, code: string) => {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ErrorClass);
  expect((toSeatCorrectionApiException(caught) as { getResponse?: () => unknown }).getResponse?.()).toMatchObject({
    code,
  });
};

describe('subscription-line-correction.policy (W3-19)', () => {
  const updatedAt = new Date('2026-11-20T00:00:00.000Z');

  describe('assertLineCorrectable', () => {
    it('rejects non-responsible IT Admin with SubscriptionLineNotResponsibleError (Ca 8)', () => {
      expectCorrectionError(
        () =>
          assertLineCorrectable({
            responsibleItAdminEmployeeId: 'it-resp',
            actorEmployeeId: 'it-nam',
            closedReason: null,
            ledgerOpenedOn: '2026-11-01',
            periodStatus: 'ACTIVE',
            lineUpdatedAt: updatedAt,
            expectedUpdatedAt: updatedAt,
          }),
        SubscriptionLineNotResponsibleError,
        'SUBSCRIPTION_LINE.NOT_RESPONSIBLE',
      );
    });

    it('rejects closed or unopened lines with SubscriptionLineClosedError', () => {
      expectCorrectionError(
        () =>
          assertLineCorrectable({
            responsibleItAdminEmployeeId: 'it-resp',
            actorEmployeeId: 'it-resp',
            closedReason: 'RENEWED',
            ledgerOpenedOn: '2026-11-01',
            periodStatus: 'ACTIVE',
            lineUpdatedAt: updatedAt,
            expectedUpdatedAt: updatedAt,
          }),
        SubscriptionLineClosedError,
        'SUBSCRIPTION_LINE.CLOSED',
      );

      expectCorrectionError(
        () =>
          assertLineCorrectable({
            responsibleItAdminEmployeeId: 'it-resp',
            actorEmployeeId: 'it-resp',
            closedReason: null,
            ledgerOpenedOn: null,
            periodStatus: 'DRAFT',
            lineUpdatedAt: updatedAt,
            expectedUpdatedAt: updatedAt,
          }),
        SubscriptionLineClosedError,
        'SUBSCRIPTION_LINE.CLOSED',
      );
    });

    it('rejects stale expectedUpdatedAt with SubscriptionLineStaleError', () => {
      expectCorrectionError(
        () =>
          assertLineCorrectable({
            responsibleItAdminEmployeeId: 'it-resp',
            actorEmployeeId: 'it-resp',
            closedReason: null,
            ledgerOpenedOn: '2026-11-01',
            periodStatus: 'ACTIVE',
            lineUpdatedAt: updatedAt,
            expectedUpdatedAt: new Date('2026-11-19T00:00:00.000Z'),
          }),
        SubscriptionLineStaleError,
        'SUBSCRIPTION_LINE.STALE',
      );
    });
  });

  describe('judgeVendorCorrection & recipients (Ca 2 & MEMBERS)', () => {
    it.each([
      {
        name: 'FIXED delta > 0 without basis -> outOfProcess, Finance + R1',
        delta: 1,
        seatCounting: 'FIXED' as const,
        hasBasis: false,
        expected: { reason: 'TOP_UP', outOfProcess: true, notifyFinance: true, notifyR1: true },
      },
      {
        name: 'FIXED delta > 0 with basis -> not outOfProcess',
        delta: 1,
        seatCounting: 'FIXED' as const,
        hasBasis: true,
        expected: { reason: 'TOP_UP', outOfProcess: false, notifyFinance: false, notifyR1: false },
      },
      {
        name: 'MEMBERS delta > 0 without basis -> reconciliation, NOT outOfProcess',
        delta: 1,
        seatCounting: 'MEMBERS' as const,
        hasBasis: false,
        expected: { reason: 'TOP_UP', outOfProcess: false, notifyFinance: false, notifyR1: false },
      },
      {
        name: 'delta < 0 without commitmentTermMonths -> REDUCE, not outOfProcess, notify Finance only',
        delta: -2,
        seatCounting: 'FIXED' as const,
        hasBasis: false,
        expected: { reason: 'REDUCE', outOfProcess: false, notifyFinance: true, notifyR1: false },
      },
      {
        name: 'F-14: delta < 0 on 12-month without allowsMidTermReduction -> outOfProcess, notify Finance',
        delta: -1,
        seatCounting: 'FIXED' as const,
        hasBasis: false,
        commitmentTermMonths: 12,
        allowsMidTermReduction: false,
        expected: { reason: 'REDUCE', outOfProcess: true, notifyFinance: true, notifyR1: false },
      },
      {
        name: 'F-14: delta < 0 on 12-month with allowsMidTermReduction=true -> not outOfProcess',
        delta: -1,
        seatCounting: 'FIXED' as const,
        hasBasis: false,
        commitmentTermMonths: 12,
        allowsMidTermReduction: true,
        expected: { reason: 'REDUCE', outOfProcess: false, notifyFinance: true, notifyR1: false },
      },
    ])('$name', ({ delta, seatCounting, hasBasis, commitmentTermMonths, allowsMidTermReduction, expected }) => {
      expect(
        judgeVendorCorrection({ delta, seatCounting, hasBasis, commitmentTermMonths, allowsMidTermReduction }),
      ).toEqual(expected);
    });

    it('deduplicates Finance + R1 recipients and excludes actor', () => {
      expect(
        vendorCorrectionRecipients({
          notifyFinance: true,
          notifyR1: true,
          responsible: 'it-1',
          responsibleUsable: true,
          superAdmin: 'sa-1',
          finance: 'fin-1',
          actor: 'it-1',
        }),
      ).toEqual(['fin-1']);

      expect(
        vendorCorrectionRecipients({
          notifyFinance: true,
          notifyR1: true,
          responsible: 'it-1',
          responsibleUsable: false,
          superAdmin: 'sa-1',
          finance: 'fin-1',
          actor: 'it-2',
        }),
      ).toEqual(['sa-1', 'fin-1']);
    });
  });

  describe('mid-term seat reduction (Ca 3 & Ca 4)', () => {
    it('throws SeatLedgerMidTermReductionNotAllowedError when allowsMidTermReduction is false (Ca 4)', () => {
      expectCorrectionError(
        () => assertMidTermReductionAllowed({ allowsMidTermReduction: false }),
        SeatLedgerMidTermReductionNotAllowedError,
        'SEAT_LEDGER.MID_TERM_REDUCTION_NOT_ALLOWED',
      );
      expect(() => assertMidTermReductionAllowed({ allowsMidTermReduction: true })).not.toThrow();
    });

    it('enforces same-line positive purchase target and boundary 1 + 2 <= 3 vs 1 + 3 > 3 (Ca 3)', () => {
      expectCorrectionError(
        () =>
          assertRefundReductionWithinPurchase({
            lineId: 'line-1',
            refundedChange: { subscriptionLineId: 'line-other', reason: 'TOP_UP', delta: 3 },
            alreadyReduced: 0,
            requestedQuantity: 1,
          }),
        SeatLedgerInvalidRefundTargetError,
        'VALIDATION_ERROR',
      );

      expectCorrectionError(
        () =>
          assertRefundReductionWithinPurchase({
            lineId: 'line-1',
            refundedChange: { subscriptionLineId: 'line-1', reason: 'REDUCE', delta: -1 },
            alreadyReduced: 0,
            requestedQuantity: 1,
          }),
        SeatLedgerInvalidRefundTargetError,
        'VALIDATION_ERROR',
      );

      expectCorrectionError(
        () =>
          assertRefundReductionWithinPurchase({
            lineId: 'line-1',
            refundedChange: { subscriptionLineId: 'line-1', reason: 'TOP_UP', delta: 3 },
            alreadyReduced: 1,
            requestedQuantity: 3,
          }),
        SeatLedgerReductionExceedsPurchaseError,
        'SEAT_LEDGER.REDUCTION_EXCEEDS_PURCHASE',
      );

      expect(() =>
        assertRefundReductionWithinPurchase({
          lineId: 'line-1',
          refundedChange: { subscriptionLineId: 'line-1', reason: 'TOP_UP', delta: 3 },
          alreadyReduced: 1,
          requestedQuantity: 2,
        }),
      ).not.toThrow();
    });
  });
});
