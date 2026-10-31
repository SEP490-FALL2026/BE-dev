import type { BusinessDate } from '../../../core/business-date';
import { checkBeneficiary, type BeneficiaryRefusal } from './beneficiary-eligibility.policy';

/**
 * The rules of sending a request for a group of people of one department (`US-05-17`), as pure decisions: which plans take
 * a group, how many people, and what each person must have. The plan is judged by the kind of grant it makes and never by its
 * name (`AC-14`); every reason of every person is gathered, so the sender learns all of them at once (`AC-2`, `AC-12`).
 */

/** The most people an Employee names in one request (`QĐ-82h`). */
export const GROUP_EMPLOYEE_MAX = 10;
/** The most people a head names: a technical bound against a typing slip, since the Story leaves it to the design (`AC-13`). */
export const GROUP_HEAD_MAX = 100;

export type PlanRefusal =
  /** The plan does not give each person an account of their own in one workspace (K2): a group takes nothing else (`AC-14`). */
  | 'KIND_NOT_MULTI_SEAT'
  /** Internal software has no fee, so no spend step: a group is for paid software (`AC-5`). */
  | 'NOT_PAID_SOFTWARE';

/**
 * Whether a plan takes a group. The kind of grant decides, not the name: K2 is the only kind that gives each person an account of
 * their own, and K3 is not grantable yet, K4 is bound to a device and K5 has no seat.
 */
export function checkGroupPlan(plan: {
  applicationKind: 'SAAS' | 'LICENSED' | 'INTERNAL';
  provisioningType: 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
}): PlanRefusal | null {
  if (plan.applicationKind === 'INTERNAL') return 'NOT_PAID_SOFTWARE';

  return plan.provisioningType === 'K2' ? null : 'KIND_NOT_MULTI_SEAT';
}

/** The most people the sender may name. */
export const maxLines = (senderIsHead: boolean): number => (senderIsHead ? GROUP_HEAD_MAX : GROUP_EMPLOYEE_MAX);

export interface LineCountFacts {
  senderIsHead: boolean;
  /** The people as named, in order, duplicates included. */
  requested: readonly string[];
}

export interface LineCountRefusals {
  /** The maximum when more were named than the sender may name. */
  tooMany: { max: number } | null;
  /** The people named more than once, each once. */
  duplicates: string[];
}

export function checkLineCount(facts: LineCountFacts): LineCountRefusals {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of facts.requested) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  const max = maxLines(facts.senderIsHead);

  return { tooMany: facts.requested.length > max ? { max } : null, duplicates: [...duplicates] };
}

export type LineReason = 'OUTSIDE_DEPARTMENT' | BeneficiaryRefusal | 'HAS_ACCESS' | 'HAS_OPEN_REQUEST';

/** What is known of one person who was named, read on the day. */
export interface LineFacts {
  employeeId: string;
  /** The department of the person on the day; null when they have none or are not in the company. */
  departmentId: string | null;
  active: boolean;
  workEmail: string | null;
  employmentType: string;
  hireDate: BusinessDate;
  /** The day the access of this person ends, when the sender gave one. */
  expectedEndDate: BusinessDate | undefined;
  /** The person holds a seat of the plan today. */
  holdsAccess: boolean;
  /** A request for the plan is open for the person: another of their own, or a line of another group. */
  hasOpenRequest: boolean;
  /** The sender heads the department and this is their own line: it asks for no email and no end day. */
  isHeadOwnLine: boolean;
}

export interface RefusedLine {
  employeeId: string;
  reason: LineReason;
}

/**
 * The first reason each person cannot be in the request, in the order a caller should learn it; a person with none is not listed.
 * `departmentId` is the department of the sender: only its people can be named (`AC-2`).
 */
export function checkLines(departmentId: string, people: readonly LineFacts[], today: BusinessDate): RefusedLine[] {
  const refused: RefusedLine[] = [];
  for (const person of people) {
    const reason = reasonFor(departmentId, person, today);
    if (reason !== null) refused.push({ employeeId: person.employeeId, reason });
  }

  return refused;
}

function reasonFor(departmentId: string, person: LineFacts, today: BusinessDate): LineReason | null {
  if (person.departmentId !== departmentId) return 'OUTSIDE_DEPARTMENT';
  const refusal = checkBeneficiary(
    {
      active: person.active,
      workEmail: person.workEmail,
      employmentType: person.employmentType,
      hireDate: person.hireDate,
      today,
      expectedEndDate: person.expectedEndDate,
    },
    { skipContact: person.isHeadOwnLine },
  );
  if (refusal !== null) return refusal;
  if (person.holdsAccess) return 'HAS_ACCESS';

  return person.hasOpenRequest ? 'HAS_OPEN_REQUEST' : null;
}

/** A long term is confirmed in so many words by the head who sends it, or by the head who decides it when an Employee sent it. */
export const needsTermConfirmation = (input: {
  senderIsHead: boolean;
  termMonths: number;
  confirmed: boolean;
  longTermMonths: number;
}): boolean => input.senderIsHead && input.termMonths > input.longTermMonths && !input.confirmed;
