import {
  JOB_TITLE_NAME_MAX_LENGTH,
  displayJobTitleName,
  isJobTitleNameTooLong,
  normalizeJobTitleName,
} from './job-title-name';

describe('job title names (T-12, US-02-07 AC-2)', () => {
  describe('displayJobTitleName', () => {
    it('trims the ends and collapses every run of whitespace inside to one space, keeping the case', () => {
      expect(displayJobTitleName('  Senior   Designer \t')).toBe('Senior Designer');
    });

    it('treats the Unicode spaces people paste as spaces, not as letters', () => {
      // no-break space, em space, ideographic space, tab, newline, zero-width no-break space (BOM)
      expect(displayJobTitleName(' Senior 　Designer\t\n')).toBe('Senior Designer');
      expect(displayJobTitleName('﻿Designer﻿')).toBe('Designer');
    });

    it('composes accents (NFC), so one name typed two ways is one name', () => {
      expect(displayJobTitleName('Ké toán')).toBe('Ké toán');
    });

    it('is empty for a name made only of whitespace', () => {
      expect(displayJobTitleName('    \t')).toBe('');
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
      expect(normalizeJobTitleName(' Ké   Toán ')).toBe(displayJobTitleName('Ké toán').toLowerCase());
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
