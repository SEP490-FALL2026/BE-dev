/**
 * What is left of the budget of the year after for the request the approver reads (`QĐ-111al`, R-15, R-46), as a pure decision. The
 * budget of the year after is the approved one (base and reserve); what is taken from it is what the approvals of the other requests
 * kept of that year (a right with no end included, R-46: the number kept is twelve months of the price of the day of the approval).
 * A request that takes more than what is left only warns: the approval is still made (the warning is soft).
 */
export interface NextYearBudgetFigures {
  year: number;
  /** Base and reserve of the approved version of the year after; null when the Cost Center has none. */
  approvedMinor: bigint | null;
  /** What the other requests approved as spend kept of that year in the Cost Center. */
  keptByOthersMinor: bigint;
  /** Live K2 seats running without a HELD commitment for that year. */
  runningUncommittedMinor?: bigint;
  /** What this request keeps of that year. */
  thisMinor: bigint;
}

export interface NextYearBudget {
  year: number;
  approvedMinor: bigint | null;
  /** The approved budget less what the others kept; negative when they kept more than the budget. */
  remainingMinor: bigint | null;
  /** What is left once this request is approved; negative when it takes more than what is left. */
  remainingAfterMinor: bigint | null;
  warning: boolean;
}

/** The figures of the year after for one request, or null when it keeps nothing of that year. */
export function nextYearBudgetOf(figures: NextYearBudgetFigures): NextYearBudget | null {
  if (figures.thisMinor <= 0n) return null;
  const { year, approvedMinor } = figures;
  if (approvedMinor === null) {
    return { year, approvedMinor: null, remainingMinor: null, remainingAfterMinor: null, warning: false };
  }
  const remainingMinor = approvedMinor - figures.keptByOthersMinor - (figures.runningUncommittedMinor ?? 0n);
  const remainingAfterMinor = remainingMinor - figures.thisMinor;

  return { year, approvedMinor, remainingMinor, remainingAfterMinor, warning: remainingAfterMinor < 0n };
}
