import type { BusinessDate } from '../../../core/business-date';
import type { EvidenceMatchMethod, EvidenceSource } from '../../usage/public/usage-evidence.types';
import type { GhostSeatTier } from '../ghost-seat/ghost-seat.types';

/** The default of `DETECTION_THRESHOLD_DAYS` (`FR-4.12`): to watch, to review, to act on. */
export const DEFAULT_THRESHOLDS = [30, 60, 90] as const;

export type ThresholdOrigin = 'APPLICATION' | 'ORGANIZATION' | 'DEFAULT';

export interface Thresholds {
  monitor: number;
  review: number;
  action: number;
  origin: ThresholdOrigin;
}

/** The thresholds of an application over the ones of the organization (the parameter) over the default (`FR-4.13`, `US-10-03` AC-6). */
export function thresholdsOf(
  application: { monitor: number; review: number; action: number } | null,
  organization: readonly number[] | null,
): Thresholds {
  if (application) return { ...application, origin: 'APPLICATION' };
  if (organization && organization.length === 3) {
    return { monitor: organization[0], review: organization[1], action: organization[2], origin: 'ORGANIZATION' };
  }

  return {
    monitor: DEFAULT_THRESHOLDS[0],
    review: DEFAULT_THRESHOLDS[1],
    action: DEFAULT_THRESHOLDS[2],
    origin: 'DEFAULT',
  };
}

/** An inclusive run of days. */
export interface DayRange {
  from: BusinessDate;
  to: BusinessDate;
}

const MS_PER_DAY = 86_400_000;
const dayNumber = (date: BusinessDate): number => Math.floor(Date.parse(`${date}T00:00:00.000Z`) / MS_PER_DAY);

/** The days a source that can tell the negative covers, together, from the day the seat could be used, up to `today`, minus the days of long leave. */
export function coveredRanges(input: {
  windows: readonly DayRange[];
  usableOn: BusinessDate;
  today: BusinessDate;
  /** A leave runs from `from` up to, and not including, `until` (null while it runs). */
  leaves: ReadonlyArray<{ from: BusinessDate; until: BusinessDate | null }>;
}): Array<[number, number]> {
  const first = dayNumber(input.usableOn);
  const last = dayNumber(input.today);
  const clipped = input.windows
    .map((window): [number, number] => [Math.max(dayNumber(window.from), first), Math.min(dayNumber(window.to), last)])
    .filter(([from, to]) => from <= to)
    .sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const range of clipped) {
    const tail = merged[merged.length - 1];
    if (tail && range[0] <= tail[1] + 1) tail[1] = Math.max(tail[1], range[1]);
    else merged.push([...range]);
  }
  let remaining = merged;
  for (const leave of input.leaves) {
    const from = dayNumber(leave.from);
    const to = leave.until ? dayNumber(leave.until) - 1 : last;
    remaining = remaining.flatMap(([a, b]): Array<[number, number]> => {
      if (to < a || from > b) return [[a, b]];
      const parts: Array<[number, number]> = [];
      if (from > a) parts.push([a, from - 1]);
      if (to < b) parts.push([to + 1, b]);

      return parts;
    });
  }

  return remaining;
}

/** The days in the ranges that fall after `after` (all of them when it is null). */
export function daysAfter(ranges: ReadonlyArray<[number, number]>, after: BusinessDate | null): number {
  const from = after ? dayNumber(after) + 1 : Number.NEGATIVE_INFINITY;

  return ranges.reduce((total, [a, b]) => total + Math.max(0, b - Math.max(a, from) + 1), 0);
}

export interface UsageAssessment {
  /** `NEVER_ACTIVE` is `G3`; `INACTIVE` has a number of days of coverage with no activity; `ACTIVE` is below the lowest threshold. */
  status: 'NEVER_ACTIVE' | 'INACTIVE' | 'ACTIVE';
  lastActiveDate: BusinessDate | null;
  inactiveDays: number | null;
  coverageDays: number;
  tier: GhostSeatTier | null;
}

/**
 * What the days say of a seat (`FR-4.10`, `FR-4.11`, `FR-4.14a`(3)): the person never appears ⟹ `G3` (action); a day of activity ⟹ the covered days
 * after the last one; no day of activity but seen (a login alone is not activity) ⟹ every covered day. The days are counted over the coverage only: a
 * day no source covered, and a day of long leave, is not a day without activity. Example: reports of 01/06-30/06 and 01/08-31/08, last day 10/06 ⟹ 20 + 31 = 51.
 */
export function assessUsage(input: {
  /** The days of `VALUE`/`PASSIVE` activity of the chain, from every source (a stale one's positive days count). */
  activeDates: readonly BusinessDate[];
  appeared: boolean;
  ranges: ReadonlyArray<[number, number]>;
  thresholds: Thresholds;
}): UsageAssessment {
  const coverageDays = daysAfter(input.ranges, null);
  const lastActiveDate = input.activeDates.length > 0 ? [...input.activeDates].sort().at(-1)! : null;
  if (!lastActiveDate && !input.appeared) {
    return { status: 'NEVER_ACTIVE', lastActiveDate: null, inactiveDays: null, coverageDays, tier: 'ACTION' };
  }
  const inactiveDays = daysAfter(input.ranges, lastActiveDate);
  const { thresholds } = input;
  const tier: GhostSeatTier | null =
    inactiveDays >= thresholds.action
      ? 'ACTION'
      : inactiveDays >= thresholds.review
        ? 'REVIEW'
        : inactiveDays >= thresholds.monitor
          ? 'MONITOR'
          : null;

  return { status: tier ? 'INACTIVE' : 'ACTIVE', lastActiveDate, inactiveDays, coverageDays, tier };
}

/** The lower threshold of a tier: what the days beyond it are counted from for the confidence (`CF-6`). */
export function lowerThresholdOf(tier: GhostSeatTier, thresholds: Thresholds): number {
  return tier === 'ACTION' ? thresholds.review : tier === 'REVIEW' ? thresholds.monitor : 0;
}

/** The day one calendar month after `date`, clamped to the end of a shorter month (31/01 ⟹ 28/02). */
export function oneMonthAfter(date: BusinessDate): BusinessDate {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month, 1));
  const lastOfMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const out = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, lastOfMonth)));

  return out.toISOString().slice(0, 10);
}

const METHOD_STRENGTH: Record<EvidenceMatchMethod, number> = {
  EXACT_EMAIL: 3,
  ACCOUNT_IDENTIFIER: 2,
  MANUAL: 2,
  ALIAS_RULE: 1,
};

/** What every source says of one person, put together: the days of activity (a stale source's too: a positive fact does not expire), whether they appear at all, and how they were tied. */
export interface PersonEvidence {
  activeDates: BusinessDate[];
  appeared: boolean;
  weakestMethod: EvidenceMatchMethod | null;
  lastAuthOnlyDate: BusinessDate | null;
  mappingChangedOn: BusinessDate | null;
  inCollector: boolean;
}

const emptyEvidence = (): PersonEvidence => ({
  activeDates: [],
  appeared: false,
  weakestMethod: null,
  lastAuthOnlyDate: null,
  mappingChangedOn: null,
  inCollector: false,
});

const laterOf = (a: BusinessDate | null, b: BusinessDate | null): BusinessDate | null =>
  a && b ? (a > b ? a : b) : (a ?? b);

const weakerOf = (a: EvidenceMatchMethod | null, b: EvidenceMatchMethod | null): EvidenceMatchMethod | null =>
  a && b ? (METHOD_STRENGTH[b] < METHOD_STRENGTH[a] ? b : a) : (a ?? b);

export function personEvidenceOf(sources: readonly EvidenceSource[], employeeId: string): PersonEvidence {
  const out = emptyEvidence();
  const days = new Set<BusinessDate>();
  for (const source of sources) {
    const person = source.employees.find((employee) => employee.employeeId === employeeId);
    if (!person) continue;
    person.activeDates.forEach((day) => days.add(day));
    out.appeared ||= person.appeared;
    out.inCollector ||= person.appeared && source.kind === 'COLLECTOR';
    out.weakestMethod = weakerOf(out.weakestMethod, person.weakestMethod);
    out.lastAuthOnlyDate = laterOf(out.lastAuthOnlyDate, person.lastAuthOnlyDate);
    out.mappingChangedOn = laterOf(out.mappingChangedOn, person.mappingChangedOn);
  }
  out.activeDates = [...days].sort();
  out.appeared ||= out.activeDates.length > 0;

  return out;
}

/**
 * What every source says of one person for one chain of seats (`QĐ-35c`, `FR-4.7`, `FR-4.10`): only what happened from the day its first link
 * could be used counts. A seat given again after a revocation inherits neither the old days of activity, nor an old appearance (a source counts
 * the person as seen only when one of its windows reaches that day), nor an old sign-in without use or an old change of mapping.
 */
export function chainEvidenceOf(
  sources: readonly EvidenceSource[],
  employeeId: string,
  usableOn: BusinessDate,
): PersonEvidence {
  const reaching = sources.filter((source) => source.windows.some((window) => window.to >= usableOn));
  const whole = personEvidenceOf(sources, employeeId);
  const since = personEvidenceOf(reaching, employeeId);
  const activeDates = daysOfChain(whole.activeDates, usableOn);
  const lastAuthOnlyDate =
    whole.lastAuthOnlyDate !== null && whole.lastAuthOnlyDate >= usableOn ? whole.lastAuthOnlyDate : null;

  return {
    ...whole,
    activeDates,
    appeared: since.appeared || activeDates.length > 0 || lastAuthOnlyDate !== null,
    inCollector: since.inCollector,
    lastAuthOnlyDate,
    mappingChangedOn:
      whole.mappingChangedOn !== null && whole.mappingChangedOn >= usableOn ? whole.mappingChangedOn : null,
  };
}

/**
 * The first day the confidence counts the days considered from (`FR-4.14` CF-4): the later of the day the seat could be used and the first day a
 * source that may conclude covers. A seat held long before the reports began is not short of coverage for the days no report could ever cover.
 */
export function consideredFrom(
  usableOn: BusinessDate,
  sources: readonly Pick<EvidenceSource, 'windows'>[],
): BusinessDate {
  const first = sources
    .flatMap((source) => source.windows.map((window) => window.from))
    .sort()
    .at(0);

  return first !== undefined && first > usableOn ? first : usableOn;
}

/** The days of a chain: only the ones from the day its first link could be used count (`QĐ-35c`: a seat given again after a revocation does not inherit the old days). */
export const daysOfChain = (activeDates: readonly BusinessDate[], usableOn: BusinessDate): BusinessDate[] =>
  activeDates.filter((day) => day >= usableOn);

/**
 * What a day of activity does to a recommendation nobody has decided on or whose reclaim was decided (`US-10-04` AC-5, `Q-92`): a day after the last day it
 * rests on (any day for a `G3`) denies it; a decided reclaim is kept and flagged with the first such day.
 */
export function reactionToActivity(
  record: { state: string; lastActiveDate: BusinessDate | null },
  activeDates: readonly BusinessDate[],
  decidedOn: BusinessDate | null,
): { kind: 'NONE' } | { kind: 'NEGATE' } | { kind: 'FLAG'; firstDay: BusinessDate } {
  const later = activeDates.filter((day) => record.lastActiveDate === null || day > record.lastActiveDate);
  if (record.state === 'RECLAIM_DECIDED') {
    const afterDecision = later.filter((day) => decidedOn === null || day > decidedOn);

    return afterDecision.length > 0 ? { kind: 'FLAG', firstDay: afterDecision[0] } : { kind: 'NONE' };
  }

  return later.length > 0 ? { kind: 'NEGATE' } : { kind: 'NONE' };
}
