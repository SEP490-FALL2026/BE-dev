import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { ExecutionContext } from '@nestjs/common';
import { localeFromAcceptLanguage, RequestLocale } from './request-locale.decorator';

describe('localeFromAcceptLanguage', () => {
  it.each([
    ['vi-VN', 'vi'],
    ['en-US,en;q=0.9', 'en'],
    ['fr, en;q=0.5', 'en'],
    ['de', 'vi'],
    ['EN', 'en'],
    ['en;q=0, vi', 'vi'],
  ] as const)('maps %j to %s (spec examples)', (header, expected) => {
    expect(localeFromAcceptLanguage(header)).toBe(expected);
  });

  it.each([undefined, '', '   ', ',', '*', 'fr, de;q=0.8, *;q=0.1'])('falls back to vi for %j', (header) => {
    expect(localeFromAcceptLanguage(header)).toBe('vi');
  });

  it('sorts by q descending regardless of order', () => {
    expect(localeFromAcceptLanguage('vi;q=0.3, en;q=0.8')).toBe('en');
    expect(localeFromAcceptLanguage('en;q=0.3, vi;q=0.8')).toBe('vi');
  });

  it('keeps the original order when q is equal', () => {
    expect(localeFromAcceptLanguage('en, vi')).toBe('en');
    expect(localeFromAcceptLanguage('vi, en')).toBe('vi');
    expect(localeFromAcceptLanguage('en;q=0.5, vi;q=0.5')).toBe('en');
  });

  it('takes the primary subtag before - or _, case-insensitively', () => {
    expect(localeFromAcceptLanguage('en_GB')).toBe('en');
    expect(localeFromAcceptLanguage('EN-us')).toBe('en');
    expect(localeFromAcceptLanguage('VI_vn')).toBe('vi');
  });

  it('does not match a longer primary subtag that merely starts with vi or en', () => {
    expect(localeFromAcceptLanguage('eng, vie')).toBe('vi');
    expect(localeFromAcceptLanguage('eng, en;q=0.1')).toBe('en');
  });

  it('tolerates surrounding and inner whitespace', () => {
    expect(localeFromAcceptLanguage('  fr ,  en ; q=0.5  ')).toBe('en');
    expect(localeFromAcceptLanguage(' \t en-US \t ')).toBe('en');
  });

  it('drops an entry with q=0 but keeps others', () => {
    expect(localeFromAcceptLanguage('en;q=0')).toBe('vi');
    expect(localeFromAcceptLanguage('en;q=0.0, de')).toBe('vi');
    expect(localeFromAcceptLanguage('vi;q=0, en;q=0.1')).toBe('en');
  });

  it.each(['en;q=abc', 'en;q=2', 'en;q=1.5', 'en;q=-1', 'en;q=', 'en;q=0.5x', 'en;q=1e0'])(
    'drops an entry whose q is invalid (%j) and falls through',
    (entry) => {
      expect(localeFromAcceptLanguage(entry)).toBe('vi');
      expect(localeFromAcceptLanguage(`${entry}, vi;q=0.1`)).toBe('vi');
      expect(localeFromAcceptLanguage(`vi;q=abc, en;q=0.1`)).toBe('en');
    },
  );

  it('accepts q at the bounds 0 and 1', () => {
    expect(localeFromAcceptLanguage('en;q=1')).toBe('en');
    expect(localeFromAcceptLanguage('en;q=1.0, vi')).toBe('en');
    expect(localeFromAcceptLanguage('vi;q=0.9, en;q=1')).toBe('en');
  });

  it('ignores parameters other than q and accepts an upper-case Q', () => {
    expect(localeFromAcceptLanguage('en;foo=bar;q=0.2, vi;q=0.1')).toBe('en');
    expect(localeFromAcceptLanguage('vi;Q=0.2, en;Q=0.9')).toBe('en');
  });

  it('falls back to vi when the header is longer than 256 characters, even if it starts with en', () => {
    const header = `en,${'x'.repeat(254)}`;

    expect(header.length).toBe(257);
    expect(localeFromAcceptLanguage(header)).toBe('vi');
  });

  it('still parses a header of exactly 256 characters', () => {
    const header = `en,${'x'.repeat(253)}`;

    expect(header.length).toBe(256);
    expect(localeFromAcceptLanguage(header)).toBe('en');
  });

  it('never returns the raw input', () => {
    for (const header of ['<script>', 'en;q=0.5, ../../etc', 'EN', 'zz']) {
      expect(['vi', 'en']).toContain(localeFromAcceptLanguage(header));
    }
  });
});

describe('@RequestLocale()', () => {
  // A Nest param decorator stores its factory in the class metadata; read it back to run it directly.
  function factoryOf(): (data: unknown, context: ExecutionContext) => unknown {
    class Probe {
      handler(@RequestLocale() _locale: 'vi' | 'en'): void {
        void _locale;
      }
    }
    const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, Probe, 'handler') as Record<
      string,
      { factory: (data: unknown, context: ExecutionContext) => unknown }
    >;

    return Object.values(metadata)[0].factory;
  }

  const contextWith = (headers: Record<string, unknown>): ExecutionContext =>
    ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as unknown as ExecutionContext;

  it('reads the accept-language request header and returns a closed value', () => {
    const factory = factoryOf();

    expect(factory(undefined, contextWith({ 'accept-language': 'en-US,en;q=0.9' }))).toBe('en');
    expect(factory(undefined, contextWith({ 'accept-language': 'vi-VN' }))).toBe('vi');
    expect(factory(undefined, contextWith({}))).toBe('vi');
  });

  it('falls back to vi when the header is not a single string', () => {
    const factory = factoryOf();

    expect(factory(undefined, contextWith({ 'accept-language': ['en', 'vi'] }))).toBe('vi');
  });
});
