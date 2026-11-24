import { LicenseKeyMaxActivationsNotRaisedError, LicenseKeyStateError } from './license-key.errors';

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

/** How the plan of a purchase is bound once bought; null for a plan that has none (a purchase of such a plan is read as bound to an account). */
export type KeyBinding = 'ACCOUNT' | 'DEVICE_KEY' | 'DEVICE_BUNDLED' | null;

/**
 * How many licenses a purchase can give out (`US-04-12` AC-1, AC-12, `INV-01`): for a key that goes on a machine, the licenses bought (one key
 * can be on many machines, so the keys are not counted); otherwise the smaller of the seats bought and the keys that can still be used. Nothing
 * while the seats bought are not known.
 */
export function capacityOf(input: { purchased: number | null; usableKeys: number; keyBinding?: KeyBinding }): number {
  if (input.purchased === null) return 0;

  return input.keyBinding === 'DEVICE_KEY' ? input.purchased : Math.min(input.purchased, input.usableKeys);
}

/** What is taken of the capacity: the licenses held on machines for a key on a machine, the keys given to a seat otherwise. */
export function occupiedOf(input: { keyBinding?: KeyBinding; assignedKeys: number; deviceOccupied: number }): number {
  return input.keyBinding === 'DEVICE_KEY' ? input.deviceOccupied : input.assignedKeys;
}

/** What is left of the capacity, never below zero. */
export function freeOf(capacity: number, occupied: number): number {
  return Math.max(0, capacity - occupied);
}

export type CapacityWarning = 'KEY_COUNT_DIFFERS' | 'QUANTITY_UNKNOWN';

/**
 * What the IT Admin is told about the capacity: the keys are not as many as the seats bought, or the seats are unknown. A key that goes on
 * a machine is not counted against the licenses, so only the unknown licenses are told.
 */
export function warningOf(input: {
  purchased: number | null;
  usableKeys: number;
  keyBinding?: KeyBinding;
}): CapacityWarning | null {
  if (input.purchased === null) return 'QUANTITY_UNKNOWN';
  if (input.keyBinding === 'DEVICE_KEY') return null;

  return input.usableKeys === input.purchased ? null : 'KEY_COUNT_DIFFERS';
}

/** The most activations a key may be given (CHECK `license_keys_max_activations_range`). */
export const MAX_ACTIVATIONS_LIMIT = 100000;

/**
 * The cap of activations of a key at import: the one the IT Admin names, else the install limit of the terms of its plan, else one. Never above
 * what the column holds, so an install limit larger than that is cut to it.
 */
export function resolveMaxActivations(given: number | undefined, installLimit: number | null): number {
  return Math.min(given ?? installLimit ?? 1, MAX_ACTIVATIONS_LIMIT);
}

/** The activations a key has used: those it had when it was entered and every operation on it since, closed or not. Never goes down. */
export function activationsUsedOf(initialActivationsUsed: number, operationActivations: number): number {
  return initialActivationsUsed + operationActivations;
}

/** Whether a key has used all the activations it allows. */
export function capReachedOf(activationsUsed: number, maxActivations: number): boolean {
  return activationsUsed >= maxActivations;
}

/** The cap of a key only goes up. Throws LicenseKeyMaxActivationsNotRaisedError. */
export function assertMaxActivationsRaised(current: number, next: number): void {
  if (next <= current) throw new LicenseKeyMaxActivationsNotRaisedError(current);
}

/** The longest reason a withdrawal keeps (CHECK `license_keys_withdrawal_reason`); the DTO bounds the request with it. */
export const WITHDRAWAL_REASON_MAX_LENGTH = 500;

/** What the rules of the pool read of a key. */
export interface KeyState {
  subscriptionId: string;
  status: 'IN_STORE' | 'ASSIGNED';
  withdrawnAt: Date | null;
}

/**
 * Whether a key may be given to the seat of a grant (`BR-MF1-09`, `QĐ-103d`): a free key of the store, not withdrawn, of the purchase the
 * seat sits on. Throws LicenseKeyStateError.
 */
export function assertAssignable(key: KeyState, seatSubscriptionId: string | null): void {
  if (key.withdrawnAt !== null) throw new LicenseKeyStateError('WITHDRAWN');
  if (key.status !== 'IN_STORE') throw new LicenseKeyStateError('NOT_IN_STORE');
  if (key.subscriptionId !== seatSubscriptionId) throw new LicenseKeyStateError('SUBSCRIPTION_MISMATCH');
}

/** Whether a key may be withdrawn from the store (`QĐ-103v`, Q-10 B): only a free key, once. Throws LicenseKeyStateError. */
export function assertWithdrawable(key: KeyState): void {
  if (key.withdrawnAt !== null) throw new LicenseKeyStateError('ALREADY_WITHDRAWN');
  if (key.status === 'ASSIGNED') throw new LicenseKeyStateError('ASSIGNED');
}
