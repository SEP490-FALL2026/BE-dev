import { cleanDomains, cleanName, cleanPatterns } from './vendor-dictionary.validation';
import {
  VendorDomainInvalidError,
  VendorNameInvalidError,
  VendorPatternInvalidError,
  VendorTooManyValuesError,
} from './vendor-dictionary.errors';

describe('cleanName', () => {
  it('keeps the case and accents, trims and collapses blanks', () => {
    expect(cleanName('  Microsoft   365 \t')).toBe('Microsoft 365');
    expect(cleanName('Công ty Ké Toán')).toBe('Công ty Ké Toán');
  });

  it.each([[''], ['   '], ['\u00a0\u3000'], ['N'.repeat(201)]])('refuses %j', (name) => {
    expect(() => cleanName(name)).toThrow(VendorNameInvalidError);
  });

  it('accepts exactly 1 and exactly 200 characters', () => {
    expect(cleanName('N')).toBe('N');
    expect(cleanName('N'.repeat(200))).toHaveLength(200);
  });
});

describe('cleanDomains', () => {
  it('reduces each value to its host, lower case, and drops repeats in order', () => {
    expect(cleanDomains(['WWW.Figma.com', 'figma.com', 'https://figma.design/x', 'FIGMA.DESIGN'])).toEqual([
      'figma.com',
      'figma.design',
    ]);
  });

  it('accepts none', () => {
    expect(cleanDomains([])).toEqual([]);
  });

  it.each([['not a host'], [''], ['localhost'], ['-a.com'], ['PAYPAL*CANVA']])('refuses %j as a domain', (value) => {
    expect(() => cleanDomains([value])).toThrow(VendorDomainInvalidError);
  });

  it('allows twenty and refuses twenty-one different domains', () => {
    const domains = Array.from({ length: 21 }, (_, index) => `d${index}.example.com`);

    expect(cleanDomains(domains.slice(0, 20))).toHaveLength(20);
    expect(() => cleanDomains(domains)).toThrow(VendorTooManyValuesError);
  });

  it('counts the values after repeats are dropped', () => {
    expect(cleanDomains(Array.from({ length: 30 }, () => 'figma.com'))).toEqual(['figma.com']);
  });
});

describe('cleanPatterns', () => {
  it('trims and collapses blanks, keeps the case, drops repeats that differ only by case or spacing', () => {
    expect(cleanPatterns(['  PayPal*Canva ', 'paypal*canva', 'PAYPAL  *CANVA'])).toEqual([
      'PayPal*Canva',
      'PAYPAL *CANVA',
    ]);
  });

  it.each([['ab'], ['  a  '], ['x'.repeat(101)], ['']])('refuses %j', (value) => {
    expect(() => cleanPatterns([value])).toThrow(VendorPatternInvalidError);
  });

  it('accepts exactly 3 and exactly 100 characters, and refuses twenty-one patterns', () => {
    expect(cleanPatterns(['abc', 'x'.repeat(100)])).toHaveLength(2);
    expect(() => cleanPatterns(Array.from({ length: 21 }, (_, index) => `pattern ${index}`))).toThrow(
      VendorTooManyValuesError,
    );
  });
});
