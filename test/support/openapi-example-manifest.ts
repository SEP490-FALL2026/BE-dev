/**
 * The literal expectations of the OpenAPI examples (OPENAPI-EXAMPLE.1), written out so the test never asks the code that
 * builds the examples what they should be. Traced on BE `ea73c2f` (25/10/2026) from each handler through its service,
 * policies and repository to the HTTP mapper — never from a response description; see
 * docs/workspace/items/openapi-response-examples/spec.md.
 *
 * - SUCCESS_MESSAGES: the success `message` each operation answers with (its `@ApiSuccessResponse` metadata).
 * - BODYLESS_RESPONSES: success responses that have no JSON body, with the reason.
 * - ROUTE_ERROR_CODES: the codes an operation can answer with at a status beyond the ones every operation of its kind
 *   answers with (guards, validation pipe, throttler, request parsers — written out in api-inventory.e2e-spec.ts).
 *   Adding a code here needs the traced code path; a code that cannot be reached is never listed.
 * - NO_EXAMPLE_RESPONSES: declared error responses the running system cannot answer yet, so they show no example
 *   (their declaration says why in `noExampleBecause`). The list only shrinks: the slice that makes one reachable adds
 *   its examples and removes the entry.
 */

import { ROUTE_ERROR_CODES_A_TO_L } from './openapi-example-route-codes-a-l';
import { ROUTE_ERROR_CODES_M_TO_Z } from './openapi-example-route-codes-m-z';

export type RouteErrorStatus = '400' | '401' | '403' | '404' | '409' | '413' | '422' | '429' | '500' | '503';

export const SUCCESS_MESSAGES: Readonly<Record<string, string>> = {
  accountCandidatesList: 'APP_USER.CANDIDATES_LISTED',
  appUserCreate: 'APP_USER.CREATED',
  appUserGet: 'APP_USER.RETRIEVED',
  appUserGrantRole: 'ROLE.GRANTED',
  appUserList: 'APP_USER.LISTED',
  appUserLock: 'APP_USER.LOCKED',
  appUserResendInvitation: 'APP_USER.INVITATION_SENT',
  appUserRevokeRole: 'ROLE.REVOKED',
  appUserUnlock: 'APP_USER.UNLOCKED',
  applicationBusinessOwnerHistory: 'APPLICATION.BUSINESS_OWNERS_LISTED',
  applicationCreate: 'APPLICATION.CREATED',
  applicationGet: 'APPLICATION.FETCHED',
  applicationList: 'APPLICATION.LISTED',
  applicationRetire: 'APPLICATION.RETIRED',
  applicationRetirementConfirm: 'APPLICATION.RETIREMENT_CONFIRMED',
  applicationRetirementGet: 'APPLICATION.RETIREMENT_FETCHED',
  applicationUpdate: 'APPLICATION.UPDATED',
  approvalRoleList: 'APPROVAL_ROLE.LISTED',
  approvalRoleSet: 'APPROVAL_ROLE.SET',
  auditEventList: 'AUDIT.EVENTS_LISTED',
  authLogin: 'AUTH.LOGGED_IN',
  authRedeemInvitation: 'AUTH.ACCOUNT_ACTIVATED',
  authRefresh: 'AUTH.SESSION_REFRESHED',
  authRequestPasswordReset: 'AUTH.PASSWORD_RESET_REQUESTED',
  authResetPassword: 'AUTH.PASSWORD_RESET',
  businessOwnerWarningList: 'BUSINESS_OWNER_WARNING.LISTED',
  contractCreate: 'CONTRACT.CREATED',
  contractGet: 'CONTRACT.FETCHED',
  costCenterCreate: 'COST_CENTER.CREATED',
  costCenterDeactivate: 'COST_CENTER.DEACTIVATED',
  costCenterEmployeeList: 'COST_CENTER.EMPLOYEES_LISTED',
  costCenterList: 'COST_CENTER.LISTED',
  costCenterRename: 'COST_CENTER.RENAMED',
  currencyList: 'CURRENCY.LISTED',
  departmentCreate: 'DEPARTMENT.CREATED',
  departmentDeactivate: 'DEPARTMENT.DEACTIVATED',
  departmentGet: 'DEPARTMENT.FETCHED',
  departmentHeadAssign: 'DEPARTMENT.HEAD_ASSIGNED',
  departmentHeadVacate: 'DEPARTMENT.HEAD_VACATED',
  departmentList: 'DEPARTMENT.LISTED',
  departmentMemberList: 'DEPARTMENT.MEMBERS_LISTED',
  departmentToolsInUse: 'DEPARTMENT_TOOLS.LISTED',
  departmentUpdate: 'DEPARTMENT.UPDATED',
  departmentWarningList: 'DEPARTMENT.WARNINGS_LISTED',
  documentAttach: 'DOCUMENT.ATTACHED',
  documentComplete: 'DOCUMENT.UPLOADED',
  documentCreate: 'DOCUMENT.CREATED',
  documentGet: 'DOCUMENT.FETCHED',
  documentLink: 'DOCUMENT.LINK_ISSUED',
  employeeCreate: 'EMPLOYEE.CREATED',
  employeeImportCancel: 'EMPLOYEE_IMPORT.CANCELLED',
  employeeImportConfirm: 'EMPLOYEE_IMPORT.CONFIRMED',
  employeeImportGet: 'EMPLOYEE_IMPORT.FETCHED',
  employeeImportPreviewRefresh: 'EMPLOYEE_IMPORT.PREVIEW_REFRESHED',
  employeeImportRowList: 'EMPLOYEE_IMPORT.ROWS_LISTED',
  employeeImportUpload: 'EMPLOYEE_IMPORT.UPLOADED',
  employeeUpdateOfficialFields: 'EMPLOYEE.UPDATED',
  exchangeRateList: 'EXCHANGE_RATE.LISTED',
  exchangeRateRecord: 'EXCHANGE_RATE.RECORDED',
  functionalGroupCreate: 'FUNCTIONAL_GROUP.CREATED',
  functionalGroupList: 'FUNCTIONAL_GROUP.LISTED',
  functionalGroupUpdate: 'FUNCTIONAL_GROUP.UPDATED',
  healthGetLiveness: 'HEALTH.LIVENESS_CHECKED',
  healthGetReadiness: 'HEALTH.READINESS_CHECKED',
  jobTitleCreate: 'JOB_TITLE.CREATED',
  jobTitleDeactivate: 'JOB_TITLE.DEACTIVATED',
  jobTitleList: 'JOB_TITLE.LISTED',
  jobTitleReactivate: 'JOB_TITLE.REACTIVATED',
  jobTitleRename: 'JOB_TITLE.RENAMED',
  licenseAssignmentChangeResponsible: 'LICENSE_ASSIGNMENT.RESPONSIBLE_CHANGED',
  licenseAssignmentList: 'LICENSE_ASSIGNMENT.LISTED',
  licenseKeyImport: 'LICENSE_KEY.IMPORTED',
  licenseKeyList: 'LICENSE_KEY.LISTED',
  licenseKeyReveal: 'LICENSE_KEY.REVEALED',
  meChangePassword: 'AUTH.PASSWORD_CHANGED',
  meGet: 'ME.RETRIEVED',
  nonWorkingDateAdd: 'NON_WORKING_DATE.ADDED',
  nonWorkingDateList: 'NON_WORKING_DATE.LISTED',
  nonWorkingDateRemove: 'NON_WORKING_DATE.REMOVED',
  nonWorkingDateRename: 'NON_WORKING_DATE.RENAMED',
  onboardingChecklistGet: 'ONBOARDING.CHECKLIST_FETCHED',
  operatingParameterHistory: 'PARAMETER.HISTORY_LISTED',
  operatingParameterList: 'PARAMETER.LISTED',
  operatingParameterSet: 'PARAMETER.SET',
  planCreate: 'PLAN.CREATED',
  planGet: 'PLAN.FETCHED',
  planList: 'PLAN.LISTED',
  planTermOpinionList: 'PLAN_TERM_OPINION.LISTED',
  planTermOpinionRecord: 'PLAN_TERM_OPINION.RECORDED',
  planTermsGet: 'PLAN_TERMS.FETCHED',
  planTermsSet: 'PLAN_TERMS.SET',
  planUpdate: 'PLAN.UPDATED',
  planWarningList: 'PLAN_WARNING.LISTED',
  planWorkspaceProfileSet: 'PLAN.WORKSPACE_PROFILE_SET',
  projectCreate: 'PROJECT.CREATED',
  projectGet: 'PROJECT.FETCHED',
  projectList: 'PROJECT.LISTED',
  projectUpdate: 'PROJECT.UPDATED',
  provisioningTaskClaim: 'PROVISIONING_TASK.CLAIMED',
  provisioningTaskCloseFailed: 'PROVISIONING_TASK.CLOSED_FAILED',
  provisioningTaskComplete: 'PROVISIONING_TASK.COMPLETED',
  provisioningTaskGet: 'PROVISIONING_TASK.FETCHED',
  provisioningTaskGrant: 'PROVISIONING_TASK.CREATED',
  provisioningTaskHandOff: 'PROVISIONING_TASK.HANDED_OFF',
  provisioningTaskList: 'PROVISIONING_TASK.LISTED',
  provisioningTaskReportFailure: 'PROVISIONING_TASK.FAILED',
  provisioningTaskRetry: 'PROVISIONING_TASK.RETRY_REQUESTED',
  reportingCurrencyGet: 'REPORTING_CURRENCY.FETCHED',
  reportingCurrencySet: 'REPORTING_CURRENCY.SET',
  seatBaselineClose: 'SEAT_BASELINE.CLOSED',
  seatBaselineGet: 'SEAT_BASELINE.FETCHED',
  seatBaselineImportCancel: 'SEAT_BASELINE_IMPORT.CANCELLED',
  seatBaselineImportConfirm: 'SEAT_BASELINE_IMPORT.CONFIRMED',
  seatBaselineImportGet: 'SEAT_BASELINE_IMPORT.FETCHED',
  seatBaselineImportRows: 'SEAT_BASELINE_IMPORT.ROWS_LISTED',
  seatBaselineImportUpload: 'SEAT_BASELINE_IMPORT.UPLOADED',
  standardToolsetGet: 'STANDARD_TOOLSET.FETCHED',
  standardToolsetHistory: 'STANDARD_TOOLSET.HISTORY_LISTED',
  standardToolsetList: 'STANDARD_TOOLSET.LISTED',
  standardToolsetMine: 'STANDARD_TOOLSET.FETCHED',
  standardToolsetSet: 'STANDARD_TOOLSET.SET',
  subscriptionComplete: 'SUBSCRIPTION.COMPLETED',
  subscriptionCostAllocationGet: 'SUBSCRIPTION_COST_ALLOCATION.FETCHED',
  subscriptionCostAllocationHistory: 'SUBSCRIPTION_COST_ALLOCATION.HISTORY_LISTED',
  subscriptionCostAllocationSet: 'SUBSCRIPTION_COST_ALLOCATION.DECLARED',
  subscriptionCreate: 'SUBSCRIPTION.CREATED',
  subscriptionGet: 'SUBSCRIPTION.FETCHED',
  subscriptionList: 'SUBSCRIPTION.LISTED',
  subscriptionSeatUsage: 'SUBSCRIPTION_SEAT_USAGE.FETCHED',
  subscriptionUpdate: 'SUBSCRIPTION.UPDATED',
  superAdminTransfer: 'SUPER_ADMIN.TRANSFERRED',
  vendorGroupCreate: 'VENDOR_DICTIONARY.GROUP_CREATED',
  vendorGroupList: 'VENDOR_DICTIONARY.GROUPS_LISTED',
  vendorGroupUpdate: 'VENDOR_DICTIONARY.GROUP_UPDATED',
  vendorList: 'VENDOR.LISTED',
  vendorNormalize: 'VENDOR_DICTIONARY.NORMALIZED',
  vendorProposalList: 'VENDOR_DICTIONARY.PROPOSALS_LISTED',
  vendorProposalResolve: 'VENDOR_DICTIONARY.PROPOSAL_RESOLVED',
  vendorServiceLineCreate: 'VENDOR_DICTIONARY.SERVICE_LINE_CREATED',
  vendorServiceLineUpdate: 'VENDOR_DICTIONARY.SERVICE_LINE_UPDATED',
  vendorSuggestionList: 'VENDOR_DICTIONARY.SUGGESTED',
  vendorTaxEstimate: 'VENDOR_TAX_PROFILE.ESTIMATED',
  vendorTaxProfileGet: 'VENDOR_TAX_PROFILE.FETCHED',
  vendorTaxProfileHistory: 'VENDOR_TAX_PROFILE.HISTORY_LISTED',
  vendorTaxProfileSet: 'VENDOR_TAX_PROFILE.DECLARED',
};

export const BODYLESS_RESPONSES: Readonly<Record<string, string>> = {
  'authLogout 204': 'Signed out: 204 No Content has no body (@RawResponse).',
};

export const NO_EXAMPLE_RESPONSES: Readonly<Record<string, string>> = {
  'provisioningTaskClaim 409':
    'Unreachable until G5 binds the request gate: no task can be created while RefusingGrantRequestGate refuses every grant.',
  'provisioningTaskCloseFailed 409':
    'Unreachable until G5 binds the request gate: no task can be created while RefusingGrantRequestGate refuses every grant.',
  'provisioningTaskComplete 409':
    'Unreachable until G5 binds the request gate: no task can be created while RefusingGrantRequestGate refuses every grant.',
  'provisioningTaskGrant 409':
    'Unreachable until G5 binds the request gate: RefusingGrantRequestGate answers REQUEST.NOT_FOUND to every request.',
  'provisioningTaskHandOff 409':
    'Unreachable until G5 binds the request gate: no task can be created while RefusingGrantRequestGate refuses every grant.',
  'provisioningTaskReportFailure 409':
    'Unreachable until G5 binds the request gate: no task can be created while RefusingGrantRequestGate refuses every grant.',
  'provisioningTaskRetry 409':
    'Unreachable until G5 binds the request gate: no task can be created while RefusingGrantRequestGate refuses every grant.',
};

/** The route-specific codes, in two files to keep each support file small (TEST-HARDEN.1). */
export const ROUTE_ERROR_CODES: Readonly<Record<string, Partial<Record<RouteErrorStatus, readonly string[]>>>> = {
  ...ROUTE_ERROR_CODES_A_TO_L,
  ...ROUTE_ERROR_CODES_M_TO_Z,
};
