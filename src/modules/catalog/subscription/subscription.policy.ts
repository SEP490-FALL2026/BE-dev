import { addDays, type BusinessDate } from '../../../core/business-date';
import {
  SubscriptionDatesInvalidError,
  SubscriptionPerpetualHasNoTermError,
  SubscriptionPerpetualNeedsLicensedApplicationError,
  SubscriptionPlanHasNoSubscriptionError,
} from './subscription.errors';
import type {
  ApplicationKind,
  MissingItem,
  NoticeSource,
  PlanPricingModel,
  ProvisioningType,
  SubscriptionKind,
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

/** The alert dates: the base date minus each number of days the parameter sets, in the parameter's order. */
export function alertDates(baseDate: BusinessDate | null, daysBefore: readonly number[]): BusinessDate[] {
  if (baseDate === null) return [];

  return daysBefore.map((days) => addDays(baseDate, -days));
}

export interface CompletenessInput {
  kind: SubscriptionKind;
  planPricingModel: PlanPricingModel | null;
  quantity: number | null;
  startDate: BusinessDate | null;
  billingCycle: string | null;
  hasPrice: boolean;
  hasSnapshot: boolean;
}

/**
 * What keeps a subscription a draft, in a fixed order. A per-seat plan and a perpetual purchase need a quantity; a
 * term subscription needs a billing cycle; any needs a start (purchase) date and a price. A price with no snapshot is
 * missing the exchange rate of its day, not the price.
 */
export function missingData(input: CompletenessInput): MissingItem[] {
  const missing: MissingItem[] = [];
  if (input.quantity === null && (input.planPricingModel === 'PER_SEAT' || input.kind === 'PERPETUAL')) {
    missing.push('QUANTITY');
  }
  if (input.startDate === null) missing.push('START_DATE');
  if (input.kind === 'TERM' && input.billingCycle === null) missing.push('BILLING_CYCLE');
  if (!input.hasPrice) missing.push('UNIT_PRICE');
  else if (!input.hasSnapshot) missing.push('EXCHANGE_RATE');

  return missing;
}

export interface ShapeInput {
  kind: SubscriptionKind;
  applicationKind: ApplicationKind;
  planProvisioningType: ProvisioningType;
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
 * to licensed software and carries no term; the dates are in order. Throws the first that fails.
 */
export function assertSubscriptionShape(input: ShapeInput): void {
  if (input.planProvisioningType === 'K5') throw new SubscriptionPlanHasNoSubscriptionError();
  if (input.kind === 'PERPETUAL') {
    if (input.applicationKind !== 'LICENSED') throw new SubscriptionPerpetualNeedsLicensedApplicationError();
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
