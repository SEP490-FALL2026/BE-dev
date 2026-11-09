import type { NotificationIntent, StatusEvent, StatusFacts, StatusRule } from '../request-status.types';
import { requestOf, text } from './status-rule.policy';

/** The reasons an event names, as the codes they are; the notice carries them and no figure (`INF-06`, `FIGURE_WORDS`). */
const reasonsOf = (event: StatusEvent): string[] =>
  (text(event.after, 'blockReasons') ?? '').split(',').filter(Boolean);

/**
 * What the check of the budget of a request tells in the inbox (`BR-MF1-06g`, `BR-MF1-06i`, `BR-MF1-07c`): a request that uses the reserve
 * waits for the head to confirm it; a request that is blocked is told to the one who asked and the head, and to the IT Admin in charge when
 * the price is no longer valid; never Finance, who has no step. Only ids and codes: how far over is read on the request, not in the inbox.
 */
const BUDGET_CHECKED = (event: StatusEvent, facts: StatusFacts): NotificationIntent[] => {
  const request = requestOf(facts);
  const outcome = text(event.after, 'outcome');
  if (outcome === 'USES_RESERVE') {
    // Only when the request waits for the head: not when it went on to the approver (a one-step request, or the head just confirmed it).
    if (text(event.after, 'opened') !== null) return [];
    return [
      {
        recipients: [facts.departmentHeadEmployeeId],
        code: 'REQUEST_RESERVE_CONFIRMATION_NEEDED',
        params: { requestId: request.id },
      },
    ];
  }
  if (outcome !== 'BLOCKED') return [];
  const reasons = reasonsOf(event);

  return [
    {
      recipients: [
        request.requesterEmployeeId,
        facts.departmentHeadEmployeeId,
        reasons.includes('PRICE_EXPIRED') ? facts.itAdminEmployeeId : null,
      ],
      code: 'REQUEST_BUDGET_BLOCKED',
      params: { requestId: request.id, reasons: reasons.join(',') },
    },
  ];
};

export const BUDGET_CHECK_RULES: Readonly<Record<string, StatusRule>> = {
  // The head sent the request on, or confirmed the reserve, and the check said it uses the reserve or is blocked.
  'ACCESS_REQUEST.BUDGET_CHECKED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST', 'DEPARTMENT_HEAD', 'IT_ADMIN'],
    build: BUDGET_CHECKED,
  },
  // The spending approver decided, the check made again blocked the request or it uses a reserve nobody confirmed: it went back to the head,
  // and the requester and the head are told (`US-06-16` AC-6).
  'ACCESS_REQUEST.SPEND_RETURNED_AT_DECISION': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST', 'DEPARTMENT_HEAD', 'IT_ADMIN'],
    build: (event, facts): NotificationIntent[] => {
      const request = requestOf(facts);
      const reasons = reasonsOf(event);

      return [
        {
          recipients: [
            request.requesterEmployeeId,
            facts.departmentHeadEmployeeId,
            reasons.includes('PRICE_EXPIRED') ? facts.itAdminEmployeeId : null,
          ],
          code: 'REQUEST_RETURNED_AT_DECISION',
          params: { requestId: request.id, reasons: reasons.join(',') },
        },
      ];
    },
  },
};
