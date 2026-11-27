import { addMonths, dayOffset, daysBetween } from '../demo-dates';
import type { DemoFixture, DemoRequestScenario, DemoSubscription } from '../fixture/demo-fixture.types';
import { grantedOnOf } from './baseline.steps';
import {
  subscriptionHasPlan,
  subscriptionMonthlyPriceOf,
  subscriptionPrimaryPlan,
  subscriptionStartDate,
} from './catalog.steps';

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
  /** What open baseline seats in the year still cost from `today` through year-end (`running-uncommitted.policy.ts`). */
  runningUncommitted: number;
  /** What the decided requests of the department hold for the year. */
  committed: number;
  /** What its requests wait for a decision with. */
  pending: number;
}

const planOf = (fixture: Basis, key: string) =>
  fixture.applications.flatMap((application) => application.plans).find((plan) => plan.key === key);

/** The price of a seat for a month on `planKey`, reading `lines[]` first and falling back to `unitPrice`. */
function monthlyPriceOf(subscription: DemoSubscription, planKey?: string): number {
  return subscriptionMonthlyPriceOf(subscription, planKey);
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
    const planKey = subscription ? subscriptionPrimaryPlan(subscription) : undefined;
    const plan = planKey ? planOf(fixture, planKey) : undefined;
    if (holder?.department !== department || !subscription || plan?.provisioningType !== 'K2') continue;
    // A seat costs a department only on the days its holder is placed in it (`seat-month.policy.ts`), and a person the seed creates is placed from the
    // day of the seed, never earlier (`employee-first-placement.policy.ts`; `POST /employees` places them that day): the days before cost nobody anything.
    const granted = grantedOnOf({ fixture: fixture as DemoFixture, today }, seat);
    const held = {
      from: granted > today ? granted : today,
      until: seat.endInDays === undefined ? null : dayOffset(today, seat.endInDays),
    };
    for (let current = 1; current <= month; current++)
      total += seatMonthCost(monthlyPriceOf(subscription, plan.key), held, year, current);
  }

  return total;
}

function k2SeatInfo(
  fixture: Basis,
  department: string,
  seat: Basis['seats'][number],
): { subscription: DemoSubscription; planKey: string } | null {
  const holder = fixture.people.find((person) => person.code === seat.holder);
  if (holder?.department !== department) return null;
  const subscription = fixture.subscriptions.find((candidate) => candidate.key === seat.subscription);
  if (!subscription) return null;
  const planKey = subscriptionPrimaryPlan(subscription);
  const plan = planOf(fixture, planKey);

  return plan?.provisioningType === 'K2' ? { subscription, planKey } : null;
}

function seatRunningUncommitted(
  fixture: Basis,
  today: Day,
  yearStart: Day,
  yearEnd: Day,
  department: string,
  seat: Basis['seats'][number],
): number {
  const info = k2SeatInfo(fixture, department, seat);
  if (!info) return 0;
  const heldFrom = grantedOnOf({ fixture: fixture as DemoFixture, today }, seat);
  const lastHeld = seat.endInDays === undefined ? yearEnd : dayOffset(today, seat.endInDays - 1);
  if (heldFrom > today || lastHeld < today) return 0;
  const periodStart = info.subscription.withoutDates ? heldFrom : subscriptionStartDate({ today }, info.subscription);
  const effectiveStart = [heldFrom, periodStart, yearStart].reduce((latest, day) => (day > latest ? day : latest));
  if (effectiveStart > yearEnd || lastHeld < effectiveStart) return 0;
  const capped = lastHeld < yearEnd ? lastHeld : yearEnd;
  const months = Number(capped.slice(5, 7)) - Number(effectiveStart.slice(5, 7)) + 1;

  return months > 0 ? monthlyPriceOf(info.subscription, info.planKey) * months : 0;
}

/** Remaining un-run calendar months in `year` from `max(heldFrom, periodStart, yearStart)` through the end of each open baseline K2 seat. */
function runningUncommittedOf(fixture: Basis, today: Day, department: string): number {
  const year = Number(today.slice(0, 4));
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  return fixture.seats.reduce(
    (total, seat) => total + seatRunningUncommitted(fixture, today, yearStart, yearEnd, department, seat),
    0,
  );
}

/** The states of a request that hold its cost for the year, and those that wait for the decision on it. */
const HELD_TARGETS: ReadonlySet<string> = new Set(['COMPLETED', 'AWAITING_EXECUTION', 'EXECUTING']);
const WAITING_TARGETS: ReadonlySet<string> = new Set([
  'AWAITING_SPEND_DECISION',
  'AWAITING_SPEND_SUBMISSION',
  'RESERVE_UNCONFIRMED',
]);

function planPricingOf(fixture: Basis, planKey: string, referencePrice?: string) {
  const subscription = fixture.subscriptions.find((candidate) => subscriptionHasPlan(candidate, planKey));
  if (subscription) {
    const monthly = monthlyPriceOf(subscription, planKey);
    const purchase = subscription.unitPrice
      ? Number(subscription.unitPrice.amount)
      : monthly * (subscription.billingCycle === 'ANNUAL' ? 12 : 1);

    return { monthly, purchase };
  }

  return referencePrice ? { monthly: Number(referencePrice), purchase: Number(referencePrice) } : null;
}

function termEndFor(fixture: Basis, today: Day, request: DemoRequestScenario): Day | null {
  if (request.termMonths === null || request.termMonths === undefined) return null;
  const raw = dayOffset(addMonths(today, request.termMonths), -1);
  const requester = fixture.people.find((person) => person.code === request.requester);
  if (requester?.contractEndInDays === undefined) return raw;
  const contractEnd = dayOffset(today, requester.contractEndInDays);
  if (contractEnd >= raw) return raw;

  return contractEnd < today ? today : contractEnd;
}

function calendarMonthsInYear(start: Day, lastHeldOn: Day | null, year: number): number {
  const from = start > `${year}-01-01` ? start : `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const to = lastHeldOn !== null && lastHeldOn < yearEnd ? lastHeldOn : yearEnd;
  if (from > to) return 0;

  return Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1;
}

function monthsBeginningInYear(start: Day, end: Day | null, year: number): number {
  let count = 0;
  for (let i = 0; ; i++) {
    const anchor = addMonths(start, i);
    if (end !== null && anchor > end) break;
    const anchorYear = Number(anchor.slice(0, 4));
    if (anchorYear > year) break;
    if (anchorYear === year) count++;
  }

  return count;
}

/** What a request costs for the year (`W3-02` calendar months for K2, billing-anchor months for K1, purchase for K4). */
function requestCost(fixture: Basis, today: Day, request: DemoRequestScenario): number {
  const plan = request.plan ? planOf(fixture, request.plan) : undefined;
  if (!plan) return 0;
  // A plan with no subscription is priced by its reference price: a K1/K2 plan one seat a month, a K4 plan one purchase.
  const price = planPricingOf(fixture, plan.key, plan.referencePrice);
  if (!price) return 0;
  // The people the spending approver refuses hold nothing: they are never granted (R49).
  const people = (request.beneficiaries ?? [request.requester]).filter(
    (code) => !request.rejectedLines?.includes(code),
  ).length;
  if (plan.provisioningType === 'K4') return request.grant === 'KEY' ? 0 : price.purchase * people;
  if (plan.provisioningType === 'K5') return 0;
  const year = Number(today.slice(0, 4));
  const end = termEndFor(fixture, today, request);
  const months =
    plan.provisioningType === 'K1' ? monthsBeginningInYear(today, end, year) : calendarMonthsInYear(today, end, year);

  return price.monthly * people * months;
}

/** What a department is expected to have spent through the latest closed month, running uncommitted, held, and waiting. */
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
    runningUncommitted: runningUncommittedOf(fixture, today, department),
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
 * ENG and ITO sit well under (never under what their BM-10 lines add up to, so a transfer of 5 million from ENG the next day stays covered),
 * the Board stays green with a margin over the pace, Finance is yellow with the reserve of 60 % that covers the forecast. A base is a whole million
 * when that keeps the light, else a finer step; a day too early for the light (`UNDER` exists from June) is reported by `reachable`, never thrown.
 */
export function baseFor(fixture: Basis, department: string, today: Day): BaseChoice | null {
  const entry = fixture.budgets.find((budget) => budget.department === department);
  if (!entry?.light) return null;
  const expected = expectedOf(fixture, department, today);
  const forecast = expected.spentThrough + expected.runningUncommitted + expected.committed + expected.pending;
  const reservePercent = entry.reserve?.percent ?? DEFAULT_RESERVE_PERCENT;
  // A department meant to sit under asks at least what its BM-10 lines add up to (the fixture's base), never a figure counted from its few requests.
  const floor = entry.light === 'UNDER' ? Number(entry.base) : 0;
  // Nothing counted for the department (no request of it holds or waits for money, and no seat has cost it a month yet): there is no figure to count a
  // base from, so the fixture's amount stands and the light it shows is reported, whichever it is.
  const chosen =
    forecast === 0
      ? { base: Number(entry.base), light: lightOnly(entry.base, expected, reservePercent) }
      : chooseBase(entry.light, { expected, forecast, reservePercent, floor });

  return { ...chosen, reservePercent, wanted: entry.light, reachable: chosen.light === entry.light, expected };
}

/**
 * Tight reserve base (`base < forecast <= base * (1 + reserve%)`) for reserve-exercising departments (`MKT`, `DES`) whose
 * 1-month request cost spans 2 calendar months later in the year or shares the Cost Center with baseline seats.
 */
export function tightBaseFor(fixture: Basis, department: string, today: Day): number | null {
  if (department !== 'MKT' && department !== 'DES') return null;
  const entry = fixture.budgets.find((budget) => budget.department === department);
  if (!entry || entry.light) return null;
  const expected = expectedOf(fixture, department, today);
  const forecast = expected.spentThrough + expected.runningUncommitted + expected.committed + expected.pending;
  if (forecast <= 0) return Number(entry.base);
  const reservePercent = entry.reserve?.percent ?? DEFAULT_RESERVE_PERCENT;
  const factor = 1 + reservePercent / 100;
  const raw = Math.max(MIN_BASE, roundUpTo(Math.ceil(forecast / (1 + reservePercent / 200)), 10_000));
  if (raw < forecast && forecast <= raw * factor) return raw;

  return Math.max(MIN_BASE, Math.floor(forecast - 1));
}
