/**
 * The order a transaction that works on several seats takes them in (`docs/rules/database-business.md`, the rule of the loop over many seats): by subscription, then by
 * assignment, each compared as plain text (code unit by code unit), the way `ORDER BY id` of PostgreSQL orders lower case ids. One function for every loop, so two of them
 * can never take the same seats in two orders; a seat with no subscription comes first.
 */
export interface SeatLockKey {
  subscriptionId: string | null;
  assignmentId: string;
}

const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

export function compareSeatLockOrder(left: SeatLockKey, right: SeatLockKey): number {
  return (
    compareText(left.subscriptionId ?? '', right.subscriptionId ?? '') ||
    compareText(left.assignmentId, right.assignmentId)
  );
}
