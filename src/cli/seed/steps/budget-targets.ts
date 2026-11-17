import { dayOffset, daysBetween } from '../demo-dates';
import type { DemoFixture, DemoRequestScenario, DemoSubscription } from '../fixture/demo-fixture.types';
import { grantedOnOf } from './baseline.steps';

/**
 * The base of the budget of a department, counted from the day of the seed (SPEC S24 item 1, Q-C): the light a head or Finance sees at the close
 * of the latest month depends on the day the dataset runs (the pace is spent over the month, `UNDER` exists from June), so a base written once
 * would show other lights on another day. Pure functions of the fixture and the day: what a department is expected to have spent, held and have
 * waiting at the close of the month (`expectedOf`), and the base that gives it the light the fixture names (`baseFor`). The rules of the light are
 * a copy of `budget-review.policy.ts` (the seed cannot import a module) that a test reads back from the source.
 */

type Day = string;
type Basis = Pick<DemoFixture, 'applications' | 'subscriptions' | 'seats' | 'people' | 'requests' | 'budgets'>;
export type ReviewLight = 'RED' | 'YELLOW' | 'UNDER' | 'GREEN';

/** The default share of the reserve (`BUDGET_RESERVE_DEFAULT_PERCENT`); the lights of RED are the only ones that read it. */
const DEFAULT_RESERVE_PERCENT = 10;
/** The latest month the dataset closes (`demo.budget-reviews`). */
const LAST_MONTH = 10;
/** The smallest base worth asking for (a year-end day leaves a request only a month of cost). */
const MIN_BASE = 10_000;
const STEPS = [1_000_000, 100_000, 10_000, 1_000, 1];

/** The month the latest review closes on `today`: the month before it, never past October; 0 in January (no month of the year has ended). */
export function lastClosedMonth(today: Day): number {
  return Math.min(LAST_MONTH, Number(today.slice(5, 7)) - 1);
}

export interface Expected {
  /** The month the figures are of (0: none has ended). */
  month: number;
  /** What the seats of the pool cost the department through that month, by the days each was held. */
  spentThrough: number;
  /** What the decided requests of the department hold for the year. */
  committed: number;
  /** What its requests wait for a decision with. */
  pending: number;
}

const planOf = (fixture: Basis, key: string) =>
  fixture.applications.flatMap((application) => application.plans).find((plan) => plan.key === key);

/** The price of a seat for a month: a monthly plan its price, an annual one its price over twelve, rounded up as the catalog does. */
function monthlyPriceOf(subscription: DemoSubscription): number {
  const amount = Number(subscription.unitPrice.amount);

  return subscription.billingCycle === 'ANNUAL' ? Math.ceil(amount / 12) : amount;
}

const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The cost of one seat in one month: the price of a month times the days held over the days of the month. */
function seatMonthCost(price: number, held: { from: Day; until: Day | null }, year: number, month: number): number {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextStart = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const from = held.from > start ? held.from : start;
  const until = held.until !== null && held.until < nextStart ? held.until : nextStart;
  const days = Math.max(0, daysBetween(from, until));

  return Math.round((price * days) / daysInMonth(year, month));
}

/** What the seats of the shared pool (K2) cost the department through `month` (the days each seat is held, the department of its holder). */
function spentThrough(fixture: Basis, today: Day, department: string, month: number): number {
  const year = Number(today.slice(0, 4));
  let total = 0;
  for (const seat of fixture.seats) {
    const holder = fixture.people.find((person) => person.code === seat.holder);
    const subscription = fixture.subscriptions.find((candidate) => candidate.key === seat.subscription);
    const plan = subscription ? planOf(fixture, subscription.plan) : undefined;
    if (holder?.department !== department || !subscription || plan?.provisioningType !== 'K2') continue;
    // A seat costs a department only on the days its holder is placed in it (`seat-month.policy.ts`), and a person the seed creates is placed from the
    // day of the seed, never earlier (`employee-first-placement.policy.ts`; `POST /employees` places them that day): the days before cost nobody anything.
    const granted = grantedOnOf({ fixture: fixture as DemoFixture, today }, seat);
    const held = {
      from: granted > today ? granted : today,
      until: seat.endInDays === undefined ? null : dayOffset(today, seat.endInDays),
    };
    for (let current = 1; current <= month; current++)
      total += seatMonthCost(monthlyPriceOf(subscription), held, year, current);
  }

  return total;
}

/** The states of a request that hold its cost for the year, and those that wait for the decision on it. */
const HELD_TARGETS: ReadonlySet<string> = new Set([
  'COMPLETED',
  'AWAITING_EXECUTION',
  'EXECUTING',
  'AWAITING_IT_CLOSE',
]);
const WAITING_TARGETS: ReadonlySet<string> = new Set([
  'AWAITING_SPEND_DECISION',
  'AWAITING_SPEND_SUBMISSION',
  'RESERVE_UNCONFIRMED',
]);

/** What a request costs for the year: the price of a month times the people times the months left in the year it covers (a key bought for a seat costs its price once). */
function requestCost(fixture: Basis, today: Day, request: DemoRequestScenario): number {
  const subscription = fixture.subscriptions.find((candidate) => candidate.plan === request.plan);
  const plan = request.plan ? planOf(fixture, request.plan) : undefined;
  if (!subscription || !plan) return 0;
  const people = (request.beneficiaries ?? [request.requester]).length;
  if (plan.provisioningType === 'K4')
    return request.grant === 'KEY' ? 0 : Number(subscription.unitPrice.amount) * people;
  if (plan.provisioningType === 'K5') return 0;
  const monthsLeft = 12 - Number(today.slice(5, 7)) + 1;
  const months = Math.min(request.termMonths ?? monthsLeft, monthsLeft);

  return monthlyPriceOf(subscription) * people * months;
}

/** What a department is expected to have spent through the latest closed month, to hold and to have waiting, from the seats and the requests of the fixture. */
export function expectedOf(fixture: Basis, department: string, today: Day): Expected {
  const month = lastClosedMonth(today);
  let committed = 0;
  let pending = 0;
  for (const request of fixture.requests) {
    if (fixture.people.find((person) => person.code === request.requester)?.department !== department) continue;
    if (HELD_TARGETS.has(request.target)) committed += requestCost(fixture, today, request);
    else if (WAITING_TARGETS.has(request.target)) pending += requestCost(fixture, today, request);
  }

  return {
    month: Math.max(0, month),
    spentThrough: month < 1 ? 0 : spentThrough(fixture, today, department, month),
    committed,
    pending,
  };
}

/** The pace of spending over an even schedule, in hundredths of a percent, rounded up (null with no base): `paceOf` of the policy. */
function paceOf(spent: number, base: number, month: number): number | null {
  if (base <= 0 || month < 1) return null;
  const scheduled = base * month;

  return Math.floor((spent * 12 * 10_000 + scheduled - 1) / scheduled);
}

/** The light of a close, in the order of the policy: red, yellow, under (from June), green. */
function lightOf(input: {
  month: number;
  base: number;
  reserve: number;
  forecast: number;
  spent: number;
}): ReviewLight {
  const pace = paceOf(input.spent, input.base, input.month);
  if (input.forecast > input.base + input.reserve) return 'RED';
  if (input.forecast > input.base || (pace !== null && pace > 11_000)) return 'YELLOW';
  if (input.month >= 6 && input.forecast * 100 < 70 * input.base) return 'UNDER';

  return 'GREEN';
}

/** The light a base gives a department with nothing counted yet (the forecast is zero). */
function lightOnly(base: string, expected: Expected, reservePercent: number): ReviewLight {
  const amount = Number(base);

  return lightOf({
    month: expected.month,
    base: amount,
    reserve: Math.round((amount * reservePercent) / 100),
    forecast: 0,
    spent: 0,
  });
}

/** Rounds `value` up to a multiple of `step`. */
export const roundUpTo = (value: number, step: number): number => Math.ceil(value / step) * step;

export interface BaseChoice {
  /** The base, in dong, and the amount of `BM-10` that asks for it. */
  base: number;
  /** The share of the reserve Finance sets. */
  reservePercent: number;
  /** The light the base was counted for. */
  wanted: ReviewLight;
  /** The light the base gives at the latest close (it is `wanted` when `reachable`). */
  light: ReviewLight;
  reachable: boolean;
  expected: Expected;
}

/** The target base of each light before rounding: how far under the forecast it must sit. */
function targetOf(light: 'UNDER' | 'GREEN' | 'YELLOW', forecast: number, month: number): number {
  if (light === 'UNDER') return forecast / 0.5;
  if (light === 'YELLOW') return forecast / 1.25;
  // GREEN: above the forecast by the margin the pace needs (`g(M) = max(1,2; 12 / (1,1 M) + 0,1)`) and under 1 / 0,7 of it.
  const margin = month < 1 ? 1.2 : Math.max(1.2, 12 / (1.1 * month) + 0.1);

  return forecast * margin;
}

/** The bases to try, the coarsest step first: the target rounded up, a few steps above it and a few below, none under `lowest`. */
function candidateBases(target: number, lowest: number): number[] {
  const bases: number[] = [];
  for (const step of STEPS) {
    const start = roundUpTo(target, step);
    for (let move = 0; move <= 6; move++) bases.push(start + move * step, start - (move + 1) * step);
  }

  return bases.filter((base) => base >= lowest);
}

/** How far the estimate of the forecast may be off (the requests are estimated, the seats counted by the day) and the light still hold. */
const TOLERANCE = [1, 0.9, 1.1];

/**
 * The first multiple of the coarsest step, from the target upward and then downward a little, that gives the light wanted even when the forecast
 * is off by a tenth; when no step does, the same without the tolerance; the exact target when none does.
 */
function chooseBase(
  wanted: 'UNDER' | 'GREEN' | 'YELLOW',
  figures: { expected: Expected; forecast: number; reservePercent: number; floor: number },
): { base: number; light: ReviewLight } {
  const { expected, forecast, reservePercent } = figures;
  const lowest = Math.max(figures.floor, MIN_BASE);
  const target = Math.max(lowest, Math.ceil(targetOf(wanted, forecast, expected.month)));
  const lightAt = (base: number, scale: number): ReviewLight =>
    lightOf({
      month: expected.month,
      base,
      reserve: Math.round((base * reservePercent) / 100),
      forecast: forecast * scale,
      spent: expected.spentThrough * scale,
    });
  const candidates = candidateBases(target, lowest);
  for (const scales of [TOLERANCE, [1]]) {
    const found = candidates.find((base) => scales.every((scale) => lightAt(base, scale) === wanted));
    if (found !== undefined) return { base: found, light: wanted };
  }

  return { base: target, light: lightAt(target, 1) };
}

/**
 * The base of the department for the light its entry in `budgets` names, counted for `today` (SPEC S24 item 1), or null for a department with none.
 * ENG and ITO sit well under (a forecast of half the base, ENG never under 600 million so a transfer of 5 million the next day stays covered),
 * the Board stays green with a margin over the pace, Finance is yellow with the reserve of 60 % that covers the forecast. A base is a whole million
 * when that keeps the light, else a finer step; a day too early for the light (`UNDER` exists from June) is reported by `reachable`, never thrown.
 */
export function baseFor(fixture: Basis, department: string, today: Day): BaseChoice | null {
  const entry = fixture.budgets.find((budget) => budget.department === department);
  if (!entry?.light) return null;
  const expected = expectedOf(fixture, department, today);
  const forecast = expected.spentThrough + expected.committed + expected.pending;
  const reservePercent = entry.reserve?.percent ?? DEFAULT_RESERVE_PERCENT;
  const floor = Number(entry.base) >= 600_000_000 ? Number(entry.base) : 0;
  // Nothing counted for the department (no request of it holds or waits for money, and no seat has cost it a month yet): there is no figure to count a
  // base from, so the fixture's amount stands and the light it shows is reported, whichever it is.
  const chosen =
    forecast === 0
      ? { base: Number(entry.base), light: lightOnly(entry.base, expected, reservePercent) }
      : chooseBase(entry.light, { expected, forecast, reservePercent, floor });

  return { ...chosen, reservePercent, wanted: entry.light, reachable: chosen.light === entry.light, expected };
}
