/** What kind of purchase a line of `BM-10` is (`QĐ-101n`). */
export type LineType = 'RENEW' | 'CHANGE' | 'NEW' | 'CANCEL';

/** The reduced zero-based-budget explanation of a line (`QĐ-94l`): four short answers. */
export interface ZbbExplanation {
  purpose: string;
  alternatives: string;
  consequenceIfNot: string;
  usageIndicator: string;
}

/** A line as the rules below read it; `position` is its place in what was sent, from 1. */
export interface RuledLine {
  position: number;
  lineType: LineType;
  priorityRank: number;
  amountMinor: bigint;
  seats: number | null;
  planId: string | null;
  zbb: ZbbExplanation | null;
  note: string | null;
}

/** The positions whose priority rank another line has too: a rank is given once (`QT 4.4`, `QT 4.5`). */
export function duplicateRankPositions(lines: readonly Pick<RuledLine, 'position' | 'priorityRank'>[]): number[] {
  const seen = new Map<number, number>();
  const positions = new Set<number>();
  for (const line of lines) {
    const first = seen.get(line.priorityRank);
    if (first === undefined) seen.set(line.priorityRank, line.position);
    else {
      positions.add(first);
      positions.add(line.position);
    }
  }

  return [...positions].sort((a, b) => a - b);
}

/** What the zero-based-budget rule reads besides the line itself (`QĐ-94l`, `BUDGET_ZBB_*`). */
export interface ZbbContext {
  /** The usage of what runs now, in percent, when it is known: the baseline has no figure until usage feeds it (`KPI-3`, W6). */
  kpi3: number | null;
  kpi3BelowPercent: number;
  priceIncreasePercent: number;
  /** The monthly price of a seat of a plan, as the baseline prices it, by plan id; a plan without one is absent. */
  monthlyPriceByPlan: ReadonlyMap<string, bigint>;
}

/**
 * Whether the unit price a line asks for is over the price of now by more than the threshold: seats and a monthly price are needed to say,
 * so a line without seats, without a plan, or for a plan with no monthly price (a one-time purchase) is not judged.
 */
export function priceRisesTooMuch(
  line: Pick<RuledLine, 'amountMinor' | 'seats' | 'planId'>,
  context: ZbbContext,
): boolean {
  if (line.planId === null || line.seats === null || line.seats <= 0) return false;
  const monthly = context.monthlyPriceByPlan.get(line.planId);
  if (monthly === undefined) return false;

  // amount / seats / 12 > monthly × (1 + percent / 100), in whole minor units.
  return line.amountMinor * 100n > monthly * BigInt(100 + context.priceIncreasePercent) * BigInt(line.seats) * 12n;
}

/**
 * The positions that must carry a zero-based-budget explanation and do not (`QĐ-94l`, `FR-5.15`(1)): every `NEW` line; every line when the
 * usage of what runs is known and below the threshold; and a line whose unit price rises over the threshold.
 */
export function zbbMissingPositions(lines: readonly RuledLine[], context: ZbbContext): number[] {
  const lowUsage = context.kpi3 !== null && context.kpi3 < context.kpi3BelowPercent;

  return lines
    .filter((line) => line.zbb === null && (line.lineType === 'NEW' || lowUsage || priceRisesTooMuch(line, context)))
    .map((line) => line.position);
}

/**
 * The part of each line that makes the proposal go over the ceiling of the department (`US-06-10` AC-20, `R-I05`): the lines are taken by
 * priority rank, adding up; the first one that carries the total over the ceiling is flagged with the excess, and every line after it with
 * its whole amount. A department with no ceiling flags nothing. This is never a reason to refuse the proposal.
 */
export function overCeilingParts(
  lines: readonly Pick<RuledLine, 'position' | 'priorityRank' | 'amountMinor'>[],
  ceilingMinor: bigint | null,
): Map<number, bigint> {
  const flagged = new Map<number, bigint>();
  if (ceilingMinor === null) return flagged;
  let running = 0n;
  for (const line of [...lines].sort((a, b) => a.priorityRank - b.priorityRank)) {
    const before = running;
    running += line.amountMinor;
    if (running <= ceilingMinor) continue;
    const over = before >= ceilingMinor ? line.amountMinor : running - ceilingMinor;
    if (over > 0n) flagged.set(line.position, over);
  }

  return flagged;
}

/** The flagged positions that give no note: a line that carries the proposal over the ceiling says why (`QT 4.4`). */
export function overCeilingNoteMissing(
  lines: readonly Pick<RuledLine, 'position' | 'note'>[],
  flagged: ReadonlyMap<number, bigint>,
): number[] {
  return lines
    .filter((line) => flagged.has(line.position) && (line.note === null || line.note.trim() === ''))
    .map((line) => line.position);
}
