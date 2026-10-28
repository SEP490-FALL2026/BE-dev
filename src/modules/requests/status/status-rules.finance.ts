import type { NotificationIntent, StatusEvent, StatusFacts, StatusRule } from './request-status.types';
import { requestOf, text } from './status-rule.support';

/** The year an event names, or null when it names none or names a text. */
const yearOf = (event: StatusEvent): number | null => {
  const value = event.after['year'];

  return typeof value === 'number' ? value : null;
};

/**
 * The loop between Finance and the head of the department about the money of a request, told in the inbox (rows 41, 47 and 48 of the
 * table of events, `QĐ-92b`, F67): a request enters the review of Finance, Finance gives it back, it waits for a budget, and the
 * version it waited for ends. Only ids and codes: never an amount, a figure of the budget, a code of the check, an opinion or the
 * direction of Finance. The head is told where the request stands, not why the budget has no room; the reason Finance gives for giving
 * a request back is theirs to read, as on the request.
 */
const REVIEW_OPENED = (event: StatusEvent, facts: StatusFacts): NotificationIntent[] => {
  const request = requestOf(facts);
  // The review is the step that was opened by the check or the re-check; a request that went straight to the approver opens none.
  if (text(event.after, 'opened') !== 'FINANCE_REVIEW') return [];

  return [
    {
      recipients: [facts.financeEmployeeId, facts.departmentHeadEmployeeId],
      code: 'REQUEST_FINANCE_REVIEW_OPENED',
      params: { requestId: request.id, stepKind: 'FINANCE_REVIEW' },
    },
  ];
};

export const FINANCE_RULES: Readonly<Record<string, StatusRule>> = {
  // 41: the check sent the request to Finance (an exception, or a high value).
  'ACCESS_REQUEST.BUDGET_CHECKED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST', 'FINANCE', 'DEPARTMENT_HEAD'],
    build: REVIEW_OPENED,
  },
  // 41: the spending approver checked it again and it is an exception Finance has not reviewed: it went back to Finance.
  'ACCESS_REQUEST.BUDGET_REFUSED_REVIEW_OPENED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST', 'FINANCE', 'DEPARTMENT_HEAD'],
    build: REVIEW_OPENED,
  },
  // 47 and 48: Finance ended the review: it gave the request back to the head (with its reason), or asked for a budget to be made and
  // the request waits for a version.
  'ACCESS_REQUEST.FINANCE_REVIEW_COMPLETED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST', 'DEPARTMENT_HEAD'],
    build: (event, facts): NotificationIntent[] => {
      const request = requestOf(facts);
      const outcome = text(event.after, 'outcome');
      if (outcome === 'RETURNED_TO_HEAD') {
        return [
          {
            recipients: [facts.departmentHeadEmployeeId],
            code: 'REQUEST_RETURNED_BY_FINANCE',
            params: { requestId: request.id, reason: text(event.after, 'reason') },
          },
        ];
      }
      if (outcome === 'BUDGET_REVISION_NEEDED') {
        return [
          {
            recipients: [facts.departmentHeadEmployeeId],
            code: 'REQUEST_AWAITING_BUDGET',
            params: { requestId: request.id, costCenterId: text(event.after, 'costCenterId'), year: yearOf(event) },
          },
        ];
      }

      return [];
    },
  },
  // 48: the version of the budget the request waited for was refused, sent back, or closed unapproved at the end of the year: Finance
  // is told, to give the request back to its head or give its opinion (`financeReviewComplete`).
  'ACCESS_REQUEST.BUDGET_VERSION_ENDED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST', 'FINANCE'],
    build: (event, facts): NotificationIntent[] => {
      const request = requestOf(facts);

      return [
        {
          recipients: [facts.financeEmployeeId],
          code: 'REQUEST_BUDGET_VERSION_ENDED',
          params: {
            requestId: request.id,
            versionId: text(event.after, 'versionId'),
            costCenterId: text(event.after, 'costCenterId'),
            year: yearOf(event),
            decision: text(event.after, 'decision'),
          },
        },
      ];
    },
  },
};
