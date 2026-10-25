import type { NotificationIntent, StatusRule } from './request-status.types';
import { flag, outcomeRecipients, requestOf, stepKindOf, text } from './status-rule.support';

/**
 * What the spec of the inbox adds for the events of the items finished before it, as far as its scope reaches: the alert of a
 * step that waits (`g5-step-reassignment-and-controlled-wait`), the verdict on a service account (`g5-service-account-request`),
 * the return of a seat and the renewal of a right (`g5-return-and-renewal-requests`). Rows 17 to 24 of the table of events; the
 * revocation of a seat has no row here, because no spec of the inbox names one.
 */
export const RELATED_RULES: Readonly<Record<string, StatusRule>> = {
  // 17: a step began to wait. The event names who is to be told by role: the Super Admin always, the IT Admin in charge when the
  // department has neither a head nor a fallback approver; both are found as they are today.
  'ACCESS_REQUEST.STEP_WAIT_ALERTED': {
    subject: 'ACCESS_REQUEST',
    needs: ['SUPER_ADMIN'],
    build: (event, facts): NotificationIntent[] => {
      const roles = (text(event.after, 'notify') ?? '').split(',');

      return [
        {
          recipients: [
            roles.includes('SUPER_ADMIN') ? facts.superAdminEmployeeId : null,
            roles.includes('IT_ADMIN_IN_CHARGE') ? text(event.after, 'itAdminEmployeeId') : null,
          ],
          code: 'CONTROLLED_WAIT_ALERT',
          params: {
            requestId: text(event.after, 'requestId'),
            stepKind: stepKindOf(event),
            waitingReason: text(event.after, 'waitingReason'),
            configurationHint: text(event.after, 'configurationHint'),
          },
        },
      ];
    },
  },
  // 18: the IT Admin accepted that a service account is a non-human subject: the requester hears that it goes on to the grant.
  'ACCESS_REQUEST.SERVICE_ACCOUNT_BOUNDARY_ACCEPTED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST'],
    build: (_event, facts): NotificationIntent[] => {
      const request = requestOf(facts);

      return [
        {
          recipients: [request.requesterEmployeeId],
          code: 'SERVICE_ACCOUNT_BOUNDARY_ACCEPTED',
          params: { requestId: request.id },
        },
      ];
    },
  },
  // 19: the IT Admin refused it. It ends like a refusal at the gate of the assessment, so it is told like one: to the requester,
  // the head, the person who answers for the account and, since the spend had been decided, the spending approver whose
  // decision the refusal takes back when it released what was held.
  'ACCESS_REQUEST.SERVICE_ACCOUNT_BOUNDARY_REJECTED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST', 'SERVICE_ACCOUNT', 'DEPARTMENT_HEAD', 'SPEND_DECIDER'],
    build: (event, facts): NotificationIntent[] => {
      const request = requestOf(facts);

      return [
        {
          recipients: [
            ...outcomeRecipients(event, request),
            facts.departmentHeadEmployeeId,
            text(event.after, 'responsibleEmployeeId'),
            flag(event.after, 'released') ? facts.spendDeciderEmployeeId : null,
          ],
          code: 'REQUEST_IT_REJECTED',
          params: {
            requestId: request.id,
            kind: 'SERVICE_ACCOUNT_BOUNDARY',
            reason: facts.serviceAccount?.boundaryReason ?? null,
            alternativePlanId: null,
            alternativeNote: null,
            noAlternative: true,
          },
        },
      ];
    },
  },
  // 20: a return of a seat was sent: the holder is warned that the revocation is coming (`US-05-13` AC-3), unless they sent it.
  'RETURN_REQUEST.SUBMITTED': {
    subject: 'RETURN_REQUEST',
    needs: [],
    build: (event): NotificationIntent[] => [
      {
        recipients: [text(event.after, 'holderEmployeeId')],
        code: 'RETURN_REQUESTED',
        params: {
          returnRequestId: text(event.after, 'returnRequestId'),
          planId: text(event.after, 'planId'),
          source: text(event.after, 'source'),
          handoverRequired: flag(event.after, 'handoverRequired'),
          handoverDueOn: text(event.after, 'handoverDueOn'),
        },
      },
    ],
  },
  // 21: the IT Admin took the access away: the holder and the person who sent the return are told it is done.
  'RETURN_REQUEST.COMPLETED': {
    subject: 'RETURN_REQUEST',
    needs: ['RETURN'],
    build: (event, facts): NotificationIntent[] => [
      {
        recipients: [facts.returnRequest?.holderEmployeeId ?? null, facts.returnRequest?.requestedByEmployeeId ?? null],
        code: 'RETURN_COMPLETED',
        params: {
          returnRequestId: text(event.after, 'returnRequestId'),
          handoverFlagged: flag(event.after, 'handoverFlagged'),
        },
      },
    ],
  },
  // 22: the IT Admin closed the revocation as failed: the seat is still open, and the person who sent the return is told.
  'RETURN_REQUEST.FAILED': {
    subject: 'RETURN_REQUEST',
    needs: ['RETURN'],
    build: (event, facts): NotificationIntent[] => [
      {
        recipients: [facts.returnRequest?.requestedByEmployeeId ?? null],
        code: 'RETURN_FAILED',
        params: { returnRequestId: text(event.after, 'returnRequestId') },
      },
    ],
  },
  // 23: a renewal took effect: the new period of the seat began.
  'ACCESS_REQUEST.RENEWAL_APPLIED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST'],
    build: (event, facts): NotificationIntent[] => {
      const request = requestOf(facts);

      return [
        {
          recipients: outcomeRecipients(event, request),
          code: 'REQUEST_RENEWAL_APPLIED',
          params: { requestId: request.id, newExpectedEndDate: text(event.after, 'newExpectedEndDate') },
        },
      ];
    },
  },
  // 24: a renewal was approved but the seat could not be renewed (it ended or was being taken away meanwhile).
  'ACCESS_REQUEST.RENEWAL_NOT_APPLIED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST'],
    build: (event, facts): NotificationIntent[] => {
      const request = requestOf(facts);

      return [
        {
          recipients: outcomeRecipients(event, request),
          code: 'REQUEST_RENEWAL_NOT_APPLIED',
          params: { requestId: request.id, problem: text(event.after, 'problem') },
        },
      ];
    },
  },
};
