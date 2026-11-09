import {
  SubscriptionBillingCycleUnsupportedError,
  SubscriptionBillingLongerThanCommitmentError,
  SubscriptionCommitmentTermNotAllowedError,
  SubscriptionCommitmentTermRequiredError,
  SubscriptionK1MonthlyOnlyError,
  SubscriptionResponsibleRequiredError,
} from '../subscription.errors';
import type {
  BillingCycle,
  DeclarableBillingCycle,
  ProvisioningType,
  SubscriptionKind,
  SubscriptionWarning,
} from '../subscription.types';

export interface PoolTermsInput {
  kind: SubscriptionKind;
  planProvisioningType: ProvisioningType;
  billingCycle: BillingCycle | null;
  commitmentTermMonths: number | null;
  /** The subscription is becoming active with this write: a new one that is complete, or a draft that was just completed. */
  activating: boolean;
}

const DECLARABLE_CYCLES: readonly string[] = ['MONTHLY', 'ANNUAL'] satisfies readonly DeclarableBillingCycle[];

/** A new write names only a monthly or an annual billing cycle (`Q-09`); `QUARTERLY` and `OTHER` stay readable on data written earlier. */
export function assertDeclarableCycle(billingCycle: string | undefined): void {
  if (billingCycle !== undefined && !DECLARABLE_CYCLES.includes(billingCycle)) {
    throw new SubscriptionBillingCycleUnsupportedError(billingCycle);
  }
}

/**
 * The rules of the shared pool on a write (`QĐ-103e`, `QĐ-104d`(3), R-E01, R-G01), in a fixed order: a perpetual purchase commits to no
 * term; paying by the year for a commitment of one month is refused; a K1 plan is for one month and paid by the month; a term that
 * becomes active names its commitment. Throws the first that fails. Data older than the rules is not judged by a write that does not
 * touch these fields: the caller says when to call this.
 */
export function assertPoolTerms(input: PoolTermsInput): void {
  if (input.kind === 'PERPETUAL') {
    if (input.commitmentTermMonths !== null) throw new SubscriptionCommitmentTermNotAllowedError();

    return;
  }
  if (input.commitmentTermMonths === 1 && input.billingCycle === 'ANNUAL') {
    throw new SubscriptionBillingLongerThanCommitmentError();
  }
  if (input.planProvisioningType === 'K1') {
    const longer = input.commitmentTermMonths !== null && input.commitmentTermMonths !== 1;
    const notMonthly = input.billingCycle !== null && input.billingCycle !== 'MONTHLY';
    if (longer || notMonthly) throw new SubscriptionK1MonthlyOnlyError();
  }
  if (input.activating && input.commitmentTermMonths === null) throw new SubscriptionCommitmentTermRequiredError();
}

/** An active subscription names the IT Admin who answers for it (`QĐ-103v`(4)). */
export function assertResponsibleNamed(responsibleItAdminEmployeeId: string | null, activating: boolean): void {
  if (activating && responsibleItAdminEmployeeId === null) throw new SubscriptionResponsibleRequiredError();
}

/** The data-quality warnings of a stored subscription that come from data written before the shared-pool rules. */
export function poolWarnings(record: {
  status: 'DRAFT' | 'ACTIVE';
  billingCycle: BillingCycle | null;
  responsibleItAdminEmployeeId: string | null;
}): SubscriptionWarning[] {
  const warnings: SubscriptionWarning[] = [];
  if (record.status === 'ACTIVE' && record.responsibleItAdminEmployeeId === null) warnings.push('RESPONSIBLE_MISSING');
  if (record.billingCycle === 'QUARTERLY' || record.billingCycle === 'OTHER') warnings.push('BILLING_CYCLE_LEGACY');

  return warnings;
}

/** A live priced subscription of a plan, as far as choosing which of them gives the plan its price needs. */
export interface PriceSource {
  id: string;
  /** The flag that says this subscription prices the plan when there are several (`Q-04`). */
  isPrimaryForPlan: boolean;
  unitPriceMinor: bigint;
  billingCycle: BillingCycle;
  startDate: string | null;
}

/** The months a billing cycle spans; null for a cycle that cannot be counted in months. */
const CYCLE_MONTHS: Readonly<Record<BillingCycle, number | null>> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  ANNUAL: 12,
  OTHER: null,
};

/**
 * The subscription that gives a plan its price (`Q-04` C, `BR-MF1-07`): the one flagged `is_primary_for_plan`; with no flag, the one with
 * the highest price a month (the price over the months of its cycle, compared without rounding; a cycle that is not in months comes last);
 * on a tie the older `start_date` (none last), then the smaller id. Null when there is none.
 */
export function pickPriceSource<T extends PriceSource>(sources: readonly T[]): T | null {
  const primary = sources.find((source) => source.isPrimaryForPlan);
  if (primary) return primary;

  return [...sources].sort(compareSources)[0] ?? null;
}

/** Highest price a month first, then the older start date (none last), then the smaller id. */
function compareSources(a: PriceSource, b: PriceSource): number {
  return comparePrice(a, b) || compareStart(a.startDate, b.startDate) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function comparePrice(a: PriceSource, b: PriceSource): number {
  const am = CYCLE_MONTHS[a.billingCycle];
  const bm = CYCLE_MONTHS[b.billingCycle];
  if (am === null || bm === null) return am === bm ? 0 : am === null ? 1 : -1;
  // a.unit / am versus b.unit / bm, as a.unit * bm versus b.unit * am: both months are positive.
  const left = a.unitPriceMinor * BigInt(bm);
  const right = b.unitPriceMinor * BigInt(am);

  return left === right ? 0 : left > right ? -1 : 1;
}

function compareStart(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  return a < b ? -1 : 1;
}
