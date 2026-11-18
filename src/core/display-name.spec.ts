import { DISPLAY_NAME_CASES } from '../../test/support/display-name-cases';
import { normalizeDisplayName } from './display-name';

describe('normalizeDisplayName (T-12)', () => {
  it.each(DISPLAY_NAME_CASES)('$label', ({ input, display }) => {
    expect(normalizeDisplayName(input)).toBe(display);
  });

  describe('names as people type them', () => {
    it('trims the ends and collapses every run of whitespace inside to one space, keeping the case', () => {
      expect(normalizeDisplayName('  Senior   Designer \t')).toBe('Senior Designer');
    });

    it('treats the Unicode spaces people paste as spaces, not as letters', () => {
      // no-break space, em space, ideographic space, tab, newline, zero-width no-break space (BOM)
      expect(normalizeDisplayName(' Senior 　Designer\t\n')).toBe('Senior Designer');
      expect(normalizeDisplayName('﻿Designer﻿')).toBe('Designer');
    });

    it('composes accents (NFC), so one name typed two ways is one name', () => {
      expect(normalizeDisplayName('Ké toán')).toBe('Ké toán');
    });

    it('is empty for a name made only of whitespace', () => {
      expect(normalizeDisplayName('    \t')).toBe('');
    });
  });

  it('keeps the case: comparing without case is the caller’s own rule', () => {
    expect(normalizeDisplayName(' Senior DESIGNER ')).toBe('Senior DESIGNER');
  });

  it('gives back its own result unchanged', () => {
    for (const { input } of DISPLAY_NAME_CASES) {
      const display = normalizeDisplayName(input);
      expect(normalizeDisplayName(display)).toBe(display);
    }
  });
});
