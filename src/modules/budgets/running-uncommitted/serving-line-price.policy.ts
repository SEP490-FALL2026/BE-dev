/** What a budget reads of a line of a period to price a seat: the plan it serves, its monthly price and whether it still serves. */
export interface PricedLine {
  planId: string;
  monthlyUnitPriceMinor: bigint;
  closedReason: 'RENEWED' | 'ENDED' | 'REMOVED' | null;
  createdAt: Date;
}

/**
 * The line of a period that serves `planId`: the live one first and otherwise the one closed last; a line taken away (`REMOVED`) never
 * serves. Null when the period has no such line.
 */
export function servingLineOf<T extends PricedLine>(lines: readonly T[], planId: string): T | null {
  const ofPlan = lines.filter((line) => line.closedReason !== 'REMOVED' && line.planId === planId);

  return (
    ofPlan.find((line) => line.closedReason === null) ??
    [...ofPlan].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ??
    null
  );
}

/**
 * The monthly price of a seat of `planId` on a period: the price of the line of the period that serves the plan (`servingLineOf`). The
 * price columns of a period that has lines are only a record (a line is edited through the line), so they price a seat only when the
 * period has no line at all. A period with lines and none of them for the plan has no price for it (null).
 */
export function servingMonthlyPriceMinor(
  lines: readonly PricedLine[],
  planId: string,
  periodMonthlyPriceMinor: bigint | null,
): bigint | null {
  if (lines.every((line) => line.closedReason === 'REMOVED')) return periodMonthlyPriceMinor;

  return servingLineOf(lines, planId)?.monthlyUnitPriceMinor ?? null;
}
