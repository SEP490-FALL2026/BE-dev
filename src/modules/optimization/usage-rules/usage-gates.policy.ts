import { addDays, type BusinessDate } from '../../../core/business-date';
import type { EvidenceSource, UnmatchedEvidence } from '../../usage/public/usage-evidence.types';
import type { SeatStatus } from '../ghost-seat/ghost-seat-seat-state.repo';
import type { RuleSkipDetail } from '../rule-run/rule-run-skip-detail.json';
import type { SkipGate } from '../rule-run/rule-run.repo';
import { oneMonthAfter } from './usage-assessment.policy';

// The one state a seat has after the weekly pass (`FR-5.10`): no data and an unmatched identity are never read as inactive.
export type { SeatStatus };

export interface GateSkip {
  gate: SkipGate;
  status: SeatStatus;
  detail: RuleSkipDetail;
}

/** The status a seat shows for the gate that left it out: a seat left out for what it is (a machine account, a handover) is `EXCLUDED`. */
export function statusOfGate(gate: SkipGate): SeatStatus {
  switch (gate) {
    case 'NO_DATA':
      return 'NO_DATA';
    case 'UNMATCHED_IDENTITY':
      return 'UNMATCHED_IDENTITY';
    case 'COVERAGE':
    case 'STALE_SOURCE':
    case 'INSUFFICIENT_EVIDENCE':
      return 'INSUFFICIENT_EVIDENCE';
    default:
      return 'EXCLUDED';
  }
}

const skip = (gate: SkipGate, detail: RuleSkipDetail): GateSkip => ({ gate, status: statusOfGate(gate), detail });

export interface SeatGateFacts {
  kind: 'PERSONAL' | 'SERVICE';
  /** The seat is flagged as used for a machine account (`QĐ-110m`, `R-9`). */
  isMachineAccount: boolean;
  today: BusinessDate;
  handingOver: boolean;
  onLongLeave: boolean;
  /** The first day the seat could be used (`QĐ-77n`) of the first link of its chain; null while the grant or the invitation waits. */
  usableOn: BusinessDate | null;
  /** `GHOST_SEAT_NEW_ASSIGNMENT_GRACE_DAYS`. */
  graceDays: number;
  expectedEndDate: BusinessDate | null;
  exemptUntil: BusinessDate | null;
  liveRevocation: boolean;
}

const daysBetween = (from: BusinessDate, to: BusinessDate): number =>
  Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000);

/** A right with an end that falls within a month of `today` is left to run out (`R-J01`); one without an end is not. */
export function endsWithinMonth(expectedEndDate: BusinessDate | null, today: BusinessDate): boolean {
  return expectedEndDate !== null && expectedEndDate <= oneMonthAfter(today);
}

/**
 * The gates that look at the seat itself, in the order of `FR-4.9`, stopping at the first that leaves it out (`US-10-02`): a machine account (2),
 * a person on long leave or handing over — a head's seat is judged like any (`QĐ-104h`) (3), a seat that cannot be used yet or that is new (4),
 * a right that ends within a month, an exemption still running (7), a revocation under way (8).
 */
export function seatGateOf(facts: SeatGateFacts): GateSkip | null {
  // Gate 2 reads the flag of the seat (`QĐ-110m`); a service account of the earlier releases that was not converted yet is left out as well.
  if (facts.isMachineAccount || facts.kind === 'SERVICE') {
    return skip('SERVICE_ACCOUNT', { reason: facts.isMachineAccount ? 'machine account' : 'service account' });
  }
  if (facts.handingOver) return skip('LEAVE_OR_HANDOVER', { reason: 'handing over before leaving' });
  if (facts.onLongLeave) return skip('LEAVE_OR_HANDOVER', { reason: 'on long leave today' });
  if (facts.usableOn === null) return skip('NOT_USABLE', { reason: 'the grant or the invitation is still waiting' });
  if (daysBetween(facts.usableOn, facts.today) < facts.graceDays) {
    return skip('NEW_ASSIGNMENT', { reason: 'new seat', until: addDays(facts.usableOn, facts.graceDays) });
  }
  if (endsWithinMonth(facts.expectedEndDate, facts.today)) {
    return skip('TIME_BOUND_ENDING', { reason: 'the right ends within a month', until: facts.expectedEndDate! });
  }
  if (facts.exemptUntil !== null) return skip('EXEMPT', { reason: 'exempted by the head', until: facts.exemptUntil });
  if (facts.liveRevocation) return skip('REVOCATION_IN_PROGRESS', { reason: 'a revocation is under way' });

  return null;
}

/** What the sources of an application let the rule conclude (`US-10-03` AC-3, `QĐ-101b`, `FR-4.14a`). */
export type SourceVerdict =
  | { kind: 'USABLE'; sources: EvidenceSource[] }
  | { kind: 'NO_DATA' }
  | { kind: 'STALE'; staleSources: EvidenceSource[] }
  | { kind: 'INSUFFICIENT'; reason: string };

/** A source whose silence may be read as not used: fresh, able to tell the negative, and made for `G3`/`G4`. */
export const concludesAbsence = (source: EvidenceSource): boolean =>
  !source.stale &&
  source.canConcludeAbsence &&
  (source.detectableGroups.includes('G3') || source.detectableGroups.includes('G4'));

export function verdictOfSources(sources: readonly EvidenceSource[]): SourceVerdict {
  if (sources.length === 0) return { kind: 'NO_DATA' };
  const usable = sources.filter(concludesAbsence);
  if (usable.length > 0) return { kind: 'USABLE', sources: usable };
  const vendors = sources.filter((source) => source.kind === 'VENDOR');
  if (vendors.length > 0 && vendors.every((source) => source.stale)) {
    return { kind: 'STALE', staleSources: vendors };
  }
  const fresh = sources.filter((source) => !source.stale);
  const reason = fresh.every((source) => source.kind === 'COLLECTOR')
    ? 'only the collector is fresh: its silence never says not used'
    : fresh.some((source) => !source.canConcludeAbsence)
      ? 'the fresh source tells only who is a member or only what happened, not what did not'
      : 'no fresh source can detect a seat that is never or no longer used';

  return { kind: 'INSUFFICIENT', reason };
}

/**
 * Whether the person cannot be told from an identifier nobody could be tied to (`INV-12`, `TC-2`): not seen at all while the application still has
 * such an identifier, or among the people one that fits more than one may be. Nothing is concluded for them.
 */
export function unmatchedGateOf(input: {
  employeeId: string;
  appeared: boolean;
  unmatched: readonly UnmatchedEvidence[];
}): GateSkip | null {
  if (!input.appeared && input.unmatched.length > 0) {
    return skip('UNMATCHED_IDENTITY', { reason: 'not seen, and an identifier of the application is tied to no one' });
  }
  const candidate = input.unmatched.some(
    (identity) => identity.status === 'OPEN' && identity.candidateEmployeeIds.includes(input.employeeId),
  );

  return candidate ? skip('UNMATCHED_IDENTITY', { reason: 'an open identifier may be this person' }) : null;
}

/** Gate 5: the seat has not been covered for as many days as the tier of review asks (`US-10-02` AC-5, `US-10-03` AC-9). */
export function coverageGateOf(coverageDays: number, reviewDays: number): GateSkip | null {
  return coverageDays < reviewDays
    ? skip('COVERAGE', {
        reason: 'covered for fewer days than the review threshold',
        coverageDays,
        requiredDays: reviewDays,
      })
    : null;
}

/** What the sources of the application and the identity of the holder say before the days are counted: the gate that leaves the seat out, or null. */
export function evidenceGateOf(
  verdict: SourceVerdict,
  holder: { employeeId: string; appeared: boolean; unmatched: readonly UnmatchedEvidence[] },
): GateSkip | null {
  if (verdict.kind === 'NO_DATA') return skip('NO_DATA', { reason: 'no source has any usage of the application' });
  if (verdict.kind === 'STALE') {
    return skip('STALE_SOURCE', {
      reason: 'every report of the vendor is older than a week',
      sourceName: verdict.staleSources[0]?.name,
    });
  }
  if (verdict.kind === 'INSUFFICIENT') return skip('INSUFFICIENT_EVIDENCE', { reason: verdict.reason });

  return unmatchedGateOf({ employeeId: holder.employeeId, appeared: holder.appeared, unmatched: holder.unmatched });
}

export { skip as gateSkip };
