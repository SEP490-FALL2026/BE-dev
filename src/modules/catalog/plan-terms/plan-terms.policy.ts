import type { BusinessDate } from '../../../core/business-date';
import { normalizeDisplayName } from '../../../core/display-name';
import {
  PlanTermsInstallLimitNumericOnlyForK4Error,
  PlanTermsNotApplicableError,
  PlanTermsReviewDateInFutureError,
  PlanTermsTextInvalidError,
  PlanTermsUrlInvalidError,
} from './plan-terms.errors';
import type { ProvisioningType } from './plan-terms.types';

export const MAX_TEXT_LENGTH = 2000;

/**
 * A point of the checklist as IT read it: the words are kept as given, only blanks are trimmed and collapsed; nothing is
 * classified, summarised or judged (`US-04-11` AC-2). Nothing or blanks is null; at most 2000 characters.
 */
export function cleanTermsText(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const text = normalizeDisplayName(raw);
  if (text.length > MAX_TEXT_LENGTH) throw new PlanTermsTextInvalidError();

  return text === '' ? null : text;
}

/** The link to the terms: an absolute `http` or `https` address of at most 2000 characters; nothing is null. */
export function cleanTermsUrl(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const value = raw.trim();
  if (value === '') return null;
  if (value.length > MAX_TEXT_LENGTH) throw new PlanTermsUrlInvalidError();

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PlanTermsUrlInvalidError();
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.hostname === '') {
    throw new PlanTermsUrlInvalidError();
  }

  return value;
}

/** A K5 plan of an internal application has no terms (`US-04-11` AC-7). */
export function assertTermsApplicable(provisioningType: ProvisioningType): void {
  if (provisioningType === 'K5') throw new PlanTermsNotApplicableError();
}

/** Point 4 is kept as a number for a K4 plan only; any other plan keeps it as text (`QĐ-66al`). */
export function assertInstallLimit(provisioningType: ProvisioningType, maxDevices: number | null | undefined): void {
  if (maxDevices !== null && maxDevices !== undefined && provisioningType !== 'K4') {
    throw new PlanTermsInstallLimitNumericOnlyForK4Error();
  }
}

/** The day of the last review is today or earlier: a review that has not happened is not recorded. */
export function assertReviewDate(lastReviewedOn: BusinessDate | null, today: BusinessDate): void {
  if (lastReviewedOn !== null && lastReviewedOn > today) throw new PlanTermsReviewDateInFutureError();
}

export interface ReviewDueInput {
  today: BusinessDate;
  lastReviewedOn: BusinessDate | null;
  /** The date the subscription's alerts count back from: its deadline, or its end date when there is none. */
  baseDate: BusinessDate;
  /** The earliest alert date of the subscription: the milestone the review is due from. */
  firstAlertDate: BusinessDate;
}

/**
 * Whether the terms of a plan need a new review for this subscription: today is in the window from the milestone to the
 * base date, and the last review is missing or older than the milestone (a review on or after it counts for this period).
 */
export function reviewDue(input: ReviewDueInput): boolean {
  if (input.today < input.firstAlertDate || input.today > input.baseDate) return false;

  return input.lastReviewedOn === null || input.lastReviewedOn < input.firstAlertDate;
}
