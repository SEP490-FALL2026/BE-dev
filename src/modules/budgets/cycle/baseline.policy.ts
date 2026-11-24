import type { BusinessDate } from '../../../core/business-date';
import type { BaselineVersionRefusal } from '../budget/budget.errors';

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
  /** The day it renews by itself, when it does: it stands for the end of a subscription that has no end date. */
  renewalDate?: BusinessDate | null;
  /** A later period of the same purchase was recorded: the year to come is that one's, not this one's (`F-105`). */
  hasSuccessor?: boolean;
}

/** The day a subscription stops: its end date, or, when it has none, the day it renews by itself (one reading for the months and for the renewal). */
export const endOf = (subscription: Pick<RenewalFacts, 'endDate' | 'renewalDate'>): BusinessDate | null =>
  subscription.endDate ?? subscription.renewalDate ?? null;

/**
 * Whether the subscription will be renewed for the year to come (`Q-162`, TẠM CHỌN): it runs today (it has started, and the day it stops
 * is not behind us, the day itself included), nobody has ordered it to end, and no later period of it was recorded (that one carries the
 * year to come). A date on 31 December, in January of the year after or none at all makes no difference.
 */
export function willRenew(today: BusinessDate, subscription: RenewalFacts, terminated: boolean): boolean {
  if (terminated || subscription.hasSuccessor === true) return false;
  const started = subscription.startDate === null || subscription.startDate <= today;
  const end = endOf(subscription);

  return started && (end === null || end >= today);
}

/**
 * Whether the budget of `year` should propose to renew a subscription (a `Renew` line, `FR-5.15`): it will be renewed (`willRenew`), or
 * it has not started and stops within the year. One that was ordered to end, or whose next period was recorded, is never proposed.
 */
export function shouldSuggestRenewal(
  year: number,
  today: BusinessDate,
  subscription: RenewalFacts,
  terminated: boolean,
): boolean {
  if (terminated || subscription.hasSuccessor === true) return false;
  const end = endOf(subscription);

  return (
    willRenew(today, subscription, terminated) || (end !== null && end >= `${year}-01-01` && end <= `${year}-12-31`)
  );
}

/**
 * What one subscription is estimated to cost over a year at the prices of today (`R-I03`): the seats it HOLDS (what is assigned; the
 * seats bought and idle are the shared pool's, `QĐ-103k`), the monthly price of a seat and the months it runs; a subscription that will
 * be renewed counts for the twelve months of the year (`Q-162`), any other only for the months it runs, to the day it stops.
 */
export function subscriptionCost(
  year: number,
  today: BusinessDate,
  seatsHeld: number,
  subscription: RenewalFacts & { monthlyPriceMinor: bigint | null },
  terminated = false,
): { monthlyMinor: bigint | null; months: number; costMinor: bigint | null } {
  const monthlyMinor = subscription.monthlyPriceMinor;
  const months = willRenew(today, subscription, terminated)
    ? 12
    : monthsRunning(year, subscription.startDate, endOf(subscription));

  return { monthlyMinor, months, costMinor: estimatedCost(seatsHeld, monthlyMinor, months) };
}

/** The seats of each subscription held as of a day, for each department and in all: a seat is charged to the department of its holder (`QĐ-103k`). */
export interface SeatAllocation {
  /** By department, the seats its people hold (or answer for, a service account), by subscription. */
  byDepartment: Map<string, Map<string, number>>;
  /** The seats held in all, by subscription, a holder placed in no department included. */
  held: Map<string, number>;
}

/**
 * Charges each seat held to the department its holder is in (`QĐ-103k`, `QĐ-89a(2)`): the seats of a shared-pool subscription go to as many
 * departments as its holders are in, whatever department may own the subscription. A holder placed in no department is counted in `held`
 * only (the seat is taken, so it is not idle), never in a department.
 */
export function allocateSeats(
  holdings: readonly { subscriptionId: string; employeeId: string; seats: number }[],
  departmentOf: ReadonlyMap<string, string>,
): SeatAllocation {
  const byDepartment = new Map<string, Map<string, number>>();
  const held = new Map<string, number>();
  for (const holding of holdings) {
    held.set(holding.subscriptionId, (held.get(holding.subscriptionId) ?? 0) + holding.seats);
    const departmentId = departmentOf.get(holding.employeeId);
    if (departmentId === undefined) continue;
    const seats = byDepartment.get(departmentId) ?? new Map<string, number>();
    seats.set(holding.subscriptionId, (seats.get(holding.subscriptionId) ?? 0) + holding.seats);
    byDepartment.set(departmentId, seats);
  }

  return { byDepartment, held };
}

/** A `K2` or `K4` purchase is the shared pool of the company (`QĐ-103d`): its idle seats belong to no department. */
const isSharedPool = (provisioningType: string): boolean => provisioningType === 'K2' || provisioningType === 'K4';

/** The seats bought and not held; none when the purchase has no number of seats, never below zero. */
const idleSeats = (purchased: number | null, held: number): number | null =>
  purchased === null ? null : Math.max(0, purchased - held);

/** The idle seats a purchase gives the line of the shared pool: some of a `K2`/`K4` purchase, none of any other or when all are held. */
export function poolIdleSeats(provisioningType: string, purchased: number | null, held: number): number | null {
  if (!isSharedPool(provisioningType)) return null;
  const idle = idleSeats(purchased, held);

  return idle === null || idle === 0 ? null : idle;
}

/**
 * Whether Finance may build the version of a department from the baseline (`QĐ-111bb`, `R-11`): the cycle of the year is open and the
 * department is in it (in effect by the end of the year); the day is after the submission deadline; and no proposal waits or is being
 * reviewed. Whether somebody heads the department no longer matters: a head that submitted nothing by the deadline, and a department made
 * after it, are built the same way. The first that fails is named.
 */
export function baselineVersionRefusal(input: {
  cycleOpen: boolean;
  inCycle: boolean;
  today: BusinessDate;
  submissionDeadline: BusinessDate;
  openProposal: boolean;
}): BaselineVersionRefusal | null {
  if (!input.cycleOpen) return 'CYCLE_NOT_OPEN';
  if (!input.inCycle) return 'DEPARTMENT_NOT_IN_CYCLE';
  if (input.today <= input.submissionDeadline) return 'BEFORE_DEADLINE';
  if (input.openProposal) return 'HAS_PROPOSAL';

  return null;
}

/**
 * The most departments a baseline or a package lists; the answer says how many there are in all (`departmentsTotal`) when it lists fewer.
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
