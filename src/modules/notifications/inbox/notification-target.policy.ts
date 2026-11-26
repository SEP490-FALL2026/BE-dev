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
  // SBF-20: the result of an adjustment is read as the renewal case; the other notices of a subscription open the subscription (its subject).
  SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED: route('subscriptionRenewalGet', { id: 'renewalId' }),
  SUBSCRIPTION_SEATS_BOUGHT: route('subscriptionGet', { id: 'subscriptionId' }),
  SEAT_PURCHASE_INVOICE_OVERDUE: route('subscriptionGet', { id: 'subscriptionId' }),
  SEAT_LEDGER_VENDOR_RECORDED: route('subscriptionGet', { id: 'subscriptionId' }),
  SUBSCRIPTION_PRICE_REVIEW: route('subscriptionGet', { id: 'subscriptionId' }),
  // The incident is also told to the person who decides spending, who may not read a subscription: the list of deadline events is open to all three recipients.
  SUBSCRIPTION_AUTO_RENEWAL_INCIDENT: route('subscriptionDeadlineEventList'),
  // Operations round: a list for the notices whose subject is not one record the recipient can read.
  OUT_OF_PROCESS_CASE_REPORTED: null, // the person and their head have no route that reads the case (`outOfProcessCaseList` is for the IT Admin)
  VENDOR_ACCOUNT_DISCREPANCY_OPENED: route('vendorAccountDiscrepancyList'),
  DEVICE_STOP_REQUESTED: route('deviceStopRequestList'),
  DEVICE_STOP_REQUEST_OVERDUE: route('deviceStopRequestList'),
  SAAS_ISSUE_AWAITING_ASSIGNEE: route('saasIssueList'),
  DEPARTMENT_IT_SUBSTITUTE_APPOINTED: route('departmentItSubstituteList'),
  DEPARTMENT_IT_SUBSTITUTE_ENDED: route('departmentItSubstituteList'),
  DEPARTMENT_IT_COVERAGE_MISSING: route('departmentGet', { id: 'departmentId' }),
  DEVICE_RETURN_OVERDUE: route('deviceReturnTaskList'),
  DEVICE_RETURN_WAITING: route('deviceReturnTaskList'),
  UNPLACED_WORK_WAITING: route('unplacedWorkDesignationList'),
  UNPLACED_WORK_DESIGNATED: route('unplacedWorkDesignationList'),
  WORKSPACE_ADMIN_NOT_WORKING: route('workspaceGet', { id: 'workspaceId' }),
};

/**
 * The roles that read a route, for the routes that a controller or a service narrows: a route not listed is read by every signed-in
 * person (the notice is about them or their work). The recipients spec reads the controllers and checks this table says what they say;
 * the routes marked "service" have no role guard and their service narrows the reader.
 */
export const ROUTE_READERS: Readonly<Record<string, readonly string[]>> = {
  budgetAdjustmentList: ['FINANCE', 'SPENDING_APPROVER', 'MANAGER'],
  budgetCycleGet: ['FINANCE', 'SPENDING_APPROVER'],
  budgetMine: ['MANAGER'],
  budgetMineVersionList: ['MANAGER'],
  budgetProposalGet: ['FINANCE', 'MANAGER'], // service: Finance reads every proposal, a head those of their Cost Center
  budgetReviewPeriodGet: ['FINANCE', 'SPENDING_APPROVER', 'MANAGER'],
  budgetReviewPeriodList: ['FINANCE', 'SPENDING_APPROVER', 'MANAGER'],
  budgetSummary: ['FINANCE', 'SPENDING_APPROVER'],
  budgetTable: ['FINANCE', 'SPENDING_APPROVER'],
  budgetVersionGet: ['FINANCE', 'SPENDING_APPROVER'], // service: only Finance and the spending approver read a version
  departmentGet: ['SUPER_ADMIN', 'IT_ADMIN', 'MANAGER'],
  departmentItSubstituteList: ['SUPER_ADMIN', 'IT_ADMIN'],
  departmentSoftwareProposalList: ['IT_ADMIN', 'MANAGER'],
  departmentTransferGet: ['SUPER_ADMIN', 'IT_ADMIN'],
  departmentWarningList: ['SUPER_ADMIN', 'IT_ADMIN'],
  deviceReturnTaskList: ['IT_ADMIN', 'SUPER_ADMIN'],
  deviceStopRequestList: ['IT_ADMIN'],
  employeeGet: ['SUPER_ADMIN'],
  ghostSeatExemptionList: ['MANAGER', 'IT_ADMIN'],
  ghostSeatQueueList: ['MANAGER'],
  ghostSeatRecommendationGet: ['IT_ADMIN', 'MANAGER'],
  licenseLotGet: ['IT_ADMIN', 'FINANCE', 'SUPER_ADMIN'],
  longLeaveGet: ['SUPER_ADMIN', 'IT_ADMIN'],
  offboardingCaseGet: ['SUPER_ADMIN', 'IT_ADMIN'],
  personnelNoticeGet: ['SUPER_ADMIN', 'IT_ADMIN', 'MANAGER'],
  planGet: ['IT_ADMIN', 'FINANCE'],
  provisioningTaskGet: ['IT_ADMIN'],
  purchaseInvoiceGet: ['IT_ADMIN', 'FINANCE'],
  stepCongestionList: ['SUPER_ADMIN'],
  subscriptionDeadlineEventList: ['IT_ADMIN', 'FINANCE', 'SPENDING_APPROVER', 'SUPER_ADMIN'],
  subscriptionGet: ['IT_ADMIN', 'FINANCE'],
  subscriptionRenewalGet: ['IT_ADMIN', 'FINANCE', 'MANAGER'], // service: the IT Admin, Finance and the head of the owning department
  unplacedWorkDesignationList: ['SUPER_ADMIN', 'IT_ADMIN'],
  usageSourceList: ['IT_ADMIN'],
  vendorAccountDiscrepancyList: ['IT_ADMIN'],
  workspaceGet: ['IT_ADMIN', 'FINANCE', 'SUPER_ADMIN'],
};

/** Where a reader who may not read a route goes instead, tried in order; `selfOnly` is for a notice about the reader (their own record). */
export const ALTERNATIVES: Readonly<
  Record<string, readonly { readonly route: RouteRef; readonly selfOnly?: boolean }[]>
> = {
  // The head of a department reads the budget of their department, not the cycle or the table of the company.
  budgetCycleGet: [{ route: route('budgetMine') }],
  budgetVersionGet: [{ route: route('budgetMineVersionList') }],
  budgetTable: [{ route: route('budgetMine') }],
  budgetSummary: [{ route: route('budgetMine') }],
  // The person moved or leaving reads their own case; nobody else is given a route they cannot read.
  departmentTransferGet: [{ route: route('meDepartmentTransferGet'), selfOnly: true }],
  offboardingCaseGet: [{ route: route('meDepartureNoticeGet'), selfOnly: true }],
  // The employee reads their own profile through `/me`; the directory is for the Super Admin.
  employeeGet: [{ route: route('meGet'), selfOnly: true }],
};

/**
 * By `subject.type` (canonical), tried when the code has no route of its own: one line for each type of the catalogue that has a route
 * to read one record. Not here, for want of such a route: `APPLICATION`, `BUDGET_ADJUSTMENT`, `COST_CENTER`,
 * `DEPARTMENT_SOFTWARE_PROPOSAL`, `DEVICE_RETURN_TASK`, `DEVICE_STOP_REQUEST`, `HANDOVER_DUTY`, `LICENSE_ASSIGNMENT`, `OUT_OF_PROCESS_CASE`, `TRANSFER_REVIEW`.
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
  LICENSE_LOT: route('licenseLotGet', { id: 'subject' }),
  OFFBOARDING_CASE: route('offboardingCaseGet', { id: 'subject' }),
  PERSONNEL_NOTICE: route('personnelNoticeGet', { id: 'subject' }),
  PLAN: route('planGet', { id: 'subject' }),
  POLICY_VERSION: route('policyGet', { code: 'policyCode' }),
  PROVISIONING_TASK: route('provisioningTaskGet', { id: 'subject' }),
  PURCHASE_INVOICE: route('purchaseInvoiceGet', { id: 'subject' }),
  RETURN_REQUEST: route('returnRequestGet', { id: 'subject' }),
  SAAS_ISSUE: route('saasIssueGet', { id: 'subject' }),
  SPEND_BATCH: route('spendBatchGet', { id: 'subject' }),
  SUBSCRIPTION: route('subscriptionGet', { id: 'subject' }),
  SUBSCRIPTION_RENEWAL: route('subscriptionRenewalGet', { id: 'subject' }),
  WORKSPACE: route('workspaceGet', { id: 'subject' }),
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

/** Whether one of the roles of the reader reads the route; a route not in `ROUTE_READERS` is read by every signed-in person. */
function readsRoute(operationId: string, roles: readonly string[]): boolean {
  const readers = own(ROUTE_READERS, operationId);

  return readers === undefined || readers.some((role) => roles.includes(role));
}

/** The target of a route for a reader: the route itself when they may read it, else the first alternative they may read, else null. */
function targetFor(
  ref: RouteRef,
  subject: { type: string; id: string } | null,
  params: Readonly<Record<string, unknown>>,
  roles: readonly string[],
): NotificationTarget | null {
  if (readsRoute(ref.operationId, roles)) return resolve(ref, subject, params);
  const isSelf = params.recipientIsSubject === 'true';
  for (const alternative of own(ALTERNATIVES, ref.operationId) ?? []) {
    if (alternative.selfOnly === true && !isSelf) continue;
    if (!readsRoute(alternative.route.operationId, roles)) continue;
    const target = resolve(alternative.route, subject, params);
    if (target !== null) return target;
  }

  return null;
}

/**
 * The screen a notice opens for the person who reads it (`roles` are the effective roles of the caller): the table of its code first,
 * then the table of its subject type; null when neither gives a route with all its path parameters, when the table of the code says there
 * is none, or when the reader has no role that reads the route and no alternative of it. `params.recipientIsSubject === 'true'` says the
 * notice is about the reader. Accepts any code (a notice may outlive its code) and never throws.
 */
export function notificationTarget(
  code: string,
  subject: { type: string; id: string } | null,
  params: Readonly<Record<string, unknown>>,
  roles: readonly string[],
): NotificationTarget | null {
  const entry = own(TARGET_BY_CODE as Readonly<Record<string, RouteRef | AudienceRoutes | null>>, code);
  if (entry === null) return null;
  const byCode = entry === undefined ? undefined : routeOfCode(entry, params);
  if (byCode !== undefined && resolve(byCode, subject, params) !== null)
    return targetFor(byCode, subject, params, roles);
  if (subject === null) return null;
  const bySubject = own(TARGET_BY_SUBJECT_TYPE, canonicalSubjectType(subject.type));

  return bySubject === undefined ? null : targetFor(bySubject, subject, params, roles);
}
