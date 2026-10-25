/**
 * The check of the budget of a request (`US-06-12`, `FR-3.20`), as a pure judgement. It reads the figures it is given and
 * decides nothing about a person: it says what the result is for every year the request has a binding payment in, and
 * where the request goes. The check never approves or refuses (`SoD-6`); it only decides who looks next.
 *
 * Every year is judged alone, on the slice of the request that falls in it (`QĐ-84c`): a payment of 2 400 in 2026 and one in
 * 2027 are two checks, never 4 800 against the remaining of one year. A year with no budget says so — it is not a budget
 * of nothing (`QĐ-82l`). Two codes are about the data and not the budget, and nothing is routed past them (`QĐ-82d`).
 */

/** What one year says: the most serious of what applies is the one that is kept. */
export type YearCode = 'BUDGET_OK' | 'HIGH_VALUE' | 'INSUFFICIENT_BUDGET' | 'NO_ACTIVE_BUDGET';

/** Every code a check can give: a year's own, the two of the data, and the plan line. */
export type CheckCode = YearCode | 'CLOSED_OR_EXPIRED_BUDGET_PERIOD' | 'STALE_COST_EVIDENCE' | 'PLAN_LINE_OVERDUE';

/** The current budget of a Cost Center and year, with what is held and spent against it, in the reporting currency. */
export interface YearBudget {
  versionId: string;
  totalMinor: bigint;
  heldMinor: bigint;
  spentMinor: bigint;
  /** A request is high value when it is over this share of what is left, in whole percent. */
  highValuePercent: number;
  /** Or over this amount, whatever is left. */
  highValueAmountMinor: bigint | null;
}

/** What the request costs in one year, as the estimate that falls on the company, in the reporting currency. */
export interface YearSlice {
  year: number;
  costMinor: bigint;
  /** The year has ended: no budget is kept for it any more (`QĐ-82l`). */
  closed: boolean;
  budget: YearBudget | null;
  /** What the other requests of the Cost Center that wait to be decided cost in the year (`US-06-01` AC-9). */
  pendingMinor: bigint;
}

export interface CheckInput {
  slices: readonly YearSlice[];
  /** The quote the cost is taken from is no longer valid. */
  staleCostEvidence: boolean;
  /** The request is attached to a plan line whose purchase window has passed. */
  planLineOverdue: boolean;
}

export interface YearResult {
  year: number;
  costMinor: bigint;
  /** Null for a year that has ended: it is not judged. */
  code: YearCode | null;
  versionId: string | null;
  budgetMinor: bigint | null;
  heldMinor: bigint | null;
  spentMinor: bigint | null;
  /** The budget less what is held and spent; negative when more is held than the budget allows. Null without a budget. */
  remainingMinor: bigint | null;
  /** The cost as a share of what is left, in basis points; null when nothing is left to compare with. */
  shareBasisPoints: number | null;
  /** What the others that wait cost in the year, for the approver to see; not part of the judgement. Null for a year that has ended. */
  pendingMinor: bigint | null;
}

/** Where the request goes next: nowhere, to Finance, or straight to the spending approver. */
export type CheckRoute = 'BLOCKED' | 'FINANCE_REVIEW' | 'SPEND_APPROVAL';

export interface CheckResult {
  years: YearResult[];
  staleCostEvidence: boolean;
  periodClosed: boolean;
  planLineOverdue: boolean;
  route: CheckRoute;
}

const SEVERITY: Readonly<Record<YearCode, number>> = {
  BUDGET_OK: 0,
  HIGH_VALUE: 1,
  INSUFFICIENT_BUDGET: 2,
  NO_ACTIVE_BUDGET: 3,
};

function judgeYear(slice: YearSlice): YearResult {
  const base = { year: slice.year, costMinor: slice.costMinor };
  if (slice.closed) {
    return {
      ...base,
      code: null,
      versionId: null,
      budgetMinor: null,
      heldMinor: null,
      spentMinor: null,
      remainingMinor: null,
      shareBasisPoints: null,
      pendingMinor: null,
    };
  }
  const budget = slice.budget;
  if (!budget) {
    return {
      ...base,
      code: 'NO_ACTIVE_BUDGET',
      versionId: null,
      budgetMinor: null,
      heldMinor: null,
      spentMinor: null,
      remainingMinor: null,
      shareBasisPoints: null,
      pendingMinor: slice.pendingMinor,
    };
  }

  const remaining = budget.totalMinor - budget.heldMinor - budget.spentMinor;
  const share = remaining > 0n ? Number((slice.costMinor * 10_000n) / remaining) : null;
  let code: YearCode = 'BUDGET_OK';
  if (slice.costMinor > remaining) code = 'INSUFFICIENT_BUDGET';
  else if (
    slice.costMinor * 100n > BigInt(budget.highValuePercent) * remaining ||
    (budget.highValueAmountMinor !== null && slice.costMinor > budget.highValueAmountMinor)
  ) {
    code = 'HIGH_VALUE';
  }

  return {
    ...base,
    code,
    versionId: budget.versionId,
    budgetMinor: budget.totalMinor,
    heldMinor: budget.heldMinor,
    spentMinor: budget.spentMinor,
    remainingMinor: remaining,
    shareBasisPoints: share,
    pendingMinor: slice.pendingMinor,
  };
}

/**
 * The result of the check. A problem with the data (the quote has expired, a year has ended) sends the request nowhere: it
 * stays with its head, and nothing is created for Finance or the approver, since neither can mend it. Otherwise anything out
 * of the ordinary — a year that is not `BUDGET_OK`, or a plan line that is overdue — goes to Finance first.
 */
export function checkBudget(input: CheckInput): CheckResult {
  const years = input.slices.map(judgeYear);
  const periodClosed = input.slices.some((slice) => slice.closed);
  const blocked = periodClosed || input.staleCostEvidence;
  const ordinary = !input.planLineOverdue && years.every((year) => year.code === 'BUDGET_OK');
  const route: CheckRoute = blocked ? 'BLOCKED' : ordinary ? 'SPEND_APPROVAL' : 'FINANCE_REVIEW';

  return {
    years,
    staleCostEvidence: input.staleCostEvidence,
    periodClosed,
    planLineOverdue: input.planLineOverdue,
    route,
  };
}

/** Every code the result carries, the data first (`US-06-12` AC-9), then the plan line, then the years from the worst. */
export function codesOf(result: CheckResult): CheckCode[] {
  const codes: CheckCode[] = [];
  if (result.staleCostEvidence) codes.push('STALE_COST_EVIDENCE');
  if (result.periodClosed) codes.push('CLOSED_OR_EXPIRED_BUDGET_PERIOD');
  if (result.planLineOverdue) codes.push('PLAN_LINE_OVERDUE');
  const own = result.years
    .map((year) => year.code)
    .filter((code): code is YearCode => code !== null)
    .sort((a, b) => SEVERITY[b] - SEVERITY[a]);
  for (const code of own) if (!codes.includes(code)) codes.push(code);

  return codes;
}
