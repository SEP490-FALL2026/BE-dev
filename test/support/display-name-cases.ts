/**
 * One table of names for the display-name rule (T-12) and the job-title comparison built on it. The same rows run
 * against `normalizeDisplayName` (src/core), `normalizeJobTitleName`/`isJobTitleNameTooLong` (organization) and the
 * job-title lookup key of the people import (data-import), so the three cannot drift apart. Invisible characters are
 * written as escapes.
 */
export interface DisplayNameCase {
  readonly label: string;
  readonly input: string;
  /** The name as it is shown and stored: NFC, ends trimmed, inner whitespace runs collapsed, case kept. */
  readonly display: string;
  /** The job-title comparison form: the display name in lower case, independent of locale. */
  readonly comparison: string;
  /** Characters (code points, not UTF-16 units) of the display name. */
  readonly characters: number;
}

/** Every character JavaScript's `\s` matches: the set the rule trims and collapses. */
export const WHITESPACE_CHARACTERS: readonly string[] = [
  '\t',
  '\n',
  '\v',
  '\f',
  '\r',
  ' ',
  '\u00a0',
  '\u1680',
  '\u2000',
  '\u2001',
  '\u2002',
  '\u2003',
  '\u2004',
  '\u2005',
  '\u2006',
  '\u2007',
  '\u2008',
  '\u2009',
  '\u200a',
  '\u2028',
  '\u2029',
  '\u202f',
  '\u205f',
  '\u3000',
  '\ufeff',
];

const hex = (character: string): string => `U+${(character.codePointAt(0) ?? 0).toString(16).padStart(4, '0')}`;

const eachWhitespace: DisplayNameCase[] = WHITESPACE_CHARACTERS.map((space) => ({
  label: `${hex(space)} at both ends and doubled inside`,
  input: `${space}Senior${space}${space}Designer${space}`,
  display: 'Senior Designer',
  comparison: 'senior designer',
  characters: 15,
}));

export const DISPLAY_NAME_CASES: readonly DisplayNameCase[] = [
  { label: 'empty', input: '', display: '', comparison: '', characters: 0 },
  { label: 'only whitespace', input: ' \t\n\u3000\ufeff', display: '', comparison: '', characters: 0 },
  {
    label: 'ASCII ends and an inner run',
    input: '  Senior   Designer \t',
    display: 'Senior Designer',
    comparison: 'senior designer',
    characters: 15,
  },
  ...eachWhitespace,
  {
    label: 'a run of different whitespace becomes one space',
    input: 'Senior\u00a0\t\u3000\u2028Designer',
    display: 'Senior Designer',
    comparison: 'senior designer',
    characters: 15,
  },
  {
    label: 'zero-width space is not whitespace and stays',
    input: 'Senior\u200bDesigner',
    display: 'Senior\u200bDesigner',
    comparison: 'senior\u200bdesigner',
    characters: 15,
  },
  {
    label: 'Mongolian vowel separator is not whitespace and stays',
    input: '\u180eDesigner',
    display: '\u180eDesigner',
    comparison: '\u180edesigner',
    characters: 9,
  },
  {
    label: 'decomposed accents are composed (NFC)',
    input: 'Ke\u0302\u0301 toa\u0301n',
    display: 'K\u1ebf to\u00e1n',
    comparison: 'k\u1ebf to\u00e1n',
    characters: 7,
  },
  {
    label: 'composed accents stay composed',
    input: 'K\u1ebf to\u00e1n',
    display: 'K\u1ebf to\u00e1n',
    comparison: 'k\u1ebf to\u00e1n',
    characters: 7,
  },
  {
    label: 'a name without accents keeps none',
    input: 'Ke toan',
    display: 'Ke toan',
    comparison: 'ke toan',
    characters: 7,
  },
  {
    label: 'display keeps the case; comparison lowercases letters outside ASCII',
    input: '\u0110\u1ea0I DI\u1ec6N \u01afU TI\u00caN',
    display: '\u0110\u1ea0I DI\u1ec6N \u01afU TI\u00caN',
    comparison: '\u0111\u1ea1i di\u1ec7n \u01b0u ti\u00ean',
    characters: 16,
  },
  { label: 'a typo is not corrected', input: 'Desginer', display: 'Desginer', comparison: 'desginer', characters: 8 },
  {
    label: 'lower case does not depend on a locale (dotted capital I)',
    input: '\u0130stanbul',
    display: '\u0130stanbul',
    comparison: 'i\u0307stanbul',
    characters: 8,
  },
  {
    label: 'a combining mark after a trimmed space is kept as it is',
    input: ' \u0301a',
    display: '\u0301a',
    comparison: '\u0301a',
    characters: 2,
  },
  {
    label: 'whitespace between a letter and its mark is collapsed, not composed',
    input: 'e\t\u0301',
    display: 'e \u0301',
    comparison: 'e \u0301',
    characters: 3,
  },
  {
    label: 'characters outside the BMP are kept and counted once',
    input: ' \u{1d4d0}\u{1d4d1} ',
    display: '\u{1d4d0}\u{1d4d1}',
    comparison: '\u{1d4d0}\u{1d4d1}',
    characters: 2,
  },
  {
    label: '100 characters outside the BMP between spaces',
    input: `  ${'\u{1d4d0}'.repeat(100)}  `,
    display: '\u{1d4d0}'.repeat(100),
    comparison: '\u{1d4d0}'.repeat(100),
    characters: 100,
  },
  {
    label: '101 characters outside the BMP',
    input: '\u{1d4d0}'.repeat(101),
    display: '\u{1d4d0}'.repeat(101),
    comparison: '\u{1d4d0}'.repeat(101),
    characters: 101,
  },
  {
    label: '100 decomposed accented letters count as 100 composed characters',
    input: 'E\u0301'.repeat(100),
    display: '\u00c9'.repeat(100),
    comparison: '\u00e9'.repeat(100),
    characters: 100,
  },
];
