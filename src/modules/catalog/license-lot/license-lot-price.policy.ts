import type { BusinessDate } from '../../../core/business-date';
import type { LicenseLotPurpose } from './license-lot.types';

export interface PricedLotCandidate {
  id: string;
  purchasedOn: BusinessDate;
  unitPriceMinor: bigint;
  free: number;
}

export interface AccountLotCandidate {
  id: string;
  purchasedOn: BusinessDate;
  licenseCount: number;
  unitPriceMinor: bigint;
  purpose: LicenseLotPurpose;
  requestId: string | null;
  legacySubscriptionId: string | null;
  free: number;
  keysInStore: number;
  openTasksWithoutKey: number;
  /** Active/reserved beneficiaries of the owning request when `purpose === 'REQUEST'`; 0 otherwise. */
  beneficiaries: number;
  /** Number of excess licenses already charged in `license_lot_charges` for this lot. */
  chargedExcess: number;
}

export interface AccountLotWithGrantable extends AccountLotCandidate {
  grantable: number;
  excessGrantable: number;
}

export type LotChoiceResult =
  | { kind: 'SELECTED'; lot: AccountLotWithGrantable }
  | { kind: 'RESERVED_FOR_REQUEST'; lot: AccountLotWithGrantable }
  | { kind: 'NO_CAPACITY'; reason: 'OWN_LOT_EXHAUSTED' | 'POOL_EMPTY'; lot?: AccountLotWithGrantable };

/**
 * Picks the unit price of the newest lot with `free > 0` ordered `(purchasedOn DESC, id DESC)` (`K-A5`, `QĐ-116am`).
 * Returns `null` when no lot has a free license.
 */
export function pickK4LotUnitPrice(lots: readonly PricedLotCandidate[]): bigint | null {
  const withFree = lots.filter((lot) => lot.free > 0);
  if (withFree.length === 0) return null;
  withFree.sort((a, b) => {
    if (a.purchasedOn !== b.purchasedOn) return a.purchasedOn > b.purchasedOn ? -1 : 1;
    if (a.id === b.id) return 0;

    return a.id > b.id ? -1 : 1;
  });

  return withFree[0].unitPriceMinor;
}

/** Licenses that can be granted immediately from an `ACCOUNT` lot (`min(free, keysInStore - openTasksWithoutKey)`). */
export function accountLotGrantable(input: { free: number; keysInStore: number; openTasksWithoutKey: number }): number {
  return Math.max(0, Math.min(input.free, input.keysInStore - input.openTasksWithoutKey));
}

/** Remaining excess licenses available to non-owning requests in a `REQUEST` lot (`F11`: `n - m - chargedExcess`). */
export function excessGrantableOf(input: {
  licenseCount: number;
  beneficiaries: number;
  chargedExcess: number;
}): number {
  return Math.max(0, input.licenseCount - input.beneficiaries - input.chargedExcess);
}

/**
 * Allocates open grant tasks without an assigned key to candidate lots of an `ACCOUNT` plan:
 * - Tasks with `subscriptionId` matching `lot.id` or `lot.legacySubscriptionId` attach directly to that lot.
 * - Tasks whose `requestId` matches a `REQUEST` lot attach directly to that lot.
 * - Remaining unassigned tasks are distributed in `(createdAt ASC, taskId ASC)` FIFO across non-legacy grantable slots
 *   ordered `(purchasedOn ASC, id ASC)`.
 */
export function countOpenTasksByLot(
  lots: readonly {
    id: string;
    purchasedOn: BusinessDate;
    purpose: LicenseLotPurpose;
    requestId: string | null;
    legacySubscriptionId: string | null;
    free: number;
    keysInStore: number;
  }[],
  tasks: readonly { taskId: string; requestId: string | null; subscriptionId: string | null; createdAt: Date }[],
): Map<string, number> {
  const counts = new Map<string, number>(lots.map((l) => [l.id, 0]));
  if (tasks.length === 0 || lots.length === 0) return counts;

  const remainingTasks = tallyDirectTasks(lots, tasks, counts);
  if (remainingTasks.length > 0) {
    tallyFifoTasks(lots, remainingTasks, counts);
  }

  return counts;
}

function tallyDirectTasks(
  lots: readonly {
    id: string;
    purpose: LicenseLotPurpose;
    requestId: string | null;
    legacySubscriptionId: string | null;
  }[],
  tasks: readonly { taskId: string; requestId: string | null; subscriptionId: string | null; createdAt: Date }[],
  counts: Map<string, number>,
) {
  const bySub = new Map<string, string>();
  const byReq = new Map<string, string>();
  for (const l of lots) {
    bySub.set(l.id, l.id);
    if (l.legacySubscriptionId) bySub.set(l.legacySubscriptionId, l.id);
    if (l.purpose === 'REQUEST' && l.requestId) byReq.set(l.requestId, l.id);
  }

  const remaining: (typeof tasks)[number][] = [];
  for (const task of tasks) {
    const directLot =
      (task.subscriptionId ? bySub.get(task.subscriptionId) : undefined) ??
      (task.requestId ? byReq.get(task.requestId) : undefined);
    if (directLot) {
      counts.set(directLot, (counts.get(directLot) ?? 0) + 1);
    } else {
      remaining.push(task);
    }
  }

  return remaining;
}

function tallyFifoTasks(
  lots: readonly { id: string; purchasedOn: BusinessDate; free: number; keysInStore: number }[],
  remainingTasks: readonly { taskId: string; createdAt: Date }[],
  counts: Map<string, number>,
): void {
  const orderedLots = [...lots].sort((a, b) =>
    a.purchasedOn !== b.purchasedOn ? (a.purchasedOn < b.purchasedOn ? -1 : 1) : a.id.localeCompare(b.id),
  );
  const orderedTasks = [...remainingTasks].sort((a, b) =>
    a.createdAt.getTime() !== b.createdAt.getTime()
      ? a.createdAt.getTime() - b.createdAt.getTime()
      : a.taskId.localeCompare(b.taskId),
  );
  for (const task of orderedTasks) {
    void task;
    const target = orderedLots.find((l) => Math.min(l.free, l.keysInStore) - (counts.get(l.id) ?? 0) > 0);
    if (!target) break;
    counts.set(target.id, (counts.get(target.id) ?? 0) + 1);
  }
}

/**
 * Selects the `ACCOUNT` lot a grant should take a license from (`F11`):
 * - If the request owns a `REQUEST` lot, it ONLY uses that lot (never falls back to another lot).
 * - Otherwise picks oldest grantable lot by `(purchasedOn ASC, id ASC)`, skipping `REQUEST` lots of other requests
 *   when `excessGrantable <= 0` (`RESERVED_FOR_REQUEST`).
 */
export function chooseAccountLot(input: {
  lots: readonly AccountLotCandidate[];
  ownRequestId: string | null;
}): LotChoiceResult {
  const enriched: AccountLotWithGrantable[] = input.lots.map((lot) => ({
    ...lot,
    grantable: accountLotGrantable(lot),
    excessGrantable: excessGrantableOf(lot),
  }));

  if (input.ownRequestId !== null) {
    const ownLot = enriched.find((l) => l.purpose === 'REQUEST' && l.requestId === input.ownRequestId);
    if (ownLot) {
      return ownLot.grantable > 0
        ? { kind: 'SELECTED', lot: ownLot }
        : { kind: 'NO_CAPACITY', reason: 'OWN_LOT_EXHAUSTED', lot: ownLot };
    }
  }

  const ordered = [...enriched].sort((a, b) =>
    a.purchasedOn !== b.purchasedOn ? (a.purchasedOn < b.purchasedOn ? -1 : 1) : a.id.localeCompare(b.id),
  );
  let reservedLot: AccountLotWithGrantable | undefined;
  for (const lot of ordered) {
    if (lot.grantable <= 0) continue;
    if (lot.purpose === 'REQUEST' && lot.requestId !== input.ownRequestId && lot.excessGrantable <= 0) {
      reservedLot ??= lot;
      continue;
    }

    return { kind: 'SELECTED', lot };
  }

  if (reservedLot) return { kind: 'RESERVED_FOR_REQUEST', lot: reservedLot };

  return { kind: 'NO_CAPACITY', reason: 'POOL_EMPTY' };
}
