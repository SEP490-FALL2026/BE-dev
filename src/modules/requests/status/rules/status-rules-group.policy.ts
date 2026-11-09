import type { NotificationIntent, StatusRule } from '../request-status.types';
import { outcomeRecipients, requestOf, text } from './status-rule.policy';

/**
 * What became of one person of a request for a group, told to the requester and to that person alone (`US-05-15` AC-9): the events of
 * the lines carry `beneficiaryEmployeeId`, so the people of the request who are not the one the event is about hear nothing of it. The
 * codes and their parameters are those of the same outcome of a request of one person; the reasons are the ones written on the line by
 * whoever decided it, which the person reads there too. The step-level events (the need of the step approved, the spend approved) are
 * the rows of the other tables.
 */
export const GROUP_RULES: Readonly<Record<string, StatusRule>> = {
  // The head, or whoever held the step, refused this person; an approval is told with the step, not here.
  'ACCESS_REQUEST.LINE_NEED_DECIDED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST'],
    build: (event, facts): NotificationIntent[] => {
      if (text(event.after, 'decision') !== 'REJECTED') return [];
      const request = requestOf(facts);

      return [
        {
          recipients: outcomeRecipients(event, request),
          code: 'REQUEST_REJECTED',
          params: { requestId: request.id, by: 'NEED', reason: text(event.after, 'reason'), suggestedPlanId: null },
        },
      ];
    },
  },
  // The spending approver refused this person.
  'ACCESS_REQUEST.LINE_SPEND_DECIDED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST'],
    build: (event, facts): NotificationIntent[] => {
      if (text(event.after, 'decision') !== 'REJECTED') return [];
      const request = requestOf(facts);

      return [
        {
          recipients: outcomeRecipients(event, request),
          code: 'REQUEST_REJECTED',
          params: { requestId: request.id, by: 'SPEND', reason: text(event.after, 'reason'), suggestedPlanId: null },
        },
      ];
    },
  },
  // The IT Admin completed the grant of this person: the way in is the work account.
  'ACCESS_REQUEST.LINE_GRANT_COMPLETED': {
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
  // The IT Admin closed the grant of this person as failed; it says nothing of why, and the others are not told of it.
  'ACCESS_REQUEST.LINE_GRANT_FAILED': {
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
  // This person was withdrawn: the requester and the person, but not the one who withdrew them.
  'ACCESS_REQUEST.LINE_WITHDRAWN': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST'],
    build: (event, facts): NotificationIntent[] => {
      const request = requestOf(facts);
      const withdrawer = text(event.after, 'withdrawnByEmployeeId');
      const byRequester = withdrawer === request.requesterEmployeeId;

      return [
        {
          recipients: outcomeRecipients(event, request).filter((id) => id !== withdrawer),
          code: 'REQUEST_WITHDRAWN',
          params: { requestId: request.id, byRequester, reason: byRequester ? null : text(event.after, 'reason') },
        },
      ];
    },
  },
  // The IT Admin removed this person because they left: the requester and the person, but not the IT Admin who did it, and nobody
  // else of the group is told (the line carries `beneficiaryEmployeeId`).
  'ACCESS_REQUEST.LINE_CANCELLED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST'],
    build: (event, facts): NotificationIntent[] => {
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
  // The grant of this person had failed and they were withdrawn: the IT Admin has a task to close.
  'ACCESS_REQUEST.LINE_WITHDRAWAL_REQUESTED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST', 'IT_ADMIN'],
    build: (event, facts): NotificationIntent[] => {
      const request = requestOf(facts);

      return [
        {
          recipients: [facts.itAdminEmployeeId],
          code: 'WITHDRAWAL_AWAITING_IT_CLOSE',
          params: { requestId: request.id, taskId: text(event.after, 'taskId') },
        },
      ];
    },
  },
};
