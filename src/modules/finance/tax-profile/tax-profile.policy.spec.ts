import {
  TaxProfileRateInvalidError,
  TaxProfileTaxTypeDuplicateError,
  TaxProfileTaxTypeInvalidError,
  TaxProfileTooManyLinesError,
} from '../finance.errors';
import { DEFAULT_TAX_PROFILE, cleanTaxLines, payerOfGroup, sameProfile, toProfileView } from './tax-profile.policy';

describe('payerOfGroup (QĐ-60b)', () => {
  it('has the buyer remit the tax for T2 only: T1 and T3 are collected by the vendor on the document', () => {
    expect(payerOfGroup('T1')).toBe('VENDOR_COLLECTS');
    expect(payerOfGroup('T2')).toBe('BUYER_REMITS');
    expect(payerOfGroup('T3')).toBe('VENDOR_COLLECTS');
  });
});

describe('DEFAULT_TAX_PROFILE (QĐ-60b, for a vendor with no profile)', () => {
  it('is a T2 profile with VAT 10% deductible and contractor CIT 5% not deductible', () => {
    expect(DEFAULT_TAX_PROFILE).toEqual({
      group: 'T2',
      lines: [
        { taxType: 'GTGT', rateBp: 1000, deductible: true },
        { taxType: 'TNDN nhà thầu', rateBp: 500, deductible: false },
      ],
    });
  });
});

describe('cleanTaxLines', () => {
  it('trims and collapses blanks in the name, reads the rate, keeps the order and the flag', () => {
    expect(
      cleanTaxLines([
        { taxType: '  GTGT ', ratePercent: '10', deductible: true },
        { taxType: 'TNDN   nhà thầu', ratePercent: '5.50', deductible: false },
      ]),
    ).toEqual([
      { taxType: 'GTGT', rateBp: 1000, deductible: true },
      { taxType: 'TNDN nhà thầu', rateBp: 550, deductible: false },
    ]);
  });

  it('accepts no lines at all: a vendor not subject to tax', () => {
    expect(cleanTaxLines([])).toEqual([]);
  });

  it('accepts a rate of zero and one of a hundred percent', () => {
    expect(
      cleanTaxLines([
        { taxType: 'A', ratePercent: '0', deductible: true },
        { taxType: 'B', ratePercent: '100', deductible: true },
      ]).map((line) => line.rateBp),
    ).toEqual([0, 10000]);
  });

  it.each([[''], ['   '], ['N'.repeat(101)]])('refuses the tax name %j', (taxType) => {
    expect(() => cleanTaxLines([{ taxType, ratePercent: '10', deductible: true }])).toThrow(
      TaxProfileTaxTypeInvalidError,
    );
  });

  it('refuses a name used twice ignoring case, accents and spacing', () => {
    expect(() =>
      cleanTaxLines([
        { taxType: 'GTGT', ratePercent: '10', deductible: true },
        { taxType: '  gtgt ', ratePercent: '5', deductible: false },
      ]),
    ).toThrow(TaxProfileTaxTypeDuplicateError);
    expect(() =>
      cleanTaxLines([
        { taxType: 'Thuế nhà thầu', ratePercent: '10', deductible: true },
        { taxType: 'THUE NHA THAU', ratePercent: '5', deductible: false },
      ]),
    ).toThrow(TaxProfileTaxTypeDuplicateError);
  });

  it.each([['-1'], ['101'], ['abc'], ['10%'], ['1.555'], [''], ['1e1']])(
    'refuses the rate %j, naming the tax',
    (ratePercent) => {
      const call = () => cleanTaxLines([{ taxType: 'GTGT', ratePercent, deductible: true }]);

      expect(call).toThrow(TaxProfileRateInvalidError);
      try {
        call();
      } catch (error) {
        expect((error as TaxProfileRateInvalidError).taxType).toBe('GTGT');
      }
    },
  );

  it('allows twenty taxes and refuses twenty-one', () => {
    const lines = Array.from({ length: 21 }, (_, index) => ({
      taxType: `Tax ${index}`,
      ratePercent: '1',
      deductible: false,
    }));

    expect(cleanTaxLines(lines.slice(0, 20))).toHaveLength(20);
    expect(() => cleanTaxLines(lines)).toThrow(TaxProfileTooManyLinesError);
  });
});

describe('sameProfile', () => {
  const profile = {
    group: 'T2' as const,
    lines: [
      { taxType: 'GTGT', rateBp: 1000, deductible: true },
      { taxType: 'TNDN', rateBp: 500, deductible: false },
    ],
  };

  it('is true for the same group and the same lines, ignoring case and accents of the name', () => {
    expect(sameProfile(profile, { group: 'T2', lines: profile.lines.map((line) => ({ ...line })) })).toBe(true);
    expect(
      sameProfile(profile, { group: 'T2', lines: [{ ...profile.lines[0], taxType: 'gtgt' }, profile.lines[1]] }),
    ).toBe(true);
  });

  it('is false when the group, a rate, a flag, the order or the number of lines differs', () => {
    expect(sameProfile(profile, { ...profile, group: 'T3' })).toBe(false);
    expect(sameProfile(profile, { ...profile, lines: [{ ...profile.lines[0], rateBp: 999 }, profile.lines[1]] })).toBe(
      false,
    );
    expect(
      sameProfile(profile, { ...profile, lines: [profile.lines[0], { ...profile.lines[1], deductible: true }] }),
    ).toBe(false);
    expect(sameProfile(profile, { ...profile, lines: [profile.lines[1], profile.lines[0]] })).toBe(false);
    expect(sameProfile(profile, { ...profile, lines: [profile.lines[0]] })).toBe(false);
  });
});

describe('toProfileView', () => {
  const declaredAt = new Date('2026-10-20T08:00:00.000Z');
  const version = {
    vendorId: 'v1',
    version: 3,
    group: 'T2' as const,
    lines: [
      { taxType: 'GTGT', rateBp: 1000, deductible: true },
      { taxType: 'TNDN nhà thầu', rateBp: 550, deductible: false },
    ],
    declaredByAppUserId: 'u1',
    declaredAt,
  };

  it('writes each rate as a percentage and each line with the payer its group implies', () => {
    expect(toProfileView(version)).toEqual({
      group: 'T2',
      lines: [
        { taxType: 'GTGT', ratePercent: '10', deductible: true, payer: 'BUYER_REMITS' },
        { taxType: 'TNDN nhà thầu', ratePercent: '5.5', deductible: false, payer: 'BUYER_REMITS' },
      ],
      version: 3,
      declaredBy: 'u1',
      declaredAt,
    });
  });

  it('never shows the buyer as the payer of a T3 profile', () => {
    expect(toProfileView({ ...version, group: 'T3' }).lines.map((line) => line.payer)).toEqual([
      'VENDOR_COLLECTS',
      'VENDOR_COLLECTS',
    ]);
  });
});
