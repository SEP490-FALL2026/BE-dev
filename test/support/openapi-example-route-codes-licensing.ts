import type { RouteErrorStatus } from './openapi-example-manifest';

/**
 * Part of ROUTE_ERROR_CODES (licensing and notifications added by G5/G6), traced on BE `0da8f56`
 * (Prompt 02, 26/10/2026): see openapi-example-manifest.ts.
 */
export const ROUTE_ERROR_CODES_LICENSING: Readonly<
  Record<string, Partial<Record<RouteErrorStatus, readonly string[]>>>
> = {
  assignmentExpiryReminderList: {
    '403': ['ASSIGNMENT_EXPIRY.SCOPE_FORBIDDEN'],
  },
  assignmentExpiryStartRevocation: {
    '403': ['PROVISIONING.ANOTHER_IT_ADMIN_NEEDED'],
    '404': ['ASSIGNMENT_EXPIRY.NOT_FOUND'],
    '409': [
      'ASSIGNMENT_EXPIRY.NOT_EXPIRED',
      'ASSIGNMENT_EXPIRY.NOT_OPEN',
      'ASSIGNMENT_EXPIRY.RENEWAL_PENDING',
      'REVOCATION.TYPE_NOT_SUPPORTED',
    ],
  },
  handoverDutyConfirm: {
    '403': ['HANDOVER_DUTY.NOT_CONFIRMER'],
    '404': ['HANDOVER_DUTY.NOT_FOUND'],
    '409': ['HANDOVER_DUTY.ALREADY_CONFIRMED', 'HANDOVER_DUTY.CANCELLED'],
    '422': ['HANDOVER_DUTY.VALUE_NOT_ALLOWED'],
  },
  handoverDutyGet: {
    '404': ['HANDOVER_DUTY.NOT_FOUND'],
  },
  handoverDutyList: {
    '403': ['HANDOVER_DUTY.SCOPE_FORBIDDEN'],
  },
  notificationMarkRead: {
    '404': ['NOTIFICATION.NOT_FOUND'],
  },
  provisioningTaskCancel: {
    '403': ['PROVISIONING.ANOTHER_IT_ADMIN_NEEDED'],
    '404': ['PROVISIONING_TASK.NOT_FOUND'],
    '409': ['PROVISIONING_TASK.NOT_FAILED', 'PROVISIONING_TASK.NO_WITHDRAWAL'],
  },
  provisioningTaskCompleteRevocation: {
    '403': ['PROVISIONING.ANOTHER_IT_ADMIN_NEEDED'],
    '404': ['PROVISIONING_TASK.NOT_FOUND'],
    '409': ['PROVISIONING_TASK.NOT_IN_PROGRESS', 'PROVISIONING_TASK.NOT_REVOCATION'],
    '422': [
      'PROVISIONING_TASK.EVIDENCE_REQUIRED',
      'REVOCATION.ACCESS_STATE_INVALID',
      'REVOCATION.ACCESS_STATE_REQUIRED',
      'REVOCATION.COMPLETION_NOT_ALLOWED',
      'REVOCATION.NOTE_REQUIRED',
      'REVOCATION.PAID_THROUGH_REQUIRED',
    ],
  },
  provisioningTaskRecordAccessCut: {
    '403': ['PROVISIONING.ANOTHER_IT_ADMIN_NEEDED'],
    '404': ['PROVISIONING_TASK.NOT_FOUND'],
    '409': ['PROVISIONING_TASK.NOT_REVOCATION', 'PROVISIONING_TASK.NOT_TERMINATING'],
    '422': ['PROVISIONING_TASK.EVIDENCE_REQUIRED', 'REVOCATION.ACCESS_STATE_INVALID'],
  },
  saasIssueAddMessage: {
    '404': ['SAAS_ISSUE.NOT_FOUND'],
    '409': ['SAAS_ISSUE.CLOSED'],
    '422': ['SAAS_ISSUE.MESSAGE_REQUIRED'],
  },
  saasIssueEntryList: {
    '404': ['SAAS_ISSUE.NOT_FOUND'],
  },
  saasIssueGet: {
    '404': ['SAAS_ISSUE.NOT_FOUND'],
  },
  saasIssueList: {
    '403': ['SAAS_ISSUE.SCOPE_FORBIDDEN'],
  },
  saasIssueMarkDuplicate: {
    '404': ['SAAS_ISSUE.NOT_FOUND'],
    '409': ['SAAS_ISSUE.INVALID_TRANSITION'],
    '422': ['SAAS_ISSUE.DUPLICATE_TARGET_INVALID', 'SAAS_ISSUE.REASON_REQUIRED'],
  },
  saasIssueReopen: {
    '404': ['SAAS_ISSUE.NOT_FOUND'],
    '409': ['SAAS_ISSUE.NOT_RESOLVED', 'SAAS_ISSUE.REOPEN_WINDOW_ENDED'],
    '422': ['SAAS_ISSUE.REASON_REQUIRED'],
  },
  saasIssueSubmit: {
    '403': ['SAAS_ISSUE.ASSIGNMENT_NOT_YOURS'],
    '409': ['SAAS_ISSUE.ASSIGNMENT_NOT_OPEN', 'SAAS_ISSUE.NO_IT_ADMIN'],
    '422': ['SAAS_ISSUE.OCCURRED_IN_FUTURE'],
  },
  saasIssueTransition: {
    '404': ['SAAS_ISSUE.NOT_FOUND'],
    '409': ['SAAS_ISSUE.INVALID_TRANSITION'],
    '422': ['SAAS_ISSUE.LINKED_WORK_INVALID', 'SAAS_ISSUE.MESSAGE_REQUIRED', 'SAAS_ISSUE.RESOLUTION_REQUIRED'],
  },
  serviceAccountDutyList: {
    '503': ['SERVICE_ACCOUNT_DUTY.TOO_MANY'],
  },
};
