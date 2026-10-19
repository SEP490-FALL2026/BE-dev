import { JOB_TITLE_NAME_MAX_LENGTH, isJobTitleNameTooLong, normalizeJobTitleName } from './job-title-name';
import { normalizeDisplayName } from '../../core/display-name';
import { DISPLAY_NAME_CASES } from '../../../test/support/display-name-cases';

describe('job title names (T-12, US-02-07 AC-2)', () => {
  describe.each(DISPLAY_NAME_CASES)('$label', ({ input, comparison, characters }) => {
    it('compares as the display form in lower case', () => {
      expect(normalizeJobTitleName(input)).toBe(comparison);
    });

    it('is too long only past 100 characters of the display form', () => {
      expect(isJobTitleNameTooLong(input)).toBe(characters > JOB_TITLE_NAME_MAX_LENGTH);
    });
  });

  describe('normalizeJobTitleName', () => {
    it('ignores case and stray whitespace: the example of AC-2', () => {
      expect(normalizeJobTitleName('senior designer ')).toBe(normalizeJobTitleName('Senior Designer'));
      expect(normalizeJobTitleName('Senior   Designer')).toBe(normalizeJobTitleName('senior designer'));
    });

    it('keeps the diacritics: a name without accents is another name', () => {
      expect(normalizeJobTitleName('Kế toán')).not.toBe(normalizeJobTitleName('Ke toan'));
    });

    it('does not guess a spelling: a typo is another name', () => {
      expect(normalizeJobTitleName('Desginer')).not.toBe(normalizeJobTitleName('Designer'));
    });

    it('lowercases letters outside ASCII, which a naive locale rule would leave alone', () => {
      expect(normalizeJobTitleName('ĐẠI DIỆN ƯU TIÊN')).toBe('đại diện ưu tiên');
    });

    it('is the lowercase of the display name, and is the same whichever way the accents were typed', () => {
      expect(normalizeJobTitleName(' Ké   Toán ')).toBe(normalizeDisplayName('Ké toán').toLowerCase());
    });
  });

  describe('isJobTitleNameTooLong', () => {
    it('counts characters, not UTF-16 units, after normalization', () => {
      expect(isJobTitleNameTooLong('a'.repeat(JOB_TITLE_NAME_MAX_LENGTH))).toBe(false);
      expect(isJobTitleNameTooLong('a'.repeat(JOB_TITLE_NAME_MAX_LENGTH + 1))).toBe(true);
      // 100 letters that each take two UTF-16 units are still 100 characters.
      expect(isJobTitleNameTooLong('\u{1d4d0}'.repeat(JOB_TITLE_NAME_MAX_LENGTH))).toBe(false);
    });

    it('does not count the whitespace the normalization removes', () => {
      expect(isJobTitleNameTooLong(`  ${'a'.repeat(JOB_TITLE_NAME_MAX_LENGTH)}  `)).toBe(false);
    });
  });
});
