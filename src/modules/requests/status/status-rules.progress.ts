import { requestOf, stepKindOf, text } from './status-rule.support';
import type { NotificationIntent, StatusRule } from './request-status.types';

/** Where a request goes when its need step is approved, from the state the decision gave it (`US-05-15` AC-2 is the refusal). */
const NEXT_BY_STATE: Readonly<Record<string, string>> = {
  AWAITING_IT_ASSESSMENT: 'IT_ASSESSMENT',
  AWAITING_SPEND_SUBMISSION: 'SPEND_SUBMISSION',
  AWAITING_EXECUTION: 'EXECUTION',
};

/** What the requester is told about where a request is: `stage` of the submission by how the need step was routed (`US-05-15` AC-8). */
const STAGE_BY_OUTCOME: Readonly<Record<string, string>> = {
  ASSIGNED: 'WAITING_NEED_DECISION',
  WAITING: 'WAITING_CONTROLLED',
  CONFIRMED_BY_SENDING: 'CONFIRMED',
};

/**
 * The progress of a request: what only the requester is told, and the people who are given a step. Rows 1, 2 and 13 to 15 of the
 * table of events. The people it is for besides the requester hear only how it ended (`status-rules.outcome.ts`).
 */
export const PROGRESS_RULES: Readonly<Record<string, StatusRule>> = {
  // 1: the need step was routed when the request was sent.
  'ACCESS_REQUEST.NEED_STEP_ROUTED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST'],
    build: (event, facts): NotificationIntent[] => {
      const request = requestOf(facts);
      const outcome = text(event.after, 'outcome') ?? '';
      const stage = STAGE_BY_OUTCOME[outcome];
      if (stage === undefined) return [];
      const holder = outcome === 'ASSIGNED' ? text(event.after, 'assigneeEmployeeId') : null;

      return [
        // The person who sent it is told it was sent, though they caused the event.
        {
          recipients: [request.requesterEmployeeId],
          code: 'REQUEST_SUBMITTED',
          params: { requestId: request.id, stage },
          includeActor: true,
        },
        {
          recipients: holder !== request.requesterEmployeeId ? [holder] : [],
          code: 'STEP_ASSIGNED',
          params: { requestId: request.id, stepKind: 'NEED', cause: 'SUBMITTED' },
        },
      ];
    },
  },
  // 2: the need step was approved; the next step of a request for new software is given to the IT Admin who holds it.
  'ACCESS_REQUEST.NEED_APPROVED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST', 'ASSESSMENT_HOLDER'],
    build: (event, facts): NotificationIntent[] => {
      const request = requestOf(facts);
      const state = text(event.after, 'requestState') ?? '';
      // A renewal needs nobody to carry it out: the next thing that happens to it is that it takes effect.
      const next =
        request.type === 'RENEWAL' && state === 'AWAITING_EXECUTION' ? 'RENEWAL_APPLIED' : NEXT_BY_STATE[state];
      if (next === undefined) return [];

      return [
        {
          recipients: [request.requesterEmployeeId],
          code: 'REQUEST_NEED_APPROVED',
          params: { requestId: request.id, next },
        },
        {
          recipients:
            next === 'IT_ASSESSMENT' && request.branch === 'NEW_SOFTWARE' ? [facts.assessmentHolderEmployeeId] : [],
          code: 'STEP_ASSIGNED',
          params: { requestId: request.id, stepKind: 'IT_ASSESSMENT', cause: 'ASSESSMENT' },
        },
      ];
    },
  },
  // 13: a step waits for somebody who can hold it.
  'ACCESS_REQUEST.STEP_WAITING': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST'],
    build: (event, facts): NotificationIntent[] => {
      const request = requestOf(facts);

      return [
        {
          recipients: [request.requesterEmployeeId],
          code: 'REQUEST_WAITING_CONTROLLED',
          params: { requestId: request.id, stepKind: stepKindOf(event) },
        },
      ];
    },
  },
  // 14: a step that waited was given to somebody; the requester hears that the wait is over, the new holder that it is theirs.
  'ACCESS_REQUEST.STEP_ASSIGNED_FROM_WAIT': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST'],
    build: (event, facts): NotificationIntent[] => {
      const request = requestOf(facts);
      const holder = text(event.after, 'assigneeEmployeeId');

      return [
        {
          recipients: [request.requesterEmployeeId],
          code: 'REQUEST_WAITING_ENDED',
          params: { requestId: request.id, stepKind: stepKindOf(event) },
        },
        {
          recipients: holder !== request.requesterEmployeeId ? [holder] : [],
          code: 'STEP_ASSIGNED',
          params: { requestId: request.id, stepKind: stepKindOf(event), cause: 'WAIT_ENDED' },
        },
      ];
    },
  },
  // 15: the step moved to somebody else because the organization or a role changed.
  'ACCESS_REQUEST.STEP_REDETERMINED': {
    subject: 'ACCESS_REQUEST',
    needs: ['REQUEST'],
    build: (event, facts): NotificationIntent[] => {
      const request = requestOf(facts);
      const holder = text(event.after, 'assigneeEmployeeId');

      return [
        {
          recipients: holder !== request.requesterEmployeeId ? [holder] : [],
          code: 'STEP_ASSIGNED',
          params: { requestId: request.id, stepKind: stepKindOf(event), cause: 'REASSIGNED' },
        },
      ];
    },
  },
};
