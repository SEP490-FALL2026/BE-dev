import type { InAppNotificationCode } from '../public/notifications.types';

/**
 * Where a person goes when they open a notice: the read route the interface should show, by its `operationId` in the contract and the
 * values of its path parameters, or null when no single screen is known and the interface shows the list of notices. Pure and
 * table-driven: the catalogue of notifications (column "Bấm vào mở") is the source, and `notification-target.policy.spec.ts` reads
 * `openapi.json` so that every operation named here exists, is a GET and gets exactly its path parameters.
 */
export interface NotificationTarget {
  operationId: string;
  pathParams: Record<string, string>;
}

/** A route of a table: where each path parameter is read from — `'subject'` is `subject.id`, any other value is a key of `params`. */
export interface RouteRef {
  readonly operationId: string;
  readonly pathParams: Readonly<Record<string, string>>;
}

/** A route chosen by `params.audience` (who the notice is told as); an audience not in `cases` takes `otherwise`, or the table of the subject. */
export interface AudienceRoutes {
  readonly by: 'audience';
  readonly cases: Readonly<Record<string, RouteRef>>;
  readonly otherwise?: RouteRef;
}

const route = (operationId: string, pathParams: Readonly<Record<string, string>> = {}): RouteRef => ({
  operationId,
  pathParams,
});

const ME_RIGHTS = route('meSoftwareRightList');
const EXPIRY_REMINDERS = route('assignmentExpiryReminderList');
const EMPLOYEE_OF_PARAMS = route('employeeGet', { id: 'employeeId' });

/**
 * By code, tried first: a code whose screen is not the one of its subject. A route whose parameter has no value falls to the table of
 * the subject. `null` says the catalogue names no single screen for the code (two screens, or one the recipient cannot be told apart
 * for), so there is no target at all and the subject is not tried.
 */
export const TARGET_BY_CODE: Readonly<Partial<Record<InAppNotificationCode, RouteRef | AudienceRoutes | null>>> = {
  // MF-1: the task or the check of the request, not the request itself.
  WITHDRAWAL_AWAITING_IT_CLOSE: route('provisioningTaskGet', { id: 'taskId' }),
  GRANT_TASK_CANCELLED: route('provisioningTaskGet', { id: 'taskId' }),
  REQUEST_RESERVE_CONFIRMATION_NEEDED: route('budgetCheckGet', { id: 'subject' }),
  RETURN_REQUESTED: route('returnRequestGet', { id: 'subject' }),
  RETURN_COMPLETED: route('returnRequestGet', { id: 'subject' }),
  RETURN_FAILED: route('returnRequestGet', { id: 'subject' }),
  STEP_BACKLOG_ALERT: route('stepCongestionList'),
  // MF-2 and MF-3.
  DEPARTURE_ACCESS_BLOCKED: route('offboardingCaseGet', { id: 'subject' }),
  TRANSFER_REVIEW_DUE: EMPLOYEE_OF_PARAMS,
  TRANSFER_GRACE_STARTED: {
    by: 'audience',
    cases: {
      MOVER: route('meDepartmentTransferGet'),
      HEAD: route('departmentTransferGet', { id: 'subject' }),
      IT_ADMIN: route('departmentTransferGet', { id: 'subject' }),
    },
  },
  TRANSFER_GRACE_ENDING: route('meDepartmentTransferGet'),
  TRANSFER_RIGHTS_REVOKING: null, // the mover reads their rights, the IT Admin the transfer: nothing in the notice tells which
  // Budgets: the screens that list, where the subject is not one record to read.
  BUDGET_NEXT_YEAR_MISSING: route('budgetTable'),
  BUDGET_REVIEW_DUE: route('budgetReviewPeriodList'),
  BUDGET_SHARED_POOL_OVER_RESERVE: route('budgetSummary'),
  BUDGET_THRESHOLD_REACHED: route('budgetTable'),
  BUDGET_ADJUSTMENT_REQUESTED: route('budgetAdjustmentList'),
  BUDGET_ADJUSTMENT_DECIDED: route('budgetAdjustmentList'),
  // MF-5: the queue, not the one recommendation that happened to start the notice; the rights of the holder.
  GHOST_SEAT_NEW: route('ghostSeatQueueList'),
  GHOST_SEAT_WAITING_FOR_HEAD: route('departmentWarningList'),
  GHOST_SEAT_EXEMPTION_ENDING: route('ghostSeatExemptionList'),
  REVOCATION_UPCOMING: ME_RIGHTS,
  REVOCATION_CANCELLED: ME_RIGHTS,
  USAGE_TRACKING_NOTICE: null, // the route wants the recipient's own employee id, which the notice does not carry
  USAGE_SOURCE_STALE: route('usageSourceList'),
  // SBF-03: the holder reads their rights, the head and the IT Admin the reminders.
  LICENSE_EXPIRY_REMINDER: {
    by: 'audience',
    cases: { EMPLOYEE: ME_RIGHTS, HEAD: EXPIRY_REMINDERS, IT_ADMIN: EXPIRY_REMINDERS },
  },
  RENEWAL_WINDOW_OPENED: { by: 'audience', cases: { EMPLOYEE: ME_RIGHTS, HEAD: EXPIRY_REMINDERS } },
  // Read-only codes whose own screen is gone: the catalogue sends to the employee.
  HANDOVER_CONFIRMATION_DUE: EMPLOYEE_OF_PARAMS,
  HANDOVER_CONFIRMATION_OVERDUE: EMPLOYEE_OF_PARAMS,
  SERVICE_ACCOUNT_RESPONSIBLE_DUE: EMPLOYEE_OF_PARAMS,
  SERVICE_ACCOUNT_RESPONSIBLE_OVERDUE: EMPLOYEE_OF_PARAMS,
  // Software of a department and the handover to an IT Admin.
  DEPARTMENT_SOFTWARE_PROPOSED: route('departmentSoftwareProposalList'),
  DEPARTMENT_SOFTWARE_PROPOSAL_DECIDED: route('meDepartmentSoftwareList'),
  IT_ADMIN_HANDOVER_RECEIVED: null, // the catalogue names two lists (subscriptions, applications)
};

/**
 * By `subject.type` (canonical), tried when the code has no route of its own: one line for each type of the catalogue that has a route
 * to read one record. Not here, for want of such a route: `APPLICATION`, `BUDGET_ADJUSTMENT`, `COST_CENTER`,
 * `DEPARTMENT_SOFTWARE_PROPOSAL`, `HANDOVER_DUTY`, `LICENSE_ASSIGNMENT`, `TRANSFER_REVIEW`.
 */
export const TARGET_BY_SUBJECT_TYPE: Readonly<Record<string, RouteRef>> = {
  ACCESS_REQUEST: route('accessRequestGet', { id: 'subject' }),
  BUDGET_CYCLE: route('budgetCycleGet', { year: 'year' }),
  BUDGET_PROPOSAL: route('budgetProposalGet', { id: 'subject' }),
  BUDGET_REVIEW_PERIOD: route('budgetReviewPeriodGet', { id: 'subject' }),
  BUDGET_VERSION: route('budgetVersionGet', { id: 'subject' }),
  DEPARTMENT: route('departmentGet', { id: 'subject' }),
  DEPARTMENT_TRANSFER: route('departmentTransferGet', { id: 'subject' }),
  EMPLOYEE: route('employeeGet', { id: 'subject' }),
  EMPLOYEE_LEAVE: route('longLeaveGet', { id: 'subject' }),
  GHOST_SEAT_RECOMMENDATION: route('ghostSeatRecommendationGet', { id: 'subject' }),
  OFFBOARDING_CASE: route('offboardingCaseGet', { id: 'subject' }),
  PERSONNEL_NOTICE: route('personnelNoticeGet', { id: 'subject' }),
  PLAN: route('planGet', { id: 'subject' }),
  POLICY_VERSION: route('policyGet', { code: 'policyCode' }),
  PROVISIONING_TASK: route('provisioningTaskGet', { id: 'subject' }),
  PURCHASE_INVOICE: route('purchaseInvoiceGet', { id: 'subject' }),
  RETURN_REQUEST: route('returnRequestGet', { id: 'subject' }),
  SUBSCRIPTION: route('subscriptionGet', { id: 'subject' }),
  SUBSCRIPTION_RENEWAL: route('subscriptionRenewalGet', { id: 'subject' }),
};

/** The spellings that were written before `subject.type` became `UPPER_SNAKE`; hold rows and old notices still carry them. */
const CANONICAL_SUBJECT_TYPE: Readonly<Record<string, string>> = {
  LicenseAssignment: 'LICENSE_ASSIGNMENT',
  ProvisioningTask: 'PROVISIONING_TASK',
  HandoverDuty: 'HANDOVER_DUTY',
  Employee: 'EMPLOYEE',
};

const UPPER_SNAKE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;

const own = <T>(table: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;

/** The type as it goes on the wire: an old spelling becomes its `UPPER_SNAKE` form, any other value is kept. */
export function canonicalSubjectType(type: string): string {
  return own(CANONICAL_SUBJECT_TYPE, type) ?? type;
}

/** Whether a subject type is `UPPER_SNAKE` (letters and digits in upper case, words joined by one underscore). */
export function isUpperSnakeSubjectType(type: string): boolean {
  return UPPER_SNAKE.test(type);
}

function valueOf(
  source: string,
  subject: { type: string; id: string } | null,
  params: Readonly<Record<string, unknown>>,
): string | null {
  const value = source === 'subject' ? subject?.id : own(params, source);
  if (typeof value === 'string') return value === '' ? null : value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);

  return null;
}

/** The target of a route, or null when one of its path parameters has no value. */
function resolve(
  ref: RouteRef,
  subject: { type: string; id: string } | null,
  params: Readonly<Record<string, unknown>>,
): NotificationTarget | null {
  const pathParams: Record<string, string> = {};
  for (const [name, source] of Object.entries(ref.pathParams)) {
    const value = valueOf(source, subject, params);
    if (value === null) return null;
    pathParams[name] = value;
  }

  return { operationId: ref.operationId, pathParams };
}

function routeOfCode(
  entry: RouteRef | AudienceRoutes,
  params: Readonly<Record<string, unknown>>,
): RouteRef | undefined {
  if (!('by' in entry)) return entry;
  const audience = params.audience;

  return (typeof audience === 'string' ? own(entry.cases, audience) : undefined) ?? entry.otherwise;
}

/**
 * The screen a notice opens: the table of its code first, then the table of its subject type; null when neither gives a route with all
 * its path parameters, or when the table of the code says there is none. Accepts any code (a notice may outlive its code) and never throws.
 */
export function notificationTarget(
  code: string,
  subject: { type: string; id: string } | null,
  params: Readonly<Record<string, unknown>>,
): NotificationTarget | null {
  const entry = own(TARGET_BY_CODE as Readonly<Record<string, RouteRef | AudienceRoutes | null>>, code);
  if (entry === null) return null;
  const byCode = entry === undefined ? undefined : routeOfCode(entry, params);
  const fromCode = byCode === undefined ? null : resolve(byCode, subject, params);
  if (fromCode !== null) return fromCode;
  if (subject === null) return null;
  const bySubject = own(TARGET_BY_SUBJECT_TYPE, canonicalSubjectType(subject.type));

  return bySubject === undefined ? null : resolve(bySubject, subject, params);
}
