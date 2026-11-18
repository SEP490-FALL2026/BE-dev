import type { NotificationIntent, StatusEvent, StatusFacts, StatusRule } from '../request-status.types';
import { requestOf, text } from './status-rule.policy';

/** The reasons an event names, as the codes they are; the notice carries them and no figure (`INF-06`, `FIGURE_WORDS`). */
const reasonsOf = (event: StatusEvent): string[] =>
  (text(event.after, 'blockReasons') ?? '').split(',').filter(Boolean);

/** The approver who holds a spend step opened outside a batch is told it is theirs to decide; nobody when the step waits or the holder is the requester. */
const spendSent = (event: StatusEvent, requesterEmployeeId: string, requestId: string): NotificationIntent[] => {
  const holder = text(event.after, 'spendAssigneeEmployeeId');

  return [
    {
      recipients: holder !== requesterEmployeeId ? [holder] : [],
      code: 'STEP_ASSIGNED',
      params: { requestId, stepKind: 'SPEND_APPROVAL', cause: 'SPEND_SENT' },
    },
  ];
};

/** The check made when the head confirmed the reserve alone opened the spend step of a request sent through a head. */
const openedByConfirmation = (event: StatusEvent): boolean =>
  text(event.after, 'routingMode') === 'VIA_HEAD' &&
  text(event.after, 'trigger') === 'RESERVE_CONFIRMATION' &&
  text(event.after, 'opened') === 'SPEND_APPROVAL';

/**
 * What the check of the budget of a request tells in the inbox (`BR-MF1-06g`, `BR-MF1-06i`, `BR-MF1-07c`): a request that uses the reserve
 * waits for the head to confirm it; a request that is blocked is told to the one who asked and the head, and to the IT Admin in charge when
 * the price is no longer valid; never Finance, who has no step. Only ids and codes: how far over is read on the request, not in the inbox.
 */
const BUDGET_CHECKED = (event: StatusEvent, facts: StatusFacts): NotificationIntent[] => {
  const request = requestOf(facts);
  const outcome = text(event.after, 'outcome');
  // A one-step request opens its spend step when it is sent (BR-MF1-02): the spending approver who holds it is told, as the holder of a
  // need step is when a request is sent through a head.
  if (text(event.after, 'routingMode') === 'ONE_STEP' && text(event.after, 'opened') === 'SPEND_APPROVAL') {
    const holder = text(event.after, 'spendAssigneeEmployeeId');
    return [
      {
        recipients: holder !== request.requesterEmployeeId ? [holder] : [],
        code: 'STEP_ASSIGNED',
        params: { requestId: request.id, stepKind: 'SPEND_APPROVAL', cause: 'SUBMITTED' },
      },
    ];
  }
  // A request sent through a head opens its spend step in a batch, and the batch tells the approver once (`SPEND_BATCH_SUBMITTED`, so a
  // `SUBMISSION` check says nothing here). The one that opens it when the head confirms the reserve alone and the check made again finds the
  // request within the base is told here, as `RESERVE_CONFIRMED` tells the one that opens it with the reserve.
  if (openedByConfirmation(event)) return spendSent(event, request.requesterEmployeeId, request.id);
  if (outcome === 'USES_RESERVE' && text(event.after, 'routingMode') === 'ONE_STEP') return [];
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
        reasons.some((reason) => ['PRICE_EXPIRED', 'PRICE_MISSING'].includes(reason)) ? facts.itAdminEmployeeId : null,
      ],
      includeActor: text(event.after, 'routingMode') === 'ONE_STEP',
      code: 'REQUEST_BUDGET_BLOCKED',
      params: { requestId: request.id, reasons: reasons.join(',') },
    },
  ];
};

export const BUDGET_CHECK_RULES: Readonly<Record<string, StatusRule>> = {
  'ACCESS_REQUEST.ONE_STEP_PRICE_MISSING': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST', 'IT_ADMIN'],
    build: (event, facts) => [
      {
        recipients: [requestOf(facts).requesterEmployeeId, facts.itAdminEmployeeId],
        includeActor: true,
        code: 'REQUEST_BUDGET_BLOCKED',
        params: { requestId: requestOf(facts).id, reasons: text(event.after, 'reason') ?? 'PRICE_MISSING' },
      },
    ],
  },
  // The head confirmed the reserve alone, and the request now waits for the approver who holds the step (`FR-3.21`, review FX-5): a
  // confirmation given in the act of sending a batch is told by the batch.
  'ACCESS_REQUEST.RESERVE_CONFIRMED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST'],
    build: (event, facts) =>
      text(event.after, 'via') === 'CONFIRMATION'
        ? spendSent(event, requestOf(facts).requesterEmployeeId, requestOf(facts).id)
        : [],
  },
  // An item of a batch that cannot be priced stops there, and the one who asked and the IT Admin in charge are told why; the head who sent
  // the batch reads it in the answer (`B3`, `BRD 5.5.4`).
  'ACCESS_REQUEST.SPEND_NOT_CHECKABLE': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST', 'IT_ADMIN'],
    build: (event, facts) => [
      {
        recipients: [requestOf(facts).requesterEmployeeId, facts.itAdminEmployeeId],
        code: 'REQUEST_BUDGET_BLOCKED',
        params: { requestId: requestOf(facts).id, reasons: text(event.after, 'reason') ?? 'PRICE_MISSING' },
      },
    ],
  },
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
            reasons.some((reason) => ['PRICE_EXPIRED', 'PRICE_MISSING'].includes(reason))
              ? facts.itAdminEmployeeId
              : null,
          ],
          code: 'REQUEST_RETURNED_AT_DECISION',
          params: { requestId: request.id, reasons: reasons.join(',') },
        },
      ];
    },
  },
};
