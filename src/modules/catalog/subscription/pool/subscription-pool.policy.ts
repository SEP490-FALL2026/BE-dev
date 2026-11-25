import { fromDateColumn, type BusinessDate } from '../../../../core/business-date';
import {
  SubscriptionBillingCycleUnsupportedError,
  SubscriptionBillingLongerThanCommitmentError,
  SubscriptionCommitmentTermNotAllowedError,
  SubscriptionCommitmentTermRequiredError,
  SubscriptionK1MonthlyOnlyError,
  SubscriptionK4PerpetualOnlyError,
  SubscriptionMembersMonthlyOnlyError,
  SubscriptionMembersPaymentDayRequiredError,
  SubscriptionResponsibleRequiredError,
  SubscriptionVendorAdminsRequiredError,
} from '../subscription.errors';
import type {
  BillingCycle,
  DeclarableBillingCycle,
  ProvisioningType,
  SeatCounting,
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
  /** How the seats are counted and the payment day of a subscription counted by its members (W3-11); left out, the rules of a fixed count apply. */
  seatCounting?: SeatCounting | undefined;
  renewalDate?: string | null | undefined;
}

const DECLARABLE_CYCLES: readonly string[] = ['MONTHLY', 'ANNUAL'] satisfies readonly DeclarableBillingCycle[];

/**
 * The IT Admin a new subscription answers to (`QĐ-111g`, `BB-3`): the one the declaration names, else the IT Admin responsible for its
 * application while they are still a usable IT Admin (the test of `IdentityAccessApi.findUsableItAdminEmployeeIds`), else nobody. Only a
 * declaration is judged here, never a subscription that exists; the rule that an active one names somebody is `assertResponsibleNamed`.
 */
export function defaultResponsibleOf(input: {
  named: string | undefined;
  applicationResponsible: string | null;
  applicationResponsibleIsUsable: boolean;
}): string | null {
  if (input.named !== undefined) return input.named;

  return input.applicationResponsible !== null && input.applicationResponsibleIsUsable
    ? input.applicationResponsible
    : null;
}

/** A new write names only a monthly or an annual billing cycle (`Q-09`); `QUARTERLY` and `OTHER` stay readable on data written earlier. */
export function assertDeclarableCycle(billingCycle: string | undefined): void {
  if (billingCycle !== undefined && !DECLARABLE_CYCLES.includes(billingCycle)) {
    throw new SubscriptionBillingCycleUnsupportedError(billingCycle);
  }
}

/** What the kind of provisioning says of a term: a K4 plan is bought once, never a term (`B-5`); a K1 plan is for one month and paid by the month (R-E01). */
function assertTermOfKind(input: PoolTermsInput): void {
  if (input.planProvisioningType === 'K4') throw new SubscriptionK4PerpetualOnlyError();
  if (input.planProvisioningType === 'K1') {
    const longer = input.commitmentTermMonths !== null && input.commitmentTermMonths !== 1;
    const notMonthly = input.billingCycle !== null && input.billingCycle !== 'MONTHLY';
    if (longer || notMonthly) throw new SubscriptionK1MonthlyOnlyError();
  }
}

/**
 * The rules of the shared pool on a write (`QĐ-103e`, `QĐ-104d`(3), R-E01, R-G01), in a fixed order: a perpetual purchase commits to no
 * term; paying by the year for a commitment of one month is refused; a K1 plan is for one month and paid by the month; a term that
 * becomes active names its commitment; a K4 plan is bought once, so only a perpetual purchase is written for it (`B-5`). Throws the first that fails. Data older than the rules is not judged by a write that does not
 * touch these fields: the caller says when to call this.
 */
export function assertPoolTerms(input: PoolTermsInput): void {
  if (input.kind === 'PERPETUAL') {
    if (input.commitmentTermMonths !== null) throw new SubscriptionCommitmentTermNotAllowedError();

    return;
  }
  assertMembersTerms(input);
  if (input.commitmentTermMonths === 1 && input.billingCycle === 'ANNUAL') {
    throw new SubscriptionBillingLongerThanCommitmentError();
  }
  assertTermOfKind(input);
  if (input.activating && input.commitmentTermMonths === null) throw new SubscriptionCommitmentTermRequiredError();
}

/**
 * A subscription counted by the members the vendor counts (`MEMBERS`, `QĐ-115g`) commits for one month only, and once active names its payment day in
 * `renewalDate`. A fixed count is judged by nothing here. Throws SubscriptionMembersMonthlyOnlyError, SubscriptionMembersPaymentDayRequiredError.
 */
function assertMembersTerms(input: PoolTermsInput): void {
  if (input.seatCounting !== 'MEMBERS') return;
  if (input.commitmentTermMonths !== null && input.commitmentTermMonths !== 1) {
    throw new SubscriptionMembersMonthlyOnlyError();
  }
  if (input.activating && (input.renewalDate ?? null) === null) throw new SubscriptionMembersPaymentDayRequiredError();
}

/** An active subscription names the IT Admin who answers for it (`QĐ-103v`(4)). */
export function assertResponsibleNamed(responsibleItAdminEmployeeId: string | null, activating: boolean): void {
  if (activating && responsibleItAdminEmployeeId === null) throw new SubscriptionResponsibleRequiredError();
}

/** The fewest different working IT Admins at the vendor a plan that needs them has before it is activated. */
const MIN_RECORDED_VENDOR_ADMINS = 2;

/**
 * A subscription of a plan that needs admins at the vendor (`K2`, or `K4` with an admin console) is not activated, nor a pool made, while
 * fewer than two different IT Admins who administer it at the vendor are still working (outside the open seat-baseline phase). Throws
 * SubscriptionVendorAdminsRequiredError.
 */
export function assertVendorAdminsRecorded(input: { needs: boolean; given: number; planId: string }): void {
  if (input.needs && input.given < MIN_RECORDED_VENDOR_ADMINS) {
    throw new SubscriptionVendorAdminsRequiredError(input.planId, input.given, MIN_RECORDED_VENDOR_ADMINS);
  }
}

/**
 * What a reader sees of the vendor admins of a subscription, never a refusal (`QĐ-110k`, `QĐ-110u`): fewer than two of the admins recorded still
 * work, and no email of the company account that owns the plan at the vendor is recorded. A plan that needs no admins raises neither; a
 * subscription older than the rule has the flags and nothing blocks it.
 */
export function vendorAdminFlags(input: {
  needs: boolean;
  admins: ReadonlyArray<{ employeeId: string; working: boolean }>;
  ownerAccountEmail: string | null;
}): { vendorAdminsBelowMinimum: boolean; ownerAccountEmailMissing: boolean } {
  if (!input.needs) return { vendorAdminsBelowMinimum: false, ownerAccountEmailMissing: false };
  const working = new Set(input.admins.filter((admin) => admin.working).map((admin) => admin.employeeId)).size;

  return {
    vendorAdminsBelowMinimum: working < MIN_RECORDED_VENDOR_ADMINS,
    ownerAccountEmailMissing: input.ownerAccountEmail === null,
  };
}

/**
 * A subscription as someone who is not an IT Admin reads it (Finance reads subscriptions too, SPEC P19): who administers the plan at the vendor, the email
 * of the company account that owns it there and the note are the IT Admin's alone, so they are emptied; the shape and the two flags stay.
 */
export function withoutVendorAdminDetail<
  T extends { vendorAdmins: unknown[]; ownerAccountEmail: string | null; adminNote: string | null },
>(view: T): T {
  return { ...view, vendorAdmins: [], ownerAccountEmail: null, adminNote: null };
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
  /** The unit price converted to the reporting currency when it was recorded: what prices in different currencies are compared by. */
  reportingPriceMinor?: bigint | null;
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
 * the highest price a month in the reporting currency (the converted price over the months of its cycle, compared without rounding; a price
 * not converted comes after the converted ones, a cycle that is not in months last); on a tie the older `start_date` (none last), then the
 * smaller id. Null when there is none.
 */
export function pickPriceSource<T extends PriceSource>(sources: readonly T[]): T | null {
  const primary = sources.find((source) => source.isPrimaryForPlan);
  if (primary) return primary;

  return [...sources].sort(compareSources)[0] ?? null;
}

/**
 * The subscriptions of a plan in the order a grant that names none takes them: the one flagged primary first, then the rest as `pickPriceSource`
 * would rank them (the highest price a month, the older start, the smaller id). A subscription with no price comes after those with one.
 */
export function orderBySourcePreference<T extends PriceSource>(sources: readonly T[]): T[] {
  return [...sources].sort((a, b) => Number(b.isPrimaryForPlan) - Number(a.isPrimaryForPlan) || compareSources(a, b));
}

/** Highest price a month first, then the older start date (none last), then the smaller id. */
function compareSources(a: PriceSource, b: PriceSource): number {
  return comparePrice(a, b) || compareStart(a.startDate, b.startDate) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** One that has it first: -1 when only `a` has it, 1 when only `b` does, 0 when both or neither do. */
const presentFirst = (a: boolean, b: boolean): number => (a === b ? 0 : a ? -1 : 1);

function comparePrice(a: PriceSource, b: PriceSource): number {
  const am = CYCLE_MONTHS[a.billingCycle];
  const bm = CYCLE_MONTHS[b.billingCycle];
  if (am === null || bm === null) return presentFirst(am !== null, bm !== null);
  // Prices in two currencies compare only once converted: a converted one comes before one that is not, two that are not compare as recorded.
  const ar = a.reportingPriceMinor ?? null;
  const br = b.reportingPriceMinor ?? null;
  const converted = presentFirst(ar !== null, br !== null);
  if (converted !== 0) return converted;
  // a.unit / am versus b.unit / bm, as a.unit * bm versus b.unit * am: both months are positive.
  const left = (ar ?? a.unitPriceMinor) * BigInt(bm);
  const right = (br ?? b.unitPriceMinor) * BigInt(am);

  return left === right ? 0 : left > right ? -1 : 1;
}

function compareStart(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  return a < b ? -1 : 1;
}

/** What decides whether a subscription is still alive for the rule against duplicates: its state, its end and whether a later period continues it. */
export interface LivenessFacts {
  id: string;
  planId: string;
  status: 'DRAFT' | 'ACTIVE';
  kind: SubscriptionKind;
  endDate: string | null;
  /** A later period continues it (it was renewed): the period that continues it is the live one. */
  renewed: boolean;
}

/**
 * Whether the subscription still holds the pool of its plan on `today` (`QĐ-104k`(3), R-E02): a draft does (it is about to be active); an active
 * one does until a later period continues it, or its end date has passed. A perpetual purchase has no end.
 */
export function isLiveSubscription(row: LivenessFacts, today: string): boolean {
  if (row.status === 'DRAFT') return true;
  if (row.renewed) return false;

  return row.kind === 'PERPETUAL' || row.endDate === null || row.endDate >= today;
}

/** The live subscriptions by plan, each list in the order given. */
export function liveIdsByPlan(rows: readonly LivenessFacts[], today: string): Map<string, string[]> {
  const live = new Map<string, string[]>();
  for (const row of rows) {
    if (isLiveSubscription(row, today)) live.set(row.planId, [...(live.get(row.planId) ?? []), row.id]);
  }

  return live;
}

/** The other live subscriptions of the plan than `selfId` (a subscription being written has none yet: pass null). */
export function liveSiblingsOf(live: ReadonlyMap<string, readonly string[]>, planId: string, selfId: string | null) {
  return (live.get(planId) ?? []).filter((id) => id !== selfId);
}

/** Only the plans whose seats are one pool (K2 workspaces and K4 keys) have the rule against a second subscription. */
export function isPooledPlan(type: ProvisioningType): boolean {
  return type === 'K2' || type === 'K4';
}

/**
 * Leaves out of `rows`, the subscriptions that grant seats on `today`, every period recorded ahead of its start whose previous period is among
 * them. The period that runs and the next one are one pool: the seats carried to the next period are the seats of the one that runs, and the
 * next adds none that can be given before it runs, so the pool counts them once (`QĐ-111n`: seats are counted, never subscription records).
 * A next period whose previous one is not in `rows` (it is over, or another IT Admin answers for it) stays: the pool lives on it. One reading
 * for the stock of a grant, the stock summary and the rules of wasted seats.
 */
export function withoutPeriodsAhead<T extends { id: string; renewedFromId: string | null; startDate: Date | null }>(
  rows: readonly T[],
  today: BusinessDate,
): T[] {
  const ids = new Set(rows.map((row) => row.id));

  return rows.filter(
    (row) =>
      !(
        row.renewedFromId !== null &&
        ids.has(row.renewedFromId) &&
        row.startDate !== null &&
        fromDateColumn(row.startDate) > today
      ),
  );
}
