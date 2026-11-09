import type { BusinessDate } from '../../../core/business-date';
import type { BaselineVersionRefusal } from '../budget/budget.errors';

/**
 * The monthly price of one seat from the unit price in the reporting currency and the cycle it is paid in (`R-I03`): a year's price
 * divided by 12, a quarter's by 3, rounded to the nearest minor unit (half up). A cycle that is not one of those (`OTHER`) or a price
 * not known gives none.
 */
export function monthlyUnitPrice(unitPriceMinor: bigint | null, billingCycle: string | null): bigint | null {
  if (unitPriceMinor === null) return null;
  switch (billingCycle) {
    case 'MONTHLY':
      return unitPriceMinor;
    case 'QUARTERLY':
      return (unitPriceMinor * 2n + 3n) / 6n;
    case 'ANNUAL':
      return (unitPriceMinor * 2n + 12n) / 24n;
    default:
      return null;
  }
}

/**
 * The months of `year` a subscription runs, counting each month it touches: no end date means it runs to the end of the year, no start
 * date that it ran from the start; one that ends before the year or starts after it runs none (`R-I03`).
 */
export function monthsRunning(year: number, startDate: BusinessDate | null, endDate: BusinessDate | null): number {
  const first = startDate !== null && startDate > `${year}-01-01` ? startDate : `${year}-01-01`;
  const last = endDate !== null && endDate < `${year}-12-31` ? endDate : `${year}-12-31`;
  if (first > last || first.slice(0, 4) !== String(year) || last.slice(0, 4) !== String(year)) return 0;

  return Number(last.slice(5, 7)) - Number(first.slice(5, 7)) + 1;
}

/** What a subscription is estimated to cost over `months` months: seats × monthly price × months; none when a figure is unknown. */
export function estimatedCost(seats: number | null, monthlyMinor: bigint | null, months: number): bigint | null {
  return seats === null || monthlyMinor === null ? null : BigInt(seats) * monthlyMinor * BigInt(months);
}

/** The facts of a subscription that the renewal rule reads. */
export interface RenewalFacts {
  startDate: BusinessDate | null;
  endDate: BusinessDate | null;
  /** The day it renews by itself, when it does: a subscription with no end date that renews is as good as running. */
  renewalDate?: BusinessDate | null;
}

/**
 * Whether the subscription will be renewed for the year to come (`Q-162`, TẠM CHỌN): it runs today (it has started, and its end, or its
 * renewal day, is not behind us) and nobody has ordered it to end. A date that falls on 31 December, in January of the year after or
 * nowhere at all makes no difference: what runs and is not stopped goes on at the price of today.
 */
export function willRenew(today: BusinessDate, subscription: RenewalFacts, terminated: boolean): boolean {
  if (terminated) return false;
  const started = subscription.startDate === null || subscription.startDate <= today;
  const end = subscription.renewalDate ?? subscription.endDate;

  return started && (end === null || end >= today);
}

/**
 * Whether the budget of `year` should propose to renew a subscription (a `Renew` line, `FR-5.15`): it will be renewed (`willRenew`), or
 * it has not started and ends within the year. A subscription that was ordered to end is never proposed.
 */
export function shouldSuggestRenewal(
  year: number,
  today: BusinessDate,
  subscription: RenewalFacts,
  terminated: boolean,
): boolean {
  if (terminated) return false;
  const { endDate } = subscription;

  return (
    willRenew(today, subscription, terminated) ||
    (endDate !== null && endDate >= `${year}-01-01` && endDate <= `${year}-12-31`)
  );
}

/**
 * What one subscription is estimated to cost over a year at the prices of today (`R-I03`): the seats it HOLDS (what is assigned; the
 * seats bought and idle are the shared pool's, `QĐ-103k`), the monthly price of a seat and the months it runs; a subscription that will
 * be renewed counts for the twelve months of the year (`Q-162`), one that was ordered to end only for the months it still runs.
 */
export function subscriptionCost(
  year: number,
  today: BusinessDate,
  seatsHeld: number,
  subscription: RenewalFacts & { unitPriceReportingMinor: bigint | null; billingCycle: string | null },
  terminated = false,
): { monthlyMinor: bigint | null; months: number; costMinor: bigint | null } {
  const monthlyMinor = monthlyUnitPrice(subscription.unitPriceReportingMinor, subscription.billingCycle);
  const months = willRenew(today, subscription, terminated)
    ? 12
    : monthsRunning(year, subscription.startDate, subscription.endDate);

  return { monthlyMinor, months, costMinor: estimatedCost(seatsHeld, monthlyMinor, months) };
}

/**
 * Whether Finance may build the first version of a department from the baseline (`QĐ-100h`, `R-I05`): the cycle of the year was
 * published once and the department is in it (a ceiling there, in effect by the end of the year); the day is after the submission deadline; nobody heads the department today and nobody is to head it later (a
 * successor, a department made for next year included); and no proposal waits or is being reviewed. The first that fails is named.
 */
export function baselineVersionRefusal(input: {
  cyclePublishedOnce: boolean;
  inCycle: boolean;
  today: BusinessDate;
  submissionDeadline: BusinessDate;
  headsToday: boolean;
  headToCome: boolean;
  openProposal: boolean;
}): BaselineVersionRefusal | null {
  if (!input.cyclePublishedOnce) return 'CYCLE_NOT_PUBLISHED';
  if (!input.inCycle) return 'DEPARTMENT_NOT_IN_CYCLE';
  if (input.today <= input.submissionDeadline) return 'BEFORE_DEADLINE';
  if (input.headsToday) return 'HAS_HEAD';
  if (input.headToCome) return 'HAS_SUCCESSOR';
  if (input.openProposal) return 'HAS_PROPOSAL';

  return null;
}

/**
 * The most departments a baseline or a package lists: a division of the ceiling names at most this many (`budgetDepartmentCeilingsSet`),
 * and the answer says how many there are in all (`departmentsTotal`) when it lists fewer.
 */
export const DEPARTMENTS_LISTED_MAX = 500;
/** The most subscriptions the baseline lists for one department; `softwareTotal` says how many it owns. */
export const SOFTWARE_LISTED_MAX = 50;

/** The departments a read lists: the first `DEPARTMENTS_LISTED_MAX` by id, or the one that was asked for when it is among them. */
export function listedDepartments(inYear: readonly string[], departmentId: string | undefined): string[] {
  return (departmentId === undefined ? inYear : inYear.filter((id) => id === departmentId)).slice(
    0,
    DEPARTMENTS_LISTED_MAX,
  );
}

/** Puts what a read returned in the order of the ids it was asked for (a statement `WHERE id = ANY(...)` has no order of its own). */
export function inOrderOf<T extends { id: string }>(ids: readonly string[], rows: readonly T[]): T[] {
  const position = new Map(ids.map((id, index) => [id, index]));

  return [...rows].sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
}
