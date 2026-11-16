import { ALERT_THRESHOLDS, crossedThresholds } from './threshold.policy';

const M = 1_000_000n;
const crossed = (before: bigint, after: bigint, base: bigint) =>
  crossedThresholds({ usedBeforeMinor: before * M, usedAfterMinor: after * M, baseMinor: base * M });

/** `T-RV2`, `QĐ-111af`, R-5, R-28: the threshold is told when the use goes from under it to at it or over it, against the effective base. */
describe('crossedThresholds (RV-2)', () => {
  it('the thresholds are the two constants of R-5, 80 and 100 percent', () => {
    expect(ALERT_THRESHOLDS).toEqual([80, 100]);
  });

  it('T-RV2: base 120 tr: 96 tr used crosses 80 percent, 100 tr crosses none, 120 tr crosses 100 percent', () => {
    expect(crossed(90n, 96n, 120n)).toEqual([80]);
    expect(crossed(96n, 100n, 120n)).toEqual([]);
    expect(crossed(100n, 120n, 120n)).toEqual([100]);
  });

  it('the figure of the threshold itself counts (at or over), the one just under does not', () => {
    expect(crossedThresholds({ usedBeforeMinor: 0n, usedAfterMinor: 95_999_999n, baseMinor: 120n * M })).toEqual([]);
    expect(crossedThresholds({ usedBeforeMinor: 95_999_999n, usedAfterMinor: 96n * M, baseMinor: 120n * M })).toEqual([
      80,
    ]);
  });

  it('a base that adjustments raised to 128 tr: the use going 120 to 128 tr crosses 100 percent and does not cross 80 percent again', () => {
    expect(crossed(120n, 128n, 128n)).toEqual([100]);
  });

  it('one change that goes over both thresholds crosses both, the lower first', () => {
    expect(crossed(50n, 125n, 120n)).toEqual([80, 100]);
  });

  it('a use that stays, goes down or was over already crosses nothing: the base changing alone is never told (R-28)', () => {
    expect(crossed(100n, 100n, 120n)).toEqual([]);
    expect(crossed(110n, 90n, 120n)).toEqual([]);
    expect(crossed(130n, 140n, 120n)).toEqual([]);
    // The base was lowered by a transfer below what is used: the use did not move.
    expect(crossed(100n, 100n, 90n)).toEqual([]);
  });

  it('a base that is not above nothing has no threshold', () => {
    expect(crossed(0n, 10n, 0n)).toEqual([]);
  });
});
