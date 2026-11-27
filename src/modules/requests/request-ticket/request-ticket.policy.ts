import { ENDED_STATES, type AccessRequestState } from '../access-request/access-request.types';

export const MAX_TICKET_ITEMS = 6;

const ENDED_STATE_SET: ReadonlySet<AccessRequestState> = new Set(ENDED_STATES);

/** Sort ticket-scoped items by position ascending without mutating the input array. */
export function orderByPosition<T extends { position: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position);
}

/** Detect duplicate plans within a ticket; keeps only the earliest position per planId. */
export function findDuplicates(
  items: readonly { position: number; planId: string }[],
): { position: number; duplicateOfPosition: number }[] {
  const firstSeenByPlan = new Map<string, number>();
  const duplicates: { position: number; duplicateOfPosition: number }[] = [];

  for (const item of orderByPosition(items)) {
    const firstPosition = firstSeenByPlan.get(item.planId);
    if (firstPosition !== undefined) {
      duplicates.push({ position: item.position, duplicateOfPosition: firstPosition });
      continue;
    }
    firstSeenByPlan.set(item.planId, item.position);
  }

  return duplicates;
}

/** Determine which positions exceed the weekly open-request limit (GH-2), skipping exempt or already-refused items. */
export function openLimitRefusals(input: {
  sentThisWeek: number;
  weeklyLimit: number;
  items: readonly { position: number; refused: boolean; exempt: boolean }[];
}): number[] {
  const refusedPositions: number[] = [];
  let acceptedCount = 0;

  for (const item of orderByPosition(input.items)) {
    if (item.refused || item.exempt) continue;
    if (input.sentThisWeek + acceptedCount >= input.weeklyLimit) {
      refusedPositions.push(item.position);
      continue;
    }
    acceptedCount += 1;
  }

  return refusedPositions;
}

/** Derive ticket lifecycle status from all member request states. */
export function ticketStatusOf(states: readonly AccessRequestState[]): 'IN_PROGRESS' | 'DONE' {
  return states.every((state) => ENDED_STATE_SET.has(state)) ? 'DONE' : 'IN_PROGRESS';
}
