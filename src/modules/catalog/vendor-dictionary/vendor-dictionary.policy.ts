import { normalizeDisplayName } from '../../../core/display-name';
import {
  VendorDomainInvalidError,
  VendorNameInvalidError,
  VendorPatternInvalidError,
  VendorTooManyValuesError,
} from './vendor-dictionary.errors';
import { normalizeHost, searchKey } from './vendor-matcher.policy';

export const MAX_NAME_LENGTH = 200;
export const MIN_PATTERN_LENGTH = 3;
export const MAX_PATTERN_LENGTH = 100;
export const MAX_VALUES = 20;

/** A name as it is shown: trimmed, blanks collapsed, 1 to 200 characters. The case and accents stay. */
export function cleanName(raw: string): string {
  const name = normalizeDisplayName(raw);
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) throw new VendorNameInvalidError();

  return name;
}

/** Each value reduced to its host; repeats dropped, order kept; at most twenty. */
export function cleanDomains(values: readonly string[]): string[] {
  const hosts = new Set<string>();
  for (const value of values) {
    const host = normalizeHost(value);
    if (host === null) throw new VendorDomainInvalidError(value);
    hosts.add(host);
  }
  if (hosts.size > MAX_VALUES) throw new VendorTooManyValuesError(MAX_VALUES);

  return [...hosts];
}

/** Each pattern shown as typed (blanks collapsed), 3 to 100 characters; repeats by comparison key dropped; at most twenty. */
export function cleanPatterns(values: readonly string[]): string[] {
  const kept = new Map<string, string>();
  for (const value of values) {
    const pattern = normalizeDisplayName(value);
    if (pattern.length < MIN_PATTERN_LENGTH || pattern.length > MAX_PATTERN_LENGTH) {
      throw new VendorPatternInvalidError();
    }
    const key = searchKey(pattern);
    if (!kept.has(key)) kept.set(key, pattern);
  }
  if (kept.size > MAX_VALUES) throw new VendorTooManyValuesError(MAX_VALUES);

  return [...kept.values()];
}
