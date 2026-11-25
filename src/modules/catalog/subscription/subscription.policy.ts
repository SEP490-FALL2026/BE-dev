import { addDays, type BusinessDate } from '../../../core/business-date';
import { DONG, type Money } from '../../../core/money/money';
import { isPricedInDong } from './price/subscription-price.policy';
import {
  SubscriptionDatesInvalidError,
  SubscriptionK1HasNoSubscriptionError,
  SubscriptionMidTermReductionNotAllowedError,
  SubscriptionPerpetualHasNoTermError,
  SubscriptionPerpetualIsLicenseLotError,
  SubscriptionPerpetualNeedsLicensedApplicationError,
  SubscriptionPlanHasNoSubscriptionError,
  SubscriptionPriceMismatchError,
  SubscriptionPrimaryRetiredError,
  SubscriptionQuantityReasonRequiredError,
  SubscriptionSeatCountViaLedgerError,
  SubscriptionVersionRequiredError,
} from './subscription.errors';
import type {
  ApplicationKind,
  BillingCycle,
  MissingItem,
  NoticeSource,
  PlanKeyBinding,
  PlanPricingModel,
  ProvisioningType,
  SeatCounting,
  SubscriptionKind,
  SubscriptionStatus,
  SubscriptionWarning,
} from './subscription.types';

export interface NoticeInput {
  kind: SubscriptionKind;
  noticeDeadline: BusinessDate | null;
  noticePeriodDays: number | null;
  renewalDate: BusinessDate | null;
  endDate: BusinessDate | null;
  autoRenew: boolean;
}

export interface NoticeResult {
  source: NoticeSource;
  /** The deadline to cancel: declared, or inferred from the notice period; null when there is none. */
  deadline: BusinessDate | null;
  /** The date the alerts count back from: the deadline, or the end date when the source is `BY_END_DATE`. */
  baseDate: BusinessDate | null;
}

/**
 * The table that picks the milestone (`US-04-03`, `FR-1.4`, `QĐ-62l`): a declared deadline is used; without one, a notice
 * period infers it from the renewal date (else the end date) and marks it unconfirmed; with neither, a subscription that
 * does not renew itself takes its end date, and one that does is not guessed. A perpetual purchase has no milestone.
 */
export function deriveNotice(input: NoticeInput): NoticeResult {
  if (input.kind === 'PERPETUAL') return { source: 'NOT_APPLICABLE', deadline: null, baseDate: null };
  if (input.noticeDeadline !== null) {
    return { source: 'DECLARED', deadline: input.noticeDeadline, baseDate: input.noticeDeadline };
  }

  const anchor = input.renewalDate ?? input.endDate;
  if (input.noticePeriodDays !== null && anchor !== null) {
    const deadline = addDays(anchor, -input.noticePeriodDays);

    return { source: 'INFERRED_UNCONFIRMED', deadline, baseDate: deadline };
  }
  if (!input.autoRenew && input.endDate !== null) {
    return { source: 'BY_END_DATE', deadline: null, baseDate: input.endDate };
  }

  return { source: 'MISSING', deadline: null, baseDate: null };
}

/** A data-quality warning when there is no date to alert from; never a guessed date (`OQ-B-07`). */
export function noticeWarnings(source: NoticeSource): SubscriptionWarning[] {
  return source === 'MISSING' ? ['NO_ALERT_ANCHOR'] : [];
}

/**
 * The alert dates of a subscription are the days it needs the IT Admin (`FR-8.2`): the point of adjustment, and for a plan by the year
 * the red alert after it. A subscription with no point of adjustment (a purchase made once, a draft, a period a later one continues,
 * no date to count from) has none.
 */
export function alertDates(
  adjustment: { point: BusinessDate; redAlertOn: BusinessDate | null } | null,
): BusinessDate[] {
  if (adjustment === null) return [];

  return adjustment.redAlertOn === null ? [adjustment.point] : [adjustment.point, adjustment.redAlertOn];
}

export interface CompletenessInput {
  kind: SubscriptionKind;
  planPricingModel: PlanPricingModel | null;
  quantity: number | null;
  startDate: BusinessDate | null;
  billingCycle: string | null;
  /** The unit price is entered in dong with its snapshot (`isPricedInDong`): a price left in another currency is no price. */
  hasPrice: boolean;
}

/**
 * What keeps a subscription a draft, in a fixed order. A per-seat plan and a perpetual purchase need a quantity; a
 * term subscription needs a billing cycle; any needs a start (purchase) date and a price in dong (`QĐ-111an`: no exchange rate is
 * asked for, so none can be missing).
 */
export function missingData(input: CompletenessInput): MissingItem[] {
  const missing: MissingItem[] = [];
  if (input.quantity === null && (input.planPricingModel === 'PER_SEAT' || input.kind === 'PERPETUAL')) {
    missing.push('QUANTITY');
  }
  if (input.startDate === null) missing.push('START_DATE');
  if (input.kind === 'TERM' && input.billingCycle === null) missing.push('BILLING_CYCLE');
  if (!input.hasPrice) missing.push('UNIT_PRICE');

  return missing;
}

export interface ShapeInput {
  kind: SubscriptionKind;
  applicationKind: ApplicationKind;
  planProvisioningType: ProvisioningType;
  /** How the K4 plan is bound; a plan bundled with the machine is not bought, so it has no subscription. Absent where the plan is not at hand. */
  planKeyBinding?: PlanKeyBinding | null;
  startDate: BusinessDate | null;
  endDate: BusinessDate | null;
  renewalDate: BusinessDate | null;
  noticeDeadline: BusinessDate | null;
  noticePeriodDays: number | null;
  billingCycle: string | null;
  autoRenew: boolean;
  allowsMidTermReduction: boolean;
}

/**
 * The rules a subscription meets whatever its state, in a fixed order: a K5 plan has none; a perpetual purchase belongs
 * to licensed software or to a K4 plan (the plan bought once, `B-5`) and carries no term; the dates are in order. Throws the first that fails.
 */
export function assertSubscriptionShape(input: ShapeInput): void {
  if (input.planProvisioningType === 'K5') throw new SubscriptionPlanHasNoSubscriptionError();
  if (input.planKeyBinding === 'DEVICE_BUNDLED') throw new SubscriptionPlanHasNoSubscriptionError();
  if (input.kind === 'PERPETUAL') {
    if (input.applicationKind !== 'LICENSED' && input.planProvisioningType !== 'K4')
      throw new SubscriptionPerpetualNeedsLicensedApplicationError();
    const fields = [
      input.endDate !== null ? 'endDate' : null,
      input.renewalDate !== null ? 'renewalDate' : null,
      input.noticeDeadline !== null ? 'noticeDeadline' : null,
      input.noticePeriodDays !== null ? 'noticePeriodDays' : null,
      input.billingCycle !== null ? 'billingCycle' : null,
      input.autoRenew ? 'autoRenew' : null,
      input.allowsMidTermReduction ? 'allowsMidTermReduction' : null,
    ].filter((field): field is string => field !== null);
    if (fields.length > 0) throw new SubscriptionPerpetualHasNoTermError(fields);
  }

  if (input.startDate !== null && input.endDate !== null && input.startDate > input.endDate) {
    throw new SubscriptionDatesInvalidError('START_AFTER_END');
  }
  if (input.endDate !== null && input.renewalDate !== null && input.renewalDate > addDays(input.endDate, 1)) {
    throw new SubscriptionDatesInvalidError('RENEWAL_AFTER_END_PLUS_ONE');
  }
  if (input.renewalDate !== null && input.noticeDeadline !== null && input.noticeDeadline > input.renewalDate) {
    throw new SubscriptionDatesInvalidError('NOTICE_AFTER_RENEWAL');
  }
}

/** The part of a stored subscription the notice table reads. */
export function noticeInputOf(record: NoticeInput): NoticeInput {
  return {
    kind: record.kind,
    noticeDeadline: record.noticeDeadline,
    noticePeriodDays: record.noticePeriodDays,
    renewalDate: record.renewalDate,
    endDate: record.endDate,
    autoRenew: record.autoRenew,
  };
}

/** The value an update gives, or the stored one when it gives none; `null` is a value (it clears). */
const given = <T>(value: T | undefined, stored: T): T => (value === undefined ? stored : value);

/** What a subscription is made of once an update is applied: each field the update gives, and the four dates, the notice period and the vendor's minimum cleared by null. */
export function nextStateOf<B extends string, C extends number>(
  current: {
    purchasedQuantity: number | null;
    billingCycle: B | null;
    commitmentTermMonths: C | null;
    startDate: string | null;
    endDate: string | null;
    renewalDate: string | null;
    noticeDeadline: string | null;
    noticePeriodDays: number | null;
    autoRenew: boolean;
    allowsMidTermReduction: boolean;
    responsibleItAdminEmployeeId: string | null;
    vendorMinimumSeats: number | null;
    isPrimaryForPlan: boolean;
    seatCounting?: SeatCounting | undefined;
    minimumSeatsTotal?: number | null | undefined;
    invoicedLater?: boolean | undefined;
  },
  input: {
    purchasedQuantity?: number;
    billingCycle?: B;
    commitmentTermMonths?: C;
    startDate?: string;
    endDate?: string | null;
    renewalDate?: string | null;
    noticeDeadline?: string | null;
    noticePeriodDays?: number | null;
    autoRenew?: boolean;
    allowsMidTermReduction?: boolean;
    vendorMinimumSeats?: number | null;
    isPrimaryForPlan?: boolean;
    seatCounting?: SeatCounting;
    minimumSeatsTotal?: number | null;
    invoicedLater?: boolean;
  },
) {
  return {
    purchasedQuantity: given(input.purchasedQuantity, current.purchasedQuantity),
    billingCycle: given<B | null>(input.billingCycle, current.billingCycle),
    commitmentTermMonths: given<C | null>(input.commitmentTermMonths, current.commitmentTermMonths),
    startDate: given<string | null>(input.startDate, current.startDate),
    endDate: given(input.endDate, current.endDate),
    renewalDate: given(input.renewalDate, current.renewalDate),
    noticeDeadline: given(input.noticeDeadline, current.noticeDeadline),
    noticePeriodDays: given(input.noticePeriodDays, current.noticePeriodDays),
    autoRenew: given(input.autoRenew, current.autoRenew),
    allowsMidTermReduction: given(input.allowsMidTermReduction, current.allowsMidTermReduction),
    // Who answers for the subscription never changes with an update: only the Super Admin names them, through their own route (`QĐ-118f`).
    responsibleItAdminEmployeeId: current.responsibleItAdminEmployeeId,
    vendorMinimumSeats: given(input.vendorMinimumSeats, current.vendorMinimumSeats),
    isPrimaryForPlan: given(input.isPrimaryForPlan, current.isPrimaryForPlan),
    // The way the seats are counted, the least seats across the workspace and the invoice after the period stay as stored when the update says nothing.
    seatCounting: given(input.seatCounting, current.seatCounting),
    minimumSeatsTotal: given(input.minimumSeatsTotal, current.minimumSeatsTotal),
    invoicedLater: given(input.invoicedLater, current.invoicedLater),
  };
}

/** Whether the unit price given is the one already recorded: none given, or the same amount in the same currency. */
export function sameUnitPrice(
  recorded: { amountMinor: bigint; currency: string } | null,
  given: { amountMinor: bigint; currency: string } | null,
): boolean {
  return (
    given === null ||
    (recorded !== null && recorded.amountMinor === given.amountMinor && recorded.currency === given.currency)
  );
}

/** What keeps a state a draft (`missingData`), read from the fields of a subscription: a price that is not in dong is no price. */
export function missingDataOf(
  plan: { pricingModel: PlanPricingModel | null },
  kind: SubscriptionKind,
  state: {
    purchasedQuantity: number | null;
    startDate: BusinessDate | null;
    billingCycle: string | null;
    unitPrice: { currency: string } | null;
    priceSnapshot: unknown;
  },
): MissingItem[] {
  return missingData({
    kind,
    planPricingModel: plan.pricingModel,
    quantity: state.purchasedQuantity,
    startDate: state.startDate,
    billingCycle: state.billingCycle,
    hasPrice: isPricedInDong(state),
  });
}

/** Active when nothing keeps the subscription a draft (`missingData`), a draft otherwise. */
export function subscriptionStatusOf(
  plan: { pricingModel: PlanPricingModel | null },
  kind: SubscriptionKind,
  state: Parameters<typeof missingDataOf>[2],
): 'ACTIVE' | 'DRAFT' {
  return missingDataOf(plan, kind, state).length === 0 ? 'ACTIVE' : 'DRAFT';
}

/** The value a declaration gives, or the one a subscription starts with when it gives none. */
const orStart = <T>(value: T | undefined, start: T): T => value ?? start;

/** What a declared subscription starts as: what the declaration gives, nothing recorded for the rest, and the two choices off. */
export function declaredStateOf<B extends string, C extends number>(input: {
  purchasedQuantity?: number;
  billingCycle?: B;
  commitmentTermMonths?: C;
  responsibleItAdminEmployeeId?: string;
  vendorMinimumSeats?: number;
  startDate?: string;
  endDate?: string;
  renewalDate?: string;
  noticeDeadline?: string;
  noticePeriodDays?: number;
  autoRenew?: boolean;
  allowsMidTermReduction?: boolean;
  seatCounting?: SeatCounting;
  minimumSeatsTotal?: number;
  invoicedLater?: boolean;
}) {
  return {
    purchasedQuantity: orStart<number | null>(input.purchasedQuantity, null),
    billingCycle: orStart<B | null>(input.billingCycle, null),
    commitmentTermMonths: orStart<C | null>(input.commitmentTermMonths, null),
    startDate: orStart<string | null>(input.startDate, null),
    endDate: orStart<string | null>(input.endDate, null),
    renewalDate: orStart<string | null>(input.renewalDate, null),
    noticeDeadline: orStart<string | null>(input.noticeDeadline, null),
    noticePeriodDays: orStart<number | null>(input.noticePeriodDays, null),
    autoRenew: orStart(input.autoRenew, false),
    allowsMidTermReduction: orStart(input.allowsMidTermReduction, false),
    responsibleItAdminEmployeeId: orStart<string | null>(input.responsibleItAdminEmployeeId, null),
    vendorMinimumSeats: orStart<number | null>(input.vendorMinimumSeats, null),
    isPrimaryForPlan: false,
    // Not given, these are not written and the column defaults stand (a fixed count, no minimum, no invoice after the period).
    seatCounting: input.seatCounting,
    minimumSeatsTotal: input.minimumSeatsTotal,
    invoicedLater: input.invoicedLater,
  };
}

/** An edit made on a read of the row is stale when the row's `updated_at` (kept to the millisecond, `Timestamptz(3)`) is no longer that read; no read named means no check. */
export function isStaleEdit(expectedUpdatedAt: Date | undefined, currentUpdatedAt: Date): boolean {
  return expectedUpdatedAt !== undefined && expectedUpdatedAt.getTime() !== currentUpdatedAt.getTime();
}

/** The routes that change the seats of a subscription: what an edit of the number answers with (W3-27). */
export const SEAT_LEDGER_ROUTES = [
  'subscriptionLineSeatPurchase',
  'subscriptionLineSeatCorrection',
  'subscriptionLineSeatReduction',
] as const;

/**
 * What an update no longer writes (W3-27): the seats (they are bought and corrected on the lines of the subscription) and the mark of the subscription that
 * prices its plan. Both fields stay in the body so a client that sends them is told so. Throws SubscriptionSeatCountViaLedgerError, SubscriptionPrimaryRetiredError.
 */
export function assertUpdateWritesNoRetiredField(input: {
  purchasedQuantity?: number;
  isPrimaryForPlan?: boolean;
}): void {
  if (input.purchasedQuantity !== undefined) throw new SubscriptionSeatCountViaLedgerError(SEAT_LEDGER_ROUTES);
  if (input.isPrimaryForPlan === true) throw new SubscriptionPrimaryRetiredError();
}

/**
 * What a declaration no longer takes (W3-27): a purchase made once is a lot, and a plan of personal accounts has no subscription. The kind is judged before
 * the plan is read; the plan once it is. Throws SubscriptionPerpetualIsLicenseLotError, SubscriptionK1HasNoSubscriptionError.
 */
export function assertDeclarable(kind: SubscriptionKind, planProvisioningType?: ProvisioningType): void {
  if (kind === 'PERPETUAL') throw new SubscriptionPerpetualIsLicenseLotError();
  if (planProvisioningType === 'K1') throw new SubscriptionK1HasNoSubscriptionError();
}

/** Requires expectedUpdatedAt whenever purchasedQuantity is included in an update. */
export function assertVersionForQuantityChange(
  purchasedQuantity: number | undefined,
  expectedUpdatedAt: Date | undefined,
): void {
  if (purchasedQuantity !== undefined && expectedUpdatedAt === undefined) {
    throw new SubscriptionVersionRequiredError();
  }
}

export interface QuantityChangeInput {
  status: SubscriptionStatus;
  planProvisioningType: ProvisioningType;
  currentQuantity: number | null;
  requestedQuantity: number | undefined;
  commitmentTermMonths: number | null;
  allowsMidTermReduction: boolean;
  quantityChangeReason: string | undefined;
}

/**
 * Checks a seat-count change on an active pooled (K2) subscription using its stored term and reduction flag,
 * returning the reason to record in the audit when seats are added and ignoring it otherwise.
 */
export function judgeQuantityChange(input: QuantityChangeInput): string | undefined {
  if (input.status !== 'ACTIVE' || input.planProvisioningType !== 'K2') return undefined;
  if (input.requestedQuantity === undefined || input.currentQuantity === null) return undefined;
  if (input.requestedQuantity === input.currentQuantity) return undefined;

  if (input.requestedQuantity < input.currentQuantity) {
    if (input.commitmentTermMonths === 12 && !input.allowsMidTermReduction) {
      throw new SubscriptionMidTermReductionNotAllowedError();
    }

    return undefined;
  }

  if (!input.quantityChangeReason) {
    throw new SubscriptionQuantityReasonRequiredError();
  }

  return input.quantityChangeReason;
}

const CYCLE_MONTHS_BY_CYCLE: Readonly<Record<string, bigint>> = {
  MONTHLY: 1n,
  QUARTERLY: 3n,
  ANNUAL: 12n,
};

/** Months in a billing cycle for monthly/unit conversion, or null when not periodic. */
export function cycleMonthsOf(billingCycle: BillingCycle | null | undefined): bigint | null {
  return billingCycle ? (CYCLE_MONTHS_BY_CYCLE[billingCycle] ?? null) : null;
}

/** Integer round-half-up: `(unitMinor * 2 + m) / (2 * m)`. */
export function monthlyFromUnitRoundHalfUp(unitMinor: bigint, cycleMonths: bigint): bigint {
  return (unitMinor * 2n + cycleMonths) / (2n * cycleMonths);
}

/** Derives `monthlyUnitPriceMinor` from a VND `unitPrice` and `billingCycle` when callers omit `monthlyUnitPriceMinor`. */
export function derivedMonthlyUnitPriceMinor(
  unitPrice: { amountMinor: bigint; currency: string } | null,
  billingCycle: BillingCycle | null,
): bigint | null {
  const m = cycleMonthsOf(billingCycle);

  return m !== null && unitPrice?.currency === DONG ? monthlyFromUnitRoundHalfUp(unitPrice.amountMinor, m) : null;
}

function resolveSentPrices(m: bigint | null, sentMonthly: Money | undefined, sentUnit: Money | undefined) {
  if (sentMonthly !== undefined && sentUnit !== undefined) {
    if (m === null) return { monthlyUnitPriceMinor: sentMonthly.amountMinor, unitMoney: sentUnit };
    const expectedUnitMinor = sentMonthly.amountMinor * m;
    if (sentUnit.amountMinor !== expectedUnitMinor) throw new SubscriptionPriceMismatchError(expectedUnitMinor);

    return {
      monthlyUnitPriceMinor: sentMonthly.amountMinor,
      unitMoney: { amountMinor: expectedUnitMinor, currency: DONG },
    };
  }
  if (sentMonthly !== undefined) {
    return {
      monthlyUnitPriceMinor: sentMonthly.amountMinor,
      unitMoney: m !== null ? { amountMinor: sentMonthly.amountMinor * m, currency: DONG } : null,
    };
  }
  if (m === null) return { monthlyUnitPriceMinor: null, unitMoney: sentUnit! };
  const monthlyMinor = monthlyFromUnitRoundHalfUp(sentUnit!.amountMinor, m);

  return { monthlyUnitPriceMinor: monthlyMinor, unitMoney: { amountMinor: monthlyMinor * m, currency: DONG } };
}

function resolveUnchangedPrices(
  m: bigint | null,
  cycleChanged: boolean,
  currentMonthly: bigint | null,
  currentUnit: Money | null,
) {
  if (m !== null && currentMonthly !== null && cycleChanged) {
    return { monthlyUnitPriceMinor: currentMonthly, unitMoney: { amountMinor: currentMonthly * m, currency: DONG } };
  }
  if (m !== null && currentMonthly === null && currentUnit?.currency === DONG && cycleChanged) {
    const monthlyMinor = monthlyFromUnitRoundHalfUp(currentUnit.amountMinor, m);

    return { monthlyUnitPriceMinor: monthlyMinor, unitMoney: { amountMinor: monthlyMinor * m, currency: DONG } };
  }

  return { monthlyUnitPriceMinor: currentMonthly, unitMoney: currentUnit };
}

/**
 * Resolves `monthlyUnitPriceMinor` and the derived `unitPrice` for a declaration or update.
 * Throws `SubscriptionPriceMismatchError` when both `monthlyUnitPrice` and `unitPrice` are provided and disagree.
 */
export function resolveSubscriptionPrices(input: {
  kind: SubscriptionKind;
  billingCycle: BillingCycle | null;
  cycleChanged: boolean;
  sentMonthly: Money | undefined;
  sentUnit: Money | undefined;
  currentMonthlyMinor?: bigint | null;
  currentUnitMoney?: Money | null;
}): { monthlyUnitPriceMinor: bigint | null; unitMoney: Money | null } {
  const currentMonthly = input.currentMonthlyMinor ?? null;
  const currentUnit = input.currentUnitMoney ?? null;
  if (input.kind === 'PERPETUAL') {
    return { monthlyUnitPriceMinor: null, unitMoney: input.sentUnit ?? currentUnit };
  }
  const m = cycleMonthsOf(input.billingCycle);
  if (input.sentMonthly !== undefined || input.sentUnit !== undefined) {
    return resolveSentPrices(m, input.sentMonthly, input.sentUnit);
  }

  return resolveUnchangedPrices(m, input.cycleChanged, currentMonthly, currentUnit);
}
