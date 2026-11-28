import {
  MAX_ASSET_NUMBER,
  formatAssetCode,
  isGeneratedForm,
  isLegacyCodeAcceptable,
  nextAssetNumber,
} from './asset-code.policy';

describe('formatAssetCode', () => {
  it('writes the type, the two last digits of the year and the number in four digits', () => {
    expect(formatAssetCode('PC', 2026, 14)).toBe('PC-26-0014');
    expect(formatAssetCode('LAP', 2026, 1)).toBe('LAP-26-0001');
    expect(formatAssetCode('OTH', 2031, 9999)).toBe('OTH-31-9999');
  });

  it('keeps a leading zero of the year', () => {
    expect(formatAssetCode('LAP', 2005, 7)).toBe('LAP-05-0007');
  });
});

describe('isGeneratedForm', () => {
  it('knows a code of the form the generator writes', () => {
    expect(isGeneratedForm('LAP-26-0007')).toBe(true);
    expect(isGeneratedForm('PC-26-0014')).toBe(true);
    expect(isGeneratedForm('OTH-26-0001')).toBe(true);
  });

  it('does not take a typed code for a generated one', () => {
    expect(isGeneratedForm('SV-LT-003')).toBe(false);
    expect(isGeneratedForm('LAP-26-007')).toBe(false);
    expect(isGeneratedForm('LAP-2026-0007')).toBe(false);
    expect(isGeneratedForm('lap-26-0007')).toBe(false);
    expect(isGeneratedForm('XYZ-26-0007')).toBe(false);
  });
});

describe('isLegacyCodeAcceptable', () => {
  it('takes a typed code of 3 to 20 capital letters, digits and hyphens', () => {
    expect(isLegacyCodeAcceptable('SV-LT-003')).toBe(true);
    expect(isLegacyCodeAcceptable('ABC')).toBe(true);
    expect(isLegacyCodeAcceptable('A'.repeat(20))).toBe(true);
  });

  it('refuses a code that has the form the generator writes, so a typed code never takes the place of a generated one', () => {
    expect(isLegacyCodeAcceptable('LAP-26-0007')).toBe(false);
    expect(isLegacyCodeAcceptable('PC-26-0014')).toBe(false);
  });

  it('refuses a code that is too short or too long, or has a blank, a small letter or another sign', () => {
    expect(isLegacyCodeAcceptable('ab')).toBe(false);
    expect(isLegacyCodeAcceptable('A'.repeat(21))).toBe(false);
    expect(isLegacyCodeAcceptable('SV LT 3')).toBe(false);
    expect(isLegacyCodeAcceptable('sv-lt-3')).toBe(false);
    expect(isLegacyCodeAcceptable('SV_LT_3')).toBe(false);
    expect(isLegacyCodeAcceptable('')).toBe(false);
  });
});

describe('nextAssetNumber', () => {
  it('is one more than the last number issued', () => {
    expect(nextAssetNumber(0)).toBe(1);
    expect(nextAssetNumber(13)).toBe(14);
    expect(nextAssetNumber(MAX_ASSET_NUMBER - 1)).toBe(MAX_ASSET_NUMBER);
  });

  it('says there is none left once the last four-digit number was issued', () => {
    expect(nextAssetNumber(MAX_ASSET_NUMBER)).toBeNull();
  });
});
