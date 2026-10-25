import type { NotificationIntent, StatusRule } from './request-status.types';
import { outcomeRecipients, requestOf, text } from './status-rule.support';

/**
 * The withdrawal of a request and what follows from it (rows 9 to 12 of the table of events, the notices `g5-request-withdrawal`
 * and `g5-commitment-lifecycle` left to the inbox). The person who withdrew is never told about it; the money that goes back is
 * told to Finance and to the IT Admin in charge, without an amount, once however many years it was held for.
 */
export const WITHDRAWAL_RULES: Readonly<Record<string, StatusRule>> = {
  // 9: the request ended as withdrawn: the requester and the people it is for, and everybody who held a step that was closed.
  'ACCESS_REQUEST.WITHDRAWN': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST', 'CLOSED_STEP_HOLDERS'],
    build: (event, facts): NotificationIntent[] => {
      const request = requestOf(facts);
      const withdrawer = text(event.after, 'withdrawnByEmployeeId') ?? request.withdrawnByEmployeeId;
      const byRequester = withdrawer === request.requesterEmployeeId;
      const holders = new Map<string, string>();
      for (const held of facts.closedStepHolders)
        if (!holders.has(held.employeeId)) holders.set(held.employeeId, held.kind);

      return [
        {
          recipients: outcomeRecipients(event, request).filter((id) => id !== withdrawer),
          code: 'REQUEST_WITHDRAWN',
          params: {
            requestId: request.id,
            byRequester,
            // The head says why when they withdraw; the requester withdrawing for themselves needs no reason.
            reason: byRequester ? null : (text(event.after, 'reason') ?? request.withdrawalReason),
          },
        },
        ...[...holders]
          .filter(([employeeId]) => employeeId !== withdrawer)
          .map(([employeeId, stepKind]) => ({
            recipients: [employeeId],
            code: 'STEP_CLOSED_BY_WITHDRAWAL' as const,
            params: { requestId: request.id, stepKind },
          })),
      ];
    },
  },
  // 10: the grant had failed and the requester withdrew: the IT Admin has a task to close, and a head who withdrew tells the
  // requester it is not over yet.
  'ACCESS_REQUEST.WITHDRAWAL_REQUESTED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST', 'IT_ADMIN'],
    build: (event, facts): NotificationIntent[] => {
      const request = requestOf(facts);
      const withdrawer = request.withdrawnByEmployeeId;

      return [
        {
          recipients: [facts.itAdminEmployeeId],
          code: 'WITHDRAWAL_AWAITING_IT_CLOSE',
          params: { requestId: request.id, taskId: text(event.after, 'taskId') },
        },
        {
          recipients:
            withdrawer !== null && withdrawer !== request.requesterEmployeeId ? [request.requesterEmployeeId] : [],
          code: 'REQUEST_WITHDRAWAL_PENDING',
          params: { requestId: request.id },
        },
      ];
    },
  },
  // 11: what was held for a withdrawn request went back to the budget: one notice for the request, not one for each year.
  'BUDGET_COMMITMENT.RELEASED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST', 'FINANCE', 'IT_ADMIN'],
    build: (event, facts): NotificationIntent[] => {
      if (text(event.after, 'reason') !== 'REQUEST_WITHDRAWN') return [];
      const request = requestOf(facts);

      return [
        {
          recipients: [facts.financeEmployeeId, facts.itAdminEmployeeId].filter(
            (id) => id !== request.withdrawnByEmployeeId,
          ),
          code: 'COMMITMENT_RELEASED_BY_WITHDRAWAL',
          params: { requestId: request.id },
          key: `REL:${request.id}`,
        },
      ];
    },
  },
  // 12: the task of the grant was cancelled because the request was withdrawn.
  'PROVISIONING_TASK.CANCELLED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST', 'IT_ADMIN'],
    build: (event, facts): NotificationIntent[] => {
      const request = requestOf(facts);

      return [
        {
          recipients: [facts.itAdminEmployeeId],
          code: 'GRANT_TASK_CANCELLED',
          params: { requestId: request.id, taskId: event.resourceId },
        },
      ];
    },
  },
};
