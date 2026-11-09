import type { BusinessDate } from '../../../core/business-date';
import { checkBeneficiary, type BeneficiaryRefusal } from './beneficiary-eligibility.policy';

/**
 * The rules of sending a request for a group of people of one department (`US-05-17`), as pure decisions: which plans take
 * a group, how many people, and what each person must have. The plan is judged by the kind of grant it makes and never by its
 * name (`AC-14`); every reason of every person is gathered, so the sender learns all of them at once (`AC-2`, `AC-12`).
 */

/** The most people an Employee names in one request (`QĐ-82h`). */
export const GROUP_EMPLOYEE_MAX = 10;
/** The fewest different people a request for a group names, whoever sends it (`QĐ-100aa`, `S-01`). */
export const GROUP_LINES_MIN = 2;
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
  /** The minimum when fewer than that many different people were named. */
  tooFew: { min: number } | null;
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

  const tooFew = seen.size < GROUP_LINES_MIN ? { min: GROUP_LINES_MIN } : null;

  return { tooMany: facts.requested.length > max ? { max } : null, tooFew, duplicates: [...duplicates] };
}

/** The first reason a person cannot be a line, in the order a caller should learn it; the spending approver is never a party of a Request, so they come first (`D-S21`). */
export type LineReason =
  'SPENDING_APPROVER' | 'HEAD_IN_GROUP' | 'OUTSIDE_DEPARTMENT' | BeneficiaryRefusal | 'TERM_REQUIRED' | 'HAS_ACCESS' | 'HAS_OPEN_REQUEST';

/** What is known of one person who was named, read on the day. */
export interface LineFacts {
  employeeId: string;
  /** The department of the person on the day; null when they have none or are not in the company. */
  departmentId: string | null;
  active: boolean;
  workEmail: string | null;
  employmentType: string;
  hireDate: BusinessDate;
  /** The person holds a seat of the plan today. */
  holdsAccess: boolean;
  /** A request for the plan is open for the person: another of their own, or a line of another group. */
  hasOpenRequest: boolean;
  /** The sender heads the department and this is their own line: it asks for no email and no end day. */
  isDepartmentHead?: boolean;
  /** The person is not staff and the group names no end date: a contractor, a freelancer or an intern gets access for a term (`FR-2.8`). */
  termRequired: boolean;
  /** The person holds the spending approver role: they are no party of a Request, and the reason comes before any other. */
  spendingApprover: boolean;
}

export interface RefusedLine {
  employeeId: string;
  reason: LineReason;
}

/**
 * The first reason each person cannot be in the request, in the order a caller should learn it; a person with none is not listed.
 * `departmentId` is the department of the sender: only its people can be named (`AC-2`).
 */
export function checkLines(departmentId: string, people: readonly LineFacts[]): RefusedLine[] {
  const refused: RefusedLine[] = [];
  for (const person of people) {
    const reason = reasonFor(departmentId, person);
    if (reason !== null) refused.push({ employeeId: person.employeeId, reason });
  }

  return refused;
}

function reasonFor(departmentId: string, person: LineFacts): LineReason | null {
  if (person.spendingApprover) return 'SPENDING_APPROVER';
  if (person.isDepartmentHead) return 'HEAD_IN_GROUP';
  if (person.departmentId !== departmentId) return 'OUTSIDE_DEPARTMENT';
  const refusal = checkBeneficiary(
    {
      active: person.active,
      workEmail: person.workEmail,
      employmentType: person.employmentType,
    },
    { skipContact: false },
  );
  if (refusal !== null) return refusal;
  if (person.termRequired) return 'TERM_REQUIRED';
  if (person.holdsAccess) return 'HAS_ACCESS';

  return person.hasOpenRequest ? 'HAS_OPEN_REQUEST' : null;
}
