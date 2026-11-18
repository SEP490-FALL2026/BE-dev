import {
  PlanTermsInstallLimitNumericOnlyForK4Error,
  PlanTermsNotApplicableError,
  PlanTermsReviewDateInFutureError,
  PlanTermsTextInvalidError,
  PlanTermsUrlInvalidError,
} from './plan-terms.errors';
import {
  assertInstallLimit,
  assertReviewDate,
  assertTermsApplicable,
  cleanTermsText,
  cleanTermsUrl,
  reviewDue,
} from './plan-terms.policy';

describe('cleanTermsText (what IT read, kept as read)', () => {
  it('keeps the words and the case, trims and collapses blanks, and gives nothing as null', () => {
    expect(cleanTermsText('  đọc điều khoản thấy   chỉ cho dùng nội bộ ')).toBe(
      'đọc điều khoản thấy chỉ cho dùng nội bộ',
    );
    expect(cleanTermsText(undefined)).toBeNull();
    expect(cleanTermsText(null)).toBeNull();
    expect(cleanTermsText('   ')).toBeNull();
  });

  it('does not rewrite what it was given: no classification, no verdict', () => {
    const text = 'Storage in the EU, THIS VIOLATES NOTHING';

    expect(cleanTermsText(text)).toBe(text);
  });

  it('takes 2000 characters and refuses more', () => {
    expect(cleanTermsText('x'.repeat(2000))).toHaveLength(2000);
    expect(() => cleanTermsText('x'.repeat(2001))).toThrow(PlanTermsTextInvalidError);
  });
});

describe('cleanTermsUrl', () => {
  it('accepts an http or https address, trimmed', () => {
    expect(cleanTermsUrl(' https://www.figma.com/tos ')).toBe('https://www.figma.com/tos');
    expect(cleanTermsUrl('http://example.com/terms?lang=vi')).toBe('http://example.com/terms?lang=vi');
  });

  it('gives nothing as null', () => {
    expect(cleanTermsUrl(undefined)).toBeNull();
    expect(cleanTermsUrl(null)).toBeNull();
    expect(cleanTermsUrl('  ')).toBeNull();
  });

  it.each([
    ['figma.com/tos'],
    ['ftp://example.com/terms'],
    ['javascript:alert(1)'],
    ['file:///etc/passwd'],
    ['not a url'],
    ['https://'],
  ])('refuses %j', (value) => {
    expect(() => cleanTermsUrl(value)).toThrow(PlanTermsUrlInvalidError);
  });

  it('refuses an address over 2000 characters', () => {
    expect(() => cleanTermsUrl(`https://example.com/${'a'.repeat(2000)}`)).toThrow(PlanTermsUrlInvalidError);
  });
});

describe('assertTermsApplicable', () => {
  it('has terms for every kind of plan but K5', () => {
    for (const type of ['K1', 'K2', 'K3', 'K4'] as const) expect(() => assertTermsApplicable(type)).not.toThrow();
    expect(() => assertTermsApplicable('K5')).toThrow(PlanTermsNotApplicableError);
  });
});

describe('assertInstallLimit (QĐ-66al)', () => {
  it('accepts a number for a K4 plan and none for any plan', () => {
    expect(() => assertInstallLimit('K4', 1)).not.toThrow();
    expect(() => assertInstallLimit('K4', 25)).not.toThrow();
    for (const type of ['K1', 'K2', 'K4', 'K5'] as const) {
      expect(() => assertInstallLimit(type, null)).not.toThrow();
      expect(() => assertInstallLimit(type, undefined)).not.toThrow();
    }
  });

  it('refuses a number for a plan that is not K4', () => {
    for (const type of ['K1', 'K2', 'K3', 'K5'] as const) {
      expect(() => assertInstallLimit(type, 2)).toThrow(PlanTermsInstallLimitNumericOnlyForK4Error);
    }
  });
});

describe('assertReviewDate', () => {
  it('accepts today and any day before, and refuses a day that has not come', () => {
    expect(() => assertReviewDate('2026-10-20', '2026-10-20')).not.toThrow();
    expect(() => assertReviewDate('2025-11-15', '2026-10-20')).not.toThrow();
    expect(() => assertReviewDate(null, '2026-10-20')).not.toThrow();
    expect(() => assertReviewDate('2026-10-21', '2026-10-20')).toThrow(PlanTermsReviewDateInFutureError);
  });
});

describe('reviewDue (US-04-11 AC-3, AC-4, AC-9)', () => {
  // The deadline is 01/12/2026 and the first alert 15 days before: 16/11/2026.
  const subscription = { baseDate: '2026-12-01', firstAlertDate: '2026-11-16' };

  it('AC-3: is not due before the first alert date', () => {
    expect(reviewDue({ today: '2026-11-15', lastReviewedOn: '2025-11-15', ...subscription })).toBe(false);
  });

  it('AC-3: is due from the first alert date to the base date, when the last review is older than the milestone', () => {
    for (const today of ['2026-11-16', '2026-11-24', '2026-12-01']) {
      expect(reviewDue({ today, lastReviewedOn: '2025-11-15', ...subscription })).toBe(true);
    }
  });

  it('is due when the plan was never reviewed', () => {
    expect(reviewDue({ today: '2026-11-20', lastReviewedOn: null, ...subscription })).toBe(true);
  });

  it('AC-3: is over once the base date has passed', () => {
    expect(reviewDue({ today: '2026-12-02', lastReviewedOn: '2025-11-15', ...subscription })).toBe(false);
  });

  it('AC-4: closes when the last review falls on or after the milestone, and stays open for a review just before it', () => {
    expect(reviewDue({ today: '2026-11-25', lastReviewedOn: '2026-11-20', ...subscription })).toBe(false);
    expect(reviewDue({ today: '2026-11-25', lastReviewedOn: '2026-11-16', ...subscription })).toBe(false);
    expect(reviewDue({ today: '2026-11-25', lastReviewedOn: '2026-11-15', ...subscription })).toBe(true);
  });

  it('AC-9: works the same from an end date as the base', () => {
    expect(
      reviewDue({ today: '2026-12-16', lastReviewedOn: null, baseDate: '2026-12-31', firstAlertDate: '2026-12-16' }),
    ).toBe(true);
    expect(
      reviewDue({ today: '2026-12-15', lastReviewedOn: null, baseDate: '2026-12-31', firstAlertDate: '2026-12-16' }),
    ).toBe(false);
  });
});
