import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export type RequestLocaleValue = 'vi' | 'en';

const DEFAULT_LOCALE: RequestLocaleValue = 'vi';
const SUPPORTED_LOCALES: readonly string[] = ['vi', 'en'];

/** A longer header is not a real language preference; it is not parsed at all. */
const MAX_HEADER_LENGTH = 256;
const QUALITY_PATTERN = /^\d+(?:\.\d+)?$/;

interface LanguageRange {
  primary: string;
  quality: number;
}

/** `q=<number in [0, 1]>`, or the default 1 when no `q` parameter is present; `undefined` when `q` is malformed. */
function qualityOf(parameters: readonly string[]): number | undefined {
  const parameter = parameters.map((part) => part.trim()).find((part) => /^q\s*=/i.test(part));

  if (parameter === undefined) return 1;

  const raw = parameter.slice(parameter.indexOf('=') + 1).trim();
  const quality = QUALITY_PATTERN.test(raw) ? Number(raw) : Number.NaN;

  return quality >= 0 && quality <= 1 ? quality : undefined;
}

function parseRange(entry: string): LanguageRange | undefined {
  const [tag = '', ...parameters] = entry.split(';');
  const quality = qualityOf(parameters);
  const primary = tag.trim().split(/[-_]/)[0]?.toLowerCase() ?? '';

  if (quality === undefined || quality === 0 || primary === '') return undefined;

  return { primary, quality };
}

/**
 * Which language to render a message in, from an `Accept-Language` header: the best-ranked range that is
 * `vi` or `en` (by primary subtag), otherwise `vi`.
 *
 * Ranges rank by `q` (default 1, highest first), ties keep header order; `q=0` or a malformed `q` drops
 * the range. `*`, an empty header and an over-long header give `vi`. Pure and total: it never throws.
 */
export function localeFromAcceptLanguage(header: string | undefined): RequestLocaleValue {
  if (header === undefined || header.length > MAX_HEADER_LENGTH) return DEFAULT_LOCALE;

  const ranges = header
    .split(',')
    .map(parseRange)
    .filter((range): range is LanguageRange => range !== undefined)
    .sort((left, right) => right.quality - left.quality);
  const best = ranges.find((range) => SUPPORTED_LOCALES.includes(range.primary));

  return best?.primary === 'en' ? 'en' : DEFAULT_LOCALE;
}

/**
 * The caller's message language, resolved from `Accept-Language`. It returns one of two constants, never the
 * header text, so it is safe as a custom parameter that the validation pipe does not check.
 */
export const RequestLocale = createParamDecorator((_data: unknown, context: ExecutionContext): RequestLocaleValue => {
  const header = context.switchToHttp().getRequest<Request>().headers['accept-language'];

  return localeFromAcceptLanguage(typeof header === 'string' ? header : undefined);
});
