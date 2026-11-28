import type { KeyCounts, SeatOccupancy, StockBlock, StockPlanFacts } from './stock-summary.types';

/** What is read of the subscriptions (and, for a K4 plan, the lots) of a page of plans: the seats taken and the keys held, by subscription or lot. */
export interface StockCounts {
  seats: ReadonlyMap<string, SeatOccupancy>;
  keys: ReadonlyMap<string, KeyCounts>;
  /** The licenses of each K4 lot held on machines (the open activations and the closed ones whose license was lost with the machine). */
  deviceOccupied: ReadonlyMap<string, number>;
}

const sum = (values: Iterable<number>): number => {
  let total = 0;
  for (const value of values) total += value;

  return total;
};

/**
 * The seats of a K2 plan over the subscriptions a grant can take them from (`QĐ-111n`): the seats bought, those held from today on (the
 * most held on any day, as the database counts them) and those being taken back, and the free ones: each subscription frees what it bought
 * less what it holds, never below zero, so one that holds more than it bought lends nothing to another. A subscription with no quantity
 * (a flat rate) makes the seats bought and free unknown; what is held is still counted.
 */
function seatsOf(plan: StockPlanFacts, seats: StockCounts['seats']): StockBlock {
  const unknown = plan.subscriptions.some((subscription) => subscription.purchasedQuantity === null);
  const taken = (subscriptionId: string): SeatOccupancy =>
    seats.get(subscriptionId) ?? { occupied: 0, inRevocation: 0 };

  return {
    kind: 'SEATS',
    purchased: unknown ? null : sum(plan.subscriptions.map((subscription) => subscription.purchasedQuantity ?? 0)),
    assigned: sum(plan.subscriptions.map((subscription) => taken(subscription.subscriptionId).occupied)),
    free: unknown
      ? null
      : sum(
          plan.subscriptions.map((subscription) =>
            Math.max(0, (subscription.purchasedQuantity ?? 0) - taken(subscription.subscriptionId).occupied),
          ),
        ),
    revoking: sum(plan.subscriptions.map((subscription) => taken(subscription.subscriptionId).inRevocation)),
  };
}

/**
 * The licenses of a K4 plan whose key goes on a machine: the licenses bought, those held on machines and the free ones. One key can be on many
 * machines, so the keys are not counted. Each purchase frees what it bought less what it holds, never below zero, so one that holds more than it
 * bought lends nothing to another. A purchase with no quantity makes the licenses bought and free unknown; what is held is still counted.
 */
function licensesOf(plan: StockPlanFacts, deviceOccupied: StockCounts['deviceOccupied']): StockBlock {
  const unknown = plan.subscriptions.some((subscription) => subscription.purchasedQuantity === null);
  const held = (subscriptionId: string): number => deviceOccupied.get(subscriptionId) ?? 0;

  return {
    kind: 'LICENSES',
    purchased: unknown ? null : sum(plan.subscriptions.map((subscription) => subscription.purchasedQuantity ?? 0)),
    occupied: sum(plan.subscriptions.map((subscription) => held(subscription.subscriptionId))),
    free: unknown
      ? null
      : sum(
          plan.subscriptions.map((subscription) =>
            Math.max(0, (subscription.purchasedQuantity ?? 0) - held(subscription.subscriptionId)),
          ),
        ),
  };
}

/**
 * What a plan holds, counted by what it gives out and never by its subscription records (`QĐ-111n`, `QĐ-103d`): seats for a K2 plan, and keys or
 * licenses for a K4 plan (counted over its lots). A K1 plan has no subscription and no row. Pure: the counts are read by the caller.
 */
export function stockOfPlan(plan: StockPlanFacts, counts: StockCounts): StockBlock {
  const ids = plan.subscriptions.map((subscription) => subscription.subscriptionId);
  if (plan.provisioningType === 'K2') return seatsOf(plan, counts.seats);
  if (plan.provisioningType === 'K4' && plan.keyBinding === 'DEVICE_KEY')
    return licensesOf(plan, counts.deviceOccupied);
  const keys = ids.map((id) => counts.keys.get(id) ?? { inStore: 0, assigned: 0, withdrawn: 0 });

  return {
    kind: 'KEYS',
    inStore: sum(keys.map((key) => key.inStore)),
    assigned: sum(keys.map((key) => key.assigned)),
    withdrawn: sum(keys.map((key) => key.withdrawn)),
  };
}
