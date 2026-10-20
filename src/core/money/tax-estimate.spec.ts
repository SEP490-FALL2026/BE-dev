import { MoneyOutOfRangeError, RateMalformedError, RateOutOfRangeError, RateScaleExceededError } from './money.errors';
import { estimateTax, formatRatePercent, parseRatePercent } from './tax-estimate';

describe('estimateTax (US-12-09 AC-4, QĐ-60a)', () => {
  const vat = { taxType: 'GTGT', rateBp: 1000, deductible: true };
  const cit = { taxType: 'TNDN nhà thầu', rateBp: 500, deductible: false };

  it('AC-4: 1,000.00 USD with VAT 10% deductible and contractor CIT 5% not is 150 tax, 100 + 50, cost 1,050', () => {
    const estimate = estimateTax(100000n, [vat, cit]);

    expect(estimate).toEqual({
      lines: [
        { ...vat, taxMinor: 10000n },
        { ...cit, taxMinor: 5000n },
      ],
      taxMinor: 15000n,
      deductibleMinor: 10000n,
      nonDeductibleMinor: 5000n,
      estimatedCostMinor: 105000n,
    });
  });

  it('EP-05 TS-3: 20,000,000 VND with the same profile is 3,000,000 tax, 2,000,000 deductible, 21,000,000 cost', () => {
    const estimate = estimateTax(20_000_000n, [vat, cit]);

    expect(estimate).toMatchObject({
      taxMinor: 3_000_000n,
      deductibleMinor: 2_000_000n,
      nonDeductibleMinor: 1_000_000n,
      estimatedCostMinor: 21_000_000n,
    });
  });

  it('is zero tax and the price itself for a profile with no lines (not subject to tax)', () => {
    expect(estimateTax(123456n, [])).toEqual({
      lines: [],
      taxMinor: 0n,
      deductibleMinor: 0n,
      nonDeductibleMinor: 0n,
      estimatedCostMinor: 123456n,
    });
  });

  it('is zero for a price of zero and for a rate of zero', () => {
    expect(estimateTax(0n, [vat, cit])).toMatchObject({ taxMinor: 0n, estimatedCostMinor: 0n });
    expect(estimateTax(5000n, [{ ...vat, rateBp: 0 }])).toMatchObject({ taxMinor: 0n, estimatedCostMinor: 5000n });
  });

  it('rounds each line to the nearest minor unit and an exact half away from zero, never the total', () => {
    // 1 minor unit x 50% = 0.5 -> 1 for each of two lines, so the total is 2, not round(1.0) = 1.
    const half = { taxType: 'A', rateBp: 5000, deductible: true };
    expect(estimateTax(1n, [half, { ...half, taxType: 'B' }]).taxMinor).toBe(2n);
    // 3 x 1% = 0.03 -> 0; 49 x 1% = 0.49 -> 0; 50 x 1% = 0.5 -> 1; 150 x 1% = 1.5 -> 2.
    const one = { taxType: 'A', rateBp: 100, deductible: false };
    expect([3n, 49n, 50n, 150n].map((net) => estimateTax(net, [one]).taxMinor)).toEqual([0n, 0n, 1n, 2n]);
  });

  it('handles a whole price and a rate of a hundred percent', () => {
    expect(estimateTax(777n, [{ taxType: 'All', rateBp: 10000, deductible: true }])).toMatchObject({
      taxMinor: 777n,
      estimatedCostMinor: 777n,
    });
  });

  it('takes the price up to 10^15 and refuses more, and a negative price', () => {
    expect(estimateTax(10n ** 15n, [vat]).taxMinor).toBe(10n ** 14n);
    expect(() => estimateTax(10n ** 15n + 1n, [vat])).toThrow(MoneyOutOfRangeError);
    expect(() => estimateTax(-1n, [vat])).toThrow(MoneyOutOfRangeError);
  });

  it('refuses a rate that is not a whole number of hundredths of a percent between 0 and 10000', () => {
    for (const rateBp of [-1, 10001, 1.5, Number.NaN]) {
      expect(() => estimateTax(100n, [{ ...vat, rateBp }])).toThrow(RateOutOfRangeError);
    }
  });

  it('agrees with an independent integer computation on a thousand random cases', () => {
    let seed = 20261020;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;

      return seed;
    };
    for (let index = 0; index < 1000; index += 1) {
      const net = BigInt(next()) * BigInt(next() % 1000);
      const rateBp = next() % 10001;
      const exact = (net * BigInt(rateBp) * 2n + 10000n) / 20000n; // round half up of a non-negative number

      expect(estimateTax(net, [{ taxType: 'X', rateBp, deductible: index % 2 === 0 }]).taxMinor).toBe(exact);
    }
  });
});

describe('parseRatePercent and formatRatePercent', () => {
  it.each([
    ['10', 1000, '10'],
    ['5', 500, '5'],
    ['0', 0, '0'],
    ['100', 10000, '100'],
    ['7.5', 750, '7.5'],
    ['7.25', 725, '7.25'],
    ['0.01', 1, '0.01'],
    ['10.00', 1000, '10'],
    ['010', 1000, '10'],
  ])('reads %s as %d hundredths of a percent and writes it back as %s', (text, rateBp, written) => {
    expect(parseRatePercent(text)).toBe(rateBp);
    expect(formatRatePercent(rateBp)).toBe(written);
  });

  it.each([[''], ['abc'], ['1e1'], ['-1'], [' 10'], ['10%'], ['1,5'], ['.5'], ['10.']])(
    'refuses %j as malformed',
    (text) => {
      expect(() => parseRatePercent(text)).toThrow(RateMalformedError);
    },
  );

  it('refuses a third decimal digit and a rate above 100 percent', () => {
    expect(() => parseRatePercent('7.255')).toThrow(RateScaleExceededError);
    expect(() => parseRatePercent('100.01')).toThrow(RateOutOfRangeError);
    expect(() => parseRatePercent('101')).toThrow(RateOutOfRangeError);
  });
});
