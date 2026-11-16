import { judgeAdjustment, shapeRefusalOf, unallocatedOf } from './budget-adjustment.policy';
import type { AdjustmentKind, CostCenterPosition } from './budget-adjustment.types';

const M = 1_000_000n;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

/** T-AD1: the Cost Center of Hành chính, base 180 tr, reserve 18 tr, 80 tr spent and 30 tr held (110 tr used, 88 tr left of the 198 tr), a forecast of the end of the year of 110 tr. */
const admin: CostCenterPosition = {
  baseMinor: 180n * M,
  reserveMinor: 18n * M,
  usedMinor: 110n * M,
  forecastMinor: 110n * M,
};
const judge = (kind: AdjustmentKind, amountTr: bigint, extra: Partial<Parameters<typeof judgeAdjustment>[0]> = {}) =>
  judgeAdjustment({
    shape: {
      kind,
      amountMinor: amountTr * M,
      fromCostCenterId: kind === 'TRANSFER' || kind === 'RETURN' ? A : null,
      toCostCenterId: kind === 'TRANSFER' || kind === 'SUPPLEMENT' ? B : null,
      transferReason: null,
    },
    unallocatedMinor: 29n * M,
    from: admin,
    ...extra,
  });

describe('the part of the annual ceiling that nobody has been given (T-AD1)', () => {
  it('is the ceiling less the reserve of the shared pool less what the Cost Centers hold: 1.800 - 1.771 = 29 tr', () => {
    expect(
      unallocatedOf({ annualCeilingMinor: 1800n * M, sharedPoolReserveMinor: 0n, allocatedMinor: 1771n * M }),
    ).toBe(29n * M);
    expect(
      unallocatedOf({ annualCeilingMinor: 1800n * M, sharedPoolReserveMinor: 100n * M, allocatedMinor: 1600n * M }),
    ).toBe(100n * M);
  });

  it('reads no reserve as none, and is never below nothing', () => {
    expect(unallocatedOf({ annualCeilingMinor: 100n, sharedPoolReserveMinor: null, allocatedMinor: 40n })).toBe(60n);
    expect(unallocatedOf({ annualCeilingMinor: 100n, sharedPoolReserveMinor: 10n, allocatedMinor: 200n })).toBe(0n);
  });
});

describe('a supplement and a reduction of the ceiling take from what is not allocated (R-36, C-1)', () => {
  it('a supplement of 20 tr passes and one of 30 tr is over what is left, 29 tr', () => {
    expect(judge('SUPPLEMENT', 20n, { from: null }).kind).toBe('OK');
    expect(judge('SUPPLEMENT', 30n, { from: null })).toEqual({
      kind: 'OVER_UNALLOCATED',
      availableMinor: 29n * M,
      overByMinor: 1n * M,
    });
  });

  it('a reduction of the ceiling of 30 tr is over what is left and one of exactly 29 tr passes', () => {
    expect(judge('CEILING_REDUCTION', 30n, { from: null }).kind).toBe('OVER_UNALLOCATED');
    expect(judge('CEILING_REDUCTION', 29n, { from: null }).kind).toBe('OK');
  });
});

describe('a return and the source of a transfer keep the forecast of the end of the year (R-40)', () => {
  it('moves 20 tr from Hành chính: 160 + 18 = 178 tr is not below the forecast of 110 tr (the old 80 + 110 = 190 tr refused it wrongly)', () => {
    expect(judge('TRANSFER', 20n).kind).toBe('OK');
    expect(judge('RETURN', 20n).kind).toBe('OK');
  });

  it('refuses 90 tr: 90 + 18 = 108 tr is below the forecast of 110 tr, and says by how much', () => {
    for (const kind of ['TRANSFER', 'RETURN'] as const) {
      expect(judge(kind, 90n)).toEqual({
        kind: 'BELOW_FORECAST_FLOOR',
        costCenterId: A,
        floorMinor: 110n * M,
        afterMinor: 108n * M,
      });
    }
  });

  it('keeps the edge: 88 tr leaves exactly 110 tr and passes, 89 tr leaves 109 tr and does not', () => {
    expect(judge('TRANSFER', 88n).kind).toBe('OK');
    expect(judge('TRANSFER', 89n).kind).toBe('BELOW_FORECAST_FLOOR');
  });

  it('a Cost Center with no budget has nothing to give', () => {
    expect(judge('TRANSFER', 1n, { from: null })).toEqual({ kind: 'NO_BUDGET', costCenterId: A });
    expect(judge('RETURN', 1n, { from: null })).toEqual({ kind: 'NO_BUDGET', costCenterId: A });
  });

  it('does not touch what is not allocated: a transfer is not held to it', () => {
    expect(judge('TRANSFER', 20n, { unallocatedMinor: 0n }).kind).toBe('OK');
  });
});

describe('a transfer made because the department changed its Cost Center moves what is left, with no floor of the forecast (R-40, QĐ-111bh, AC-10)', () => {
  const change = (amountTr: bigint, from: CostCenterPosition = admin) =>
    judgeAdjustment({
      shape: {
        kind: 'TRANSFER',
        amountMinor: amountTr * M,
        fromCostCenterId: A,
        toCostCenterId: B,
        transferReason: 'COST_CENTER_CHANGE',
      },
      unallocatedMinor: 0n,
      from,
    });

  it('moves what is left of the effective budget, 198 - 110 used = 88 tr: 88 passes although 92 + 18 = 110 tr is not above the forecast, 89 does not', () => {
    expect(change(88n).kind).toBe('OK');
    expect(change(89n)).toEqual({
      kind: 'OVER_REMAINING',
      costCenterId: A,
      remainingMinor: 88n * M,
      usedMinor: 110n * M,
    });
  });

  it('refuses 170 tr, which the base of 180 tr would allow: the Cost Center would be left with 28 tr under the 110 tr it used', () => {
    expect(change(170n)).toEqual({
      kind: 'OVER_REMAINING',
      costCenterId: A,
      remainingMinor: 88n * M,
      usedMinor: 110n * M,
    });
  });

  it('is not held to the forecast: a Cost Center that used 80 tr and is forecast to use 110 tr gives 118 tr of its 198 tr', () => {
    expect(change(118n, { ...admin, usedMinor: 80n * M }).kind).toBe('OK');
    expect(change(119n, { ...admin, usedMinor: 80n * M }).kind).toBe('OVER_REMAINING');
  });

  it('gives nothing when it used more than it has (it was over budget), and says that nothing is left', () => {
    expect(change(1n, { ...admin, usedMinor: 200n * M })).toEqual({
      kind: 'OVER_REMAINING',
      costCenterId: A,
      remainingMinor: 0n,
      usedMinor: 200n * M,
    });
  });

  it('still cannot give more than the base the Cost Center has, and says so before what is left', () => {
    expect(change(181n)).toEqual({ kind: 'OVER_BASE', costCenterId: A, baseMinor: 180n * M });
    expect(change(10n, { baseMinor: 10n * M, reserveMinor: 50n * M, usedMinor: 0n, forecastMinor: 0n }).kind).toBe(
      'OK',
    );
    expect(change(11n, { baseMinor: 10n * M, reserveMinor: 50n * M, usedMinor: 0n, forecastMinor: 0n }).kind).toBe(
      'OVER_BASE',
    );
  });
});

describe('the base of a Cost Center is never taken below nothing', () => {
  it('refuses a return of more than the base even when the reserve would cover the forecast', () => {
    const thin: CostCenterPosition = { baseMinor: 10n * M, reserveMinor: 50n * M, usedMinor: 0n, forecastMinor: 0n };

    expect(judge('RETURN', 11n, { from: thin })).toEqual({ kind: 'OVER_BASE', costCenterId: A, baseMinor: 10n * M });
    expect(judge('RETURN', 10n, { from: thin }).kind).toBe('OK');
  });
});

describe('the shape of an adjustment (C-1)', () => {
  const shape = (over: Partial<Parameters<typeof shapeRefusalOf>[0]>) =>
    shapeRefusalOf({
      kind: 'TRANSFER',
      amountMinor: 1n,
      fromCostCenterId: A,
      toCostCenterId: B,
      transferReason: null,
      ...over,
    });

  it('accepts the four kinds as they are meant', () => {
    expect(shape({})).toBeNull();
    expect(shape({ kind: 'SUPPLEMENT', fromCostCenterId: null })).toBeNull();
    expect(shape({ kind: 'RETURN', toCostCenterId: null })).toBeNull();
    expect(shape({ kind: 'CEILING_REDUCTION', fromCostCenterId: null, toCostCenterId: null })).toBeNull();
    expect(shape({ transferReason: 'COST_CENTER_CHANGE' })).toBeNull();
  });

  it('refuses a missing or a stray Cost Center, the same one twice, a reason that is not a transfer, and an amount that is not above nothing', () => {
    expect(shape({ fromCostCenterId: null })).toBe('FROM_REQUIRED');
    expect(shape({ toCostCenterId: null })).toBe('TO_REQUIRED');
    expect(shape({ toCostCenterId: A })).toBe('SAME_COST_CENTER');
    expect(shape({ kind: 'SUPPLEMENT' })).toBe('FROM_NOT_ALLOWED');
    expect(shape({ kind: 'SUPPLEMENT', fromCostCenterId: null, toCostCenterId: null })).toBe('TO_REQUIRED');
    expect(shape({ kind: 'RETURN' })).toBe('TO_NOT_ALLOWED');
    expect(shape({ kind: 'CEILING_REDUCTION', toCostCenterId: null })).toBe('FROM_NOT_ALLOWED');
    expect(shape({ kind: 'CEILING_REDUCTION', fromCostCenterId: null })).toBe('TO_NOT_ALLOWED');
    expect(shape({ kind: 'RETURN', toCostCenterId: null, transferReason: 'COST_CENTER_CHANGE' })).toBe(
      'TRANSFER_REASON_NOT_ALLOWED',
    );
    expect(shape({ amountMinor: 0n })).toBe('AMOUNT_NOT_POSITIVE');
    expect(shape({ amountMinor: -1n })).toBe('AMOUNT_NOT_POSITIVE');
  });
});
