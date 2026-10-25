import type { BusinessDate } from '../../../core/business-date';
import { addWorkingDays, type NonWorkingDates } from '../../../core/working-days';
import type { RevocationSource } from '../licensing.types';

/**
 * Who confirms that the data of a tool was handed over before its seat is taken away, and what a duty is allowed to say
 * (`US-03-09`, `US-07-09`, `QĐ-62c`, `QĐ-62e`, `QĐ-64a`, `QĐ-66p`, `QĐ-66u`, `QĐ-83c`). Pure: the services read the plan, the
 * organization and the calendar, and ask here.
 */
export type HandoverRole = 'DEPARTMENT_HEAD' | 'REQUESTER' | 'IT_ADMIN';
export type HandoverValue = 'HANDED_OVER' | 'NOT_NEEDED' | 'HANDLED';

/** What the role was when the confirmation was written: a head who is not yet in office confirms as the designated successor. */
export type HandoverConfirmedRole = 'DEPARTMENT_HEAD' | 'DESIGNATED_SUCCESSOR' | 'REQUESTER' | 'IT_ADMIN';

/** Why nobody is named for a duty yet: the department has no head, or the head who leaves has no successor designated. */
export type WaitingReason = 'NO_HEAD' | 'NO_SUCCESSOR';

/** One reason that asked for the revocation of the seat, as far as the table of confirmers is concerned. */
export interface SourceFact {
  source: RevocationSource;
  decidedByEmployeeId: string | null;
}

/** What a seat owes: the role that confirms, the person when the decision fixed one, and the source whose table row applies. */
export interface Requirement {
  source: RevocationSource;
  role: HandoverRole;
  fixedEmployeeId: string | null;
}

/** The sources a departure of the person opens: the head of the department confirms. */
const DEPARTURE_SOURCES: ReadonlySet<RevocationSource> = new Set(['DEPARTURE', 'ABRUPT_DEPARTURE']);
/** The sources the head who decided is fixed for. */
const DECIDED_BY_HEAD: ReadonlySet<RevocationSource> = new Set(['MANAGER_NOT_NEEDED', 'GHOST_SEAT']);
/** The sources whose handover is the business of the IT Admin. */
const IT_SOURCES: ReadonlySet<RevocationSource> = new Set([
  'TIME_LIMITED_EXPIRY',
  'SUBSCRIPTION_REDUCTION',
  'SUBSCRIPTION_CANCELLATION',
  'SUBSCRIPTION_EXPIRED',
  'NOT_LEGALIZED',
  'RE_EXECUTION',
]);

/** The handover of a person who leaves says what became of the data; every other source says it was handled. */
export function allowedValues(source: RevocationSource): readonly HandoverValue[] {
  return DEPARTURE_SOURCES.has(source) ? ['HANDED_OVER', 'NOT_NEEDED'] : ['HANDLED'];
}

export function isValueAllowed(source: RevocationSource, value: string): value is HandoverValue {
  return (allowedValues(source) as readonly string[]).includes(value);
}

/** Whether the removal of a seat asks for a confirmation at all: a planned departure always does (`QĐ-66p`), the rest only when data is lost. */
export function requiresConfirmation(source: RevocationSource, dataLossOnRemoval: boolean): boolean {
  return source === 'DEPARTURE' || dataLossOnRemoval;
}

function roleOf(fact: SourceFact): { role: HandoverRole; fixedEmployeeId: string | null } {
  if (fact.source === 'RETURN') return { role: 'REQUESTER', fixedEmployeeId: fact.decidedByEmployeeId };
  if (DECIDED_BY_HEAD.has(fact.source)) return { role: 'DEPARTMENT_HEAD', fixedEmployeeId: fact.decidedByEmployeeId };
  if (IT_SOURCES.has(fact.source)) return { role: 'IT_ADMIN', fixedEmployeeId: null };

  return { role: 'DEPARTMENT_HEAD', fixedEmployeeId: null };
}

/**
 * What the seat owes given every reason that asked for its revocation, the first first. A seat that two reasons ask for is
 * confirmed once (`QĐ-64a`, `QĐ-66u`): the person who decided or the head wins over the IT Admin, so a seat that is ghost and also
 * reduced is confirmed by the head who chose to take it back and never again by the IT Admin. Null when no reason asks for one.
 */
export function requirementOf(facts: readonly SourceFact[], dataLossOnRemoval: boolean): Requirement | null {
  const asked = facts
    .filter((fact) => requiresConfirmation(fact.source, dataLossOnRemoval))
    .map((fact) => ({ source: fact.source, ...roleOf(fact) }))
    // A return with nobody who sent it (an old record) has nobody to ask.
    .filter((requirement) => requirement.role !== 'REQUESTER' || requirement.fixedEmployeeId !== null);

  return asked.find((requirement) => requirement.role !== 'IT_ADMIN') ?? asked[0] ?? null;
}

/** An open duty of the IT Admin takes the head of a later reason instead; an open duty of anyone else is left as it is. */
export function takesOver(open: { role: HandoverRole }, required: Requirement): boolean {
  return open.role === 'IT_ADMIN' && required.role !== 'IT_ADMIN';
}

/** Whether a confirmation already written answers what the seat owes now, so nobody is asked again (`US-07-09` AC-12). */
export function confirmationCovers(
  confirmed: { role: HandoverConfirmedRole; byEmployeeId: string },
  required: Requirement,
): boolean {
  if (required.role === 'IT_ADMIN') return true;
  if (required.fixedEmployeeId !== null) return confirmed.byEmployeeId === required.fixedEmployeeId;
  if (required.role === 'REQUESTER') return false;

  return confirmed.role === 'DEPARTMENT_HEAD' || confirmed.role === 'DESIGNATED_SUCCESSOR';
}

/** The deadline of a short handover: a number of working days after the day the revocation was asked for. */
export function shortDueOn(today: BusinessDate, workingDays: number, nonWorkingDates: NonWorkingDates): BusinessDate {
  return addWorkingDays(today, workingDays, nonWorkingDates);
}

/** The duty as the policy sees it: what is stored, never who is in office. */
export interface DutyFacts {
  confirmerRole: HandoverRole;
  confirmerEmployeeId: string | null;
  leaverIsHead: boolean;
  employeeId: string;
}

/** Who holds the office a duty looks for: the head of the department today, and the head on the day after the last day. */
export interface HeadFacts {
  headTodayId: string | null;
  headOnResolveDayId: string | null;
}

export interface Confirmer {
  /** The person who may confirm; null for the IT Admin (any holder of the role) and while nobody is named. */
  employeeId: string | null;
  waiting: WaitingReason | null;
}

/**
 * The person a duty falls to, read from the organization when asked and never kept (`US-03-09` AC-6, AC-10, `US-07-09` AC-18):
 * a head who arrives before the deadline takes the duty with the deadline it had, and a department without a head, or a head who
 * leaves with no successor, leaves it waiting with nobody named: not the IT Admin, not a fallback approver, not the person leaving.
 */
export function confirmerOf(duty: DutyFacts, heads: HeadFacts): Confirmer {
  if (duty.confirmerRole === 'IT_ADMIN') return { employeeId: null, waiting: null };
  if (duty.confirmerEmployeeId !== null) return { employeeId: duty.confirmerEmployeeId, waiting: null };

  const head = duty.leaverIsHead ? heads.headOnResolveDayId : heads.headTodayId;
  if (head === null || head === duty.employeeId) {
    return { employeeId: null, waiting: duty.leaverIsHead ? 'NO_SUCCESSOR' : 'NO_HEAD' };
  }

  return { employeeId: head, waiting: null };
}

/** The role a person confirms in, as it is when they do: a successor who is not yet the head of the department is said to be one. */
export function confirmedRoleOf(
  duty: DutyFacts,
  confirmerEmployeeId: string,
  headTodayId: string | null,
): HandoverConfirmedRole {
  if (duty.confirmerRole === 'IT_ADMIN') return 'IT_ADMIN';
  if (duty.confirmerRole === 'REQUESTER') return 'REQUESTER';

  return duty.leaverIsHead && duty.confirmerEmployeeId === null && headTodayId !== confirmerEmployeeId
    ? 'DESIGNATED_SUCCESSOR'
    : 'DEPARTMENT_HEAD';
}

/** Past the deadline when the day is after it: the deadline is the end of its day. */
export function isOverdue(dueOn: BusinessDate, today: BusinessDate): boolean {
  return today > dueOn;
}

/**
 * What an unconfirmed duty does to the work on the seat: holds it until the confirmation or the end of the deadline (`HELD`), lets
 * it go on and flags the work as done without the confirmation (`FLAGGED`), or has nothing to say (`OPEN`: confirmed or cancelled).
 */
export type Gate = 'OPEN' | 'HELD' | 'FLAGGED';

export function gateOf(
  duty: { confirmed: boolean; cancelled: boolean; dueOn: BusinessDate },
  today: BusinessDate,
): Gate {
  if (duty.confirmed || duty.cancelled) return 'OPEN';

  return isOverdue(duty.dueOn, today) ? 'FLAGGED' : 'HELD';
}
