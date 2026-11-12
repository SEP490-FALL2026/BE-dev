import type { NotificationIntent, StatusRule } from '../request-status.types';
import { goneNotice, outcomeRecipients, requestOf, text } from './status-rule.policy';

/**
 * How a request ended, or a decision on it, told to the requester and to the people it is for (rows 3 to 8 and 16 of the table of
 * events). The reasons are those the person with the authority wrote on the request: everybody told here already reads them
 * there. Never an amount, a finding of the budget, an opinion of Finance, a reason to override, the evidence of the IT Admin, a
 * code or a message of an error, or the reason the IT Admin gave for closing a task.
 */
export const OUTCOME_RULES: Readonly<Record<string, StatusRule>> = {
  // 3: the head, or whoever held the need step, refused it.
  'ACCESS_REQUEST.NEED_REJECTED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST', 'DECISION'],
    build: (event, facts): NotificationIntent[] => {
      const request = requestOf(facts);

      return [
        {
          recipients: outcomeRecipients(event, request),
          code: 'REQUEST_REJECTED',
          params: { requestId: request.id, by: 'NEED', reason: facts.decision?.reason ?? null, suggestedPlanId: null },
        },
      ];
    },
  },
  // 4: the IT Admin refused it at the gate of the assessment; the head of the department is told, the spending approver is not.
  'ACCESS_REQUEST.ASSESSMENT_REJECTED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST', 'IT_REJECTION', 'DEPARTMENT_HEAD'],
    build: (event, facts): NotificationIntent[] => {
      const request = requestOf(facts);
      const refusal = facts.itRejection;
      const alternativePlanId = refusal?.alternativePlanId ?? null;
      const alternativeNote = refusal?.alternativeNote ?? null;

      return [
        {
          recipients: [...outcomeRecipients(event, request), facts.departmentHeadEmployeeId],
          code: 'REQUEST_IT_REJECTED',
          params: {
            requestId: request.id,
            kind: refusal?.kind ?? text(event.after, 'kind'),
            reason: refusal?.reason ?? null,
            alternativePlanId,
            alternativeNote,
            noAlternative: alternativePlanId === null && alternativeNote === null,
          },
        },
      ];
    },
  },
  // 5: the spending approver approved the spend.
  'ACCESS_REQUEST.SPEND_APPROVED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST'],
    build: (_event, facts): NotificationIntent[] => {
      const request = requestOf(facts);

      return [
        {
          recipients: [request.requesterEmployeeId],
          code: 'REQUEST_SPEND_APPROVED',
          params: { requestId: request.id },
        },
      ];
    },
  },
  // 6: the spending approver refused the spend; a tool of the catalog that does the same work, when the IT Admin recorded one, is
  // shown as a suggestion (`US-05-06` AC-5).
  'ACCESS_REQUEST.SPEND_REJECTED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST', 'DECISION', 'EQUIVALENT_PLAN'],
    build: (event, facts): NotificationIntent[] => {
      const request = requestOf(facts);

      return [
        {
          recipients: outcomeRecipients(event, request),
          code: 'REQUEST_REJECTED',
          params: {
            requestId: request.id,
            by: 'SPEND',
            reason: facts.decision?.reason ?? null,
            suggestedPlanId: facts.equivalentPlanId,
          },
        },
      ];
    },
  },
  // 7: the IT Admin completed the grant. The way in is the work account; the homepage is the one the person declared, if any.
  'ACCESS_REQUEST.GRANT_COMPLETED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST', 'HOMEPAGE'],
    build: (event, facts): NotificationIntent[] => {
      const request = requestOf(facts);

      return [
        {
          recipients: outcomeRecipients(event, request),
          code: 'REQUEST_GRANTED',
          params: { requestId: request.id, accessGuide: 'LOGIN_WITH_WORK_ACCOUNT', homepageUrl: facts.homepageUrl },
        },
      ];
    },
  },
  // 8: the IT Admin closed the grant as failed. It says nothing of why: the person is sent to the IT Admin.
  'ACCESS_REQUEST.GRANT_FAILED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST'],
    build: (event, facts): NotificationIntent[] => {
      const request = requestOf(facts);

      return [
        {
          recipients: outcomeRecipients(event, request),
          code: 'REQUEST_FAILED',
          params: { requestId: request.id, contact: 'IT_ADMIN' },
        },
      ];
    },
  },
  // 16: the IT Admin closed the request because the person it was for left (the order is the business of G6). Never a
  // withdrawal and never a failure.
  // The system closed it because the person it was for left or was moved (`QĐ-110d`, `QĐ-110o`): the requester and Finance are told.
  'ACCESS_REQUEST.CANCELLED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST', 'FINANCE'],
    build: (event, facts): NotificationIntent[] => {
      const gone = goneNotice(event, facts);
      if (gone !== null) return [gone];
      const request = requestOf(facts);
      const closedBy = text(event.after, 'cancelledByEmployeeId');

      return [
        {
          recipients: outcomeRecipients(event, request).filter((id) => id !== closedBy),
          code: 'REQUEST_CANCELLED',
          params: { requestId: request.id, reasonKind: text(event.after, 'reasonKind') },
        },
      ];
    },
  },
};
