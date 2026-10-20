/** The most keys one batch holds; the DTO bounds the request with it. */
export const MAX_KEYS_PER_BATCH = 1000;

const SHAPE = /^[A-Za-z0-9\-_.=+/]{8,128}$/;

export interface BatchKey {
  /** The place of the key in the batch as it was sent, from 1. */
  line: number;
  key: string;
}

export type BatchErrorCode = 'INVALID_FORMAT' | 'DUPLICATE_IN_BATCH';

export interface BatchError {
  line: number;
  code: BatchErrorCode;
}

/**
 * What a batch holds (`US-04-12` AC-1, AC-9): each key trimmed, a key that is not 8 to 128 characters of letters, digits
 * and `- _ . = + /` reported on its line, a key that appears again reported on the later line. A wrong line never spoils
 * the others. Keys are case sensitive. An error names a line and a code and never the key.
 */
export function judgeBatch(keys: readonly string[]): { rows: BatchKey[]; errors: BatchError[] } {
  const rows: BatchKey[] = [];
  const errors: BatchError[] = [];
  const seen = new Set<string>();

  keys.forEach((raw, index) => {
    const line = index + 1;
    const key = raw.trim();
    if (!SHAPE.test(key)) {
      errors.push({ line, code: 'INVALID_FORMAT' });
    } else if (seen.has(key)) {
      errors.push({ line, code: 'DUPLICATE_IN_BATCH' });
    } else {
      seen.add(key);
      rows.push({ line, key });
    }
  });

  return { rows, errors };
}

/** What a list shows of a key (`US-04-12` AC-2): four bullets and the last four characters, never more of it. */
export function maskKey(key: string): string {
  return `••••${key.slice(-4)}`;
}

/**
 * How many licenses a purchase can give out (`US-04-12` AC-1, AC-12, `INV-01`): the smaller of the seats bought and the
 * keys that can still be used, and nothing while the seats bought are not known.
 */
export function capacityOf(input: { purchased: number | null; usableKeys: number }): number {
  return input.purchased === null ? 0 : Math.min(input.purchased, input.usableKeys);
}

export type CapacityWarning = 'KEY_COUNT_DIFFERS' | 'QUANTITY_UNKNOWN';

/** What the IT Admin is told about the capacity: the keys are not as many as the seats bought, or the seats are unknown. */
export function warningOf(input: { purchased: number | null; usableKeys: number }): CapacityWarning | null {
  if (input.purchased === null) return 'QUANTITY_UNKNOWN';

  return input.usableKeys === input.purchased ? null : 'KEY_COUNT_DIFFERS';
}
