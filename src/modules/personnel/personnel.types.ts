import type { BusinessDate } from '../../core/business-date';

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
 * The code the wire names for the service accounts that still have nobody to answer for them: the blocker of closing a departure and
 * of closing a transfer (`US-03-08`).
 */
export const SERVICE_ACCOUNT_UNASSIGNED = 'SERVICE_ACCOUNT_UNASSIGNED';

/**
 * The code the wire names, under the warnings of a departure, for the requests and grants of the person that are still open: how many
 * there are (`US-03-04` AC-24). It is a warning and never a blocker: nothing closes them by itself, and a case closes without them.
 */
export const OFFBOARDING_OPEN_REQUESTS = 'OPEN_REQUESTS_OF_LEAVER';

/**
 * The roles a person who leaves holds that someone must take over (`US-03-04` AC-11, AC-27, AC-28), as the wire names them and in the
 * order it lists them: the Super Admin, Finance, the three approval roles, the IT Admin in charge of a department, the head of a
 * department and the owner or administrator of the workspace of a K2 plan. A flag warns; it never stops a record, a lock or a revocation.
 */
export const ROLE_FLAGS = [
  'SUPER_ADMIN_HOLDER',
  'FINANCE',
  'SPENDING_APPROVER',
  'SUBSTITUTE_APPROVER',
  'FALLBACK_APPROVER',
  'IT_ADMIN_IN_CHARGE',
  'DEPARTMENT_HEAD',
  'WORKSPACE_OWNER',
] as const;

export type RoleFlag = (typeof ROLE_FLAGS)[number];

/** Every flag with whether the person holds it: the shape the wire gives (a response has no list). */
export type RoleFlagMap = Record<RoleFlag, boolean>;

/**
 * The code the wire names, under the warnings of a departure, for the roles the person holds that need someone to take over: how many
 * flags there are. A warning and never a blocker. The code the blocker of the workspaces they still own or administer carries is below.
 */
export const OFFBOARDING_ROLE_HOLDER = 'ROLE_HOLDER_NEEDS_REPLACEMENT';

/** The code the wire names for the workspaces of K2 plans the person still owns or administers: it keeps the departure from closing. */
export const WORKSPACE_OWNER_NOT_TRANSFERRED = 'WORKSPACE_OWNER_NOT_TRANSFERRED';
