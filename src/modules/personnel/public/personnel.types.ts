import type { BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditValue } from '../../audit/public/audit.types';

/**
 * Who does an event of the personnel context: a person signed in to the application, or the ticket of the controlled
 * procedure `pnpm ops:record-super-admin-event`, which records an event about the Super Admin when the application cannot. Only the
 * HTTP controllers build `USER`; only the command builds `OPERATOR`, and the policy accepts it only when the person the event is
 * about holds the `SUPER_ADMIN` role. `context` is what the Audit Trail adds to the `after` of every event the command writes
 * (the ticket, the approver, the operator, the environment, the mode and the basis); it carries references, never a secret.
 */
export type PersonnelActor =
  | { kind: 'USER'; principal: AuthenticatedPrincipal }
  | { kind: 'OPERATOR'; ticketId: string; ticketRef: string; context?: { readonly [key: string]: AuditValue } };

export const userActor = (principal: AuthenticatedPrincipal): PersonnelActor => ({ kind: 'USER', principal });

/** The two columns that say who did an event: an application account or the ticket, exactly one of them set. */
export function actorColumns(actor: PersonnelActor): { appUserId: string | null; ticketId: string | null } {
  return actor.kind === 'USER'
    ? { appUserId: actor.principal.appUserId, ticketId: null }
    : { appUserId: null, ticketId: actor.ticketId };
}

/**
 * A long leave in the span a rule of the recommendations reads: the person is on leave from `startedOn` up to, and not including,
 * `endedOn` (the day they came back or the handover for leaving began); `endedOn` is null while the leave runs.
 */
export interface LeaveInterval {
  employeeId: string;
  startedOn: BusinessDate;
  endedOn: BusinessDate | null;
}

/**
 * The code the wire names, under the warnings of a departure, for the requests and grants of the person that are still open: how many
 * there are (`US-03-04` AC-24). It is a warning and never a blocker: nothing closes them by itself, and a case closes without them.
 */
export const OFFBOARDING_OPEN_REQUESTS = 'OPEN_REQUESTS_OF_LEAVER';

/**
 * The roles a person who leaves holds that someone must take over (`US-03-04` AC-11, AC-27, AC-28), as the wire names them and in the
 * order it lists them: the Super Admin, Finance, the spending approver, the IT Admin in charge of a department, the head of a
 * department and the owner or administrator of the workspace of a K2 plan. A flag warns; it never stops a record, a lock or a revocation.
 * The substitute and the fallback approver are gone (`QĐ-93c`, `QĐ-110`): the wire names neither. The database enum
 * `OffboardingRoleFlag` still holds both names (they leave it in a later contract pass), so a snapshot written before is read through
 * `knownFlags` (`role-duties.policy.ts`).
 */
export const ROLE_FLAGS = [
  'SUPER_ADMIN_HOLDER',
  'FINANCE',
  'SPENDING_APPROVER',
  'IT_ADMIN_IN_CHARGE',
  'DEPARTMENT_HEAD',
  'WORKSPACE_OWNER',
] as const;

export type RoleFlag = (typeof ROLE_FLAGS)[number];

/** Every flag with whether the person holds it: the shape the wire gives (a response has no list). */
export type RoleFlagMap = Record<RoleFlag, boolean>;

/**
 * The code the wire names, under the warnings of a departure, for the roles the person holds that need someone to take over: how many
 * flags there are. A warning and never a blocker (`QĐ-110j`).
 */
export const OFFBOARDING_ROLE_HOLDER = 'ROLE_HOLDER_NEEDS_REPLACEMENT';

/** The kinds of basis every personnel operation takes (`BM-04`); the controlled procedure checks its `--basis-type` against the same list. */
export const GROUNDS_TYPES = ['HR_DECISION', 'APPROVED_APPLICATION', 'WRITTEN_DIRECTIVE'] as const;

/**
 * A transfer of a person as the rules of wasted seats read it (`QĐ-90c`): it is _in overlap_ from the day it takes effect until it is
 * closed or cancelled. `closedAt` is set when the system closes it, once every right of the old department is taken back (`QĐ-110r`).
 */
export interface TransferFact {
  employeeId: string;
  transferId: string;
  fromDepartmentId: string;
  toDepartmentId: string;
  effectiveOn: BusinessDate;
  status: 'PENDING' | 'EFFECTIVE' | 'CANCELLED';
  closedAt: Date | null;
}

/** A person who is handing over before leaving (`OffboardingCase` `HANDING_OVER`): the seat of a rule that waits for the departure is not judged (`FR-4.9` gate 3). */
export interface HandingOverCase {
  employeeId: string;
  caseId: string;
  lastWorkingDay: BusinessDate;
  handoverDueOn: BusinessDate | null;
}
