/**
 * The check of the budget of a request (`US-06-12`, `FR-3.20`, `BR-MF1-06e..g`), as a pure judgement. It reads the figures it is given and
 * decides nothing about a person: it says which of three outcomes the request has on the one year it falls in. The check never approves or
 * refuses (`SoD-6`); it only says whether the request goes to the spending approver, waits for the head to confirm the reserve, or stops.
 *
 * The base and the reserve of the approved version are the two levels: what is left of the base is the base less what is spent, held and
 * waiting to be decided; what is left with the reserve adds the reserve (it may be negative). Nothing here asks for an override, a review
 * of Finance or a line of the plan: none of them exists any more (`QĐ-97c`, `QĐ-101n`).
 */

/** What one year says. `HIGH_VALUE` is never given any more (`QĐ-97c`); it stays so that a check made before that rule still reads. */
export type YearCode = 'BUDGET_OK' | 'HIGH_VALUE' | 'INSUFFICIENT_BUDGET' | 'NO_ACTIVE_BUDGET';

/** Every code a check can carry: a year's own, and the two codes of the data that checks made before still have. */
export type CheckCode = YearCode | 'CLOSED_OR_EXPIRED_BUDGET_PERIOD' | 'STALE_COST_EVIDENCE';

/** The three outcomes of a check (`BR-MF1-06g`). */
export type BudgetOutcome = 'WITHIN_BASE' | 'USES_RESERVE' | 'BLOCKED';

/**
 * Why a request is blocked: every reason that applies is kept (`US-06-12` AC-9). The price is the quote of the proposal only: the plans have
 * no end date of their price in the model (S1-08), so `PRICE_EXPIRED` is about a quote that is no longer valid.
 */
export type BlockReason = 'PRICE_EXPIRED' | 'NO_APPROVED_BUDGET' | 'OVER_RESERVE';

/** Where the request goes next: nowhere (blocked), or to the spending approver. `FINANCE_REVIEW` is read from checks made before. */
export type CheckRoute = 'BLOCKED' | 'FINANCE_REVIEW' | 'SPEND_APPROVAL';

/** The approved version of a Cost Center and year, with what is held and spent against it, in the reporting currency. */
export interface YearBudget {
  versionId: string;
  baseMinor: bigint;
  reserveMinor: bigint;
  heldMinor: bigint;
  spentMinor: bigint;
}

/** What the request costs in its one year, in the reporting currency, with the budget of that year and what waits to be decided. */
export interface YearSlice {
  year: number;
  costMinor: bigint;
  /** Null when the Cost Center has no approved version for the year. */
  budget: YearBudget | null;
  /** What the other requests of the Cost Center that wait to be decided cost in the year (`BR-MF1-06f`). */
  pendingMinor: bigint;
}

export interface CheckInput {
  slice: YearSlice;
  /** The quote the cost is taken from is no longer valid. */
  priceExpired: boolean;
}

export interface YearResult {
  year: number;
  costMinor: bigint;
  code: YearCode | null;
  versionId: string | null;
  /** Base and reserve together (what the old checks called the budget). Null without an approved version. */
  budgetMinor: bigint | null;
  baseMinor: bigint | null;
  reserveMinor: bigint | null;
  heldMinor: bigint | null;
  spentMinor: bigint | null;
  /** What is left with the reserve; negative when more is held than base and reserve allow. Null without an approved version. */
  remainingMinor: bigint | null;
  remainingBaseMinor: bigint | null;
  remainingWithReserveMinor: bigint | null;
  /** The cost as a share of what is left with the reserve, in basis points; null when nothing is left to compare with. */
  shareBasisPoints: number | null;
  /** What the others that wait cost in the year, for the approver to see. */
  pendingMinor: bigint | null;
}

export interface CheckResult {
  years: YearResult[];
  outcome: BudgetOutcome;
  /** In the order data first (the quote), then the budget; empty unless the outcome is `BLOCKED`. */
  blockReasons: BlockReason[];
  /** How much the cost is over what is left of the base; set when the outcome uses the reserve or is blocked for being over the reserve. */
  overBaseByMinor: bigint | null;
  /** How much the cost is over what is left with the reserve; set when `OVER_RESERVE` is a reason. */
  overByMinor: bigint | null;
  staleCostEvidence: boolean;
  route: CheckRoute;
}

const SEVERITY: Readonly<Record<YearCode, number>> = {
  BUDGET_OK: 0,
  HIGH_VALUE: 1,
  INSUFFICIENT_BUDGET: 2,
  NO_ACTIVE_BUDGET: 3,
};

function withoutBudget(slice: YearSlice): YearResult {
  return {
    year: slice.year,
    costMinor: slice.costMinor,
    code: 'NO_ACTIVE_BUDGET',
    versionId: null,
    budgetMinor: null,
    baseMinor: null,
    reserveMinor: null,
    heldMinor: null,
    spentMinor: null,
    remainingMinor: null,
    remainingBaseMinor: null,
    remainingWithReserveMinor: null,
    shareBasisPoints: null,
    pendingMinor: slice.pendingMinor,
  };
}

/** The year with a budget: both levels of what is left, and the code (`INSUFFICIENT_BUDGET` is being over the reserve). */
function judgeYear(slice: YearSlice, budget: YearBudget): YearResult {
  const remainingBase = budget.baseMinor - budget.spentMinor - budget.heldMinor - slice.pendingMinor;
  const remainingWithReserve = remainingBase + budget.reserveMinor;
  const over = slice.costMinor > 0n && slice.costMinor > remainingWithReserve;

  return {
    year: slice.year,
    costMinor: slice.costMinor,
    code: over ? 'INSUFFICIENT_BUDGET' : 'BUDGET_OK',
    versionId: budget.versionId,
    budgetMinor: budget.baseMinor + budget.reserveMinor,
    baseMinor: budget.baseMinor,
    reserveMinor: budget.reserveMinor,
    heldMinor: budget.heldMinor,
    spentMinor: budget.spentMinor,
    remainingMinor: remainingWithReserve,
    remainingBaseMinor: remainingBase,
    remainingWithReserveMinor: remainingWithReserve,
    shareBasisPoints: remainingWithReserve > 0n ? Number((slice.costMinor * 10_000n) / remainingWithReserve) : null,
    pendingMinor: slice.pendingMinor,
  };
}

/**
 * The result of the check. A request that costs nothing this year (a request to go on using whose new period begins next year, `QĐ-109b`)
 * is never over anything: it is within the base whatever is left, even when that is negative (`A5-2`), and is blocked only when the year has
 * no approved version or the quote is no longer valid.
 */
export function checkBudget(input: CheckInput): CheckResult {
  const { slice } = input;
  const year = slice.budget ? judgeYear(slice, slice.budget) : withoutBudget(slice);
  const blockReasons = blockReasonsOf(year, input.priceExpired);
  // A cost of nothing is over nothing, whatever is left.
  const overBase = over(slice.costMinor, year.remainingBaseMinor);
  const outcome: BudgetOutcome =
    blockReasons.length > 0 ? 'BLOCKED' : overBase !== null ? 'USES_RESERVE' : 'WITHIN_BASE';

  return {
    years: [year],
    outcome,
    blockReasons,
    overBaseByMinor: overBase,
    overByMinor: blockReasons.includes('OVER_RESERVE') ? over(slice.costMinor, year.remainingWithReserveMinor) : null,
    staleCostEvidence: input.priceExpired,
    route: outcome === 'BLOCKED' ? 'BLOCKED' : 'SPEND_APPROVAL',
  };
}

/** How much `cost` is over `left`; null when it is not over, when nothing is left to compare with, and always for a cost of nothing. */
function over(cost: bigint, left: bigint | null): bigint | null {
  return cost > 0n && left !== null && cost > left ? cost - left : null;
}

/** Every reason the request is blocked, the data (the quote) first, then the budget. */
function blockReasonsOf(year: YearResult, priceExpired: boolean): BlockReason[] {
  const reasons: BlockReason[] = [];
  if (priceExpired) reasons.push('PRICE_EXPIRED');
  if (year.code === 'NO_ACTIVE_BUDGET') reasons.push('NO_APPROVED_BUDGET');
  if (year.code === 'INSUFFICIENT_BUDGET') reasons.push('OVER_RESERVE');

  return reasons;
}

/** Every code the result carries, the data first (`US-06-12` AC-9), then the year from the worst. */
export function codesOf(
  result: Pick<CheckResult, 'years' | 'staleCostEvidence'> & { periodClosed?: boolean },
): CheckCode[] {
  const codes: CheckCode[] = [];
  if (result.staleCostEvidence) codes.push('STALE_COST_EVIDENCE');
  if (result.periodClosed) codes.push('CLOSED_OR_EXPIRED_BUDGET_PERIOD');
  const own = result.years
    .map((year) => year.code)
    .filter((code): code is YearCode => code !== null)
    .sort((a, b) => SEVERITY[b] - SEVERITY[a]);
  for (const code of own) if (!codes.includes(code)) codes.push(code);

  return codes;
}
