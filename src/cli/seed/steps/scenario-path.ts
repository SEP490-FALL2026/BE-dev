import type { DemoRequestTarget } from '../fixture/demo-fixture.types';

export type ScenarioAction =
  | 'NEED_APPROVE'
  | 'NEED_REJECT'
  | 'WITHDRAW'
  | 'SUBMIT_BATCH'
  | 'CONFIRM_RESERVE'
  | 'APPROVE_SPEND'
  | 'GRANT'
  | 'COMPLETE_TASK';

/** What the seed reads of a request to place it on the path of its scenario. */
export interface ScenarioPosition {
  state: string;
  /** `request.spend.stage`: where the spend step stands (not submitted, waiting for the reserve confirmation, blocked, ...). */
  stage: string | null;
}

export interface ScenarioGoal {
  target: DemoRequestTarget;
  confirmReserve?: boolean;
}

/**
 * Whether the request is where its scenario wants it. The two budget stops are read from the spend step, not from the state: a request
 * that waits for the head's confirmation of the reserve, or was blocked by the check, still waits in the queue of the head.
 */
export function reachedTarget(position: ScenarioPosition, goal: ScenarioGoal): boolean {
  if (goal.target === 'RESERVE_UNCONFIRMED') return position.stage === 'RESERVE_CONFIRMATION';
  if (goal.target === 'BLOCKED') return position.stage === 'BLOCKED' || position.stage === 'RETURNED_TO_REQUESTER';

  return position.state === goal.target;
}

const PAST_NEED: ReadonlySet<DemoRequestTarget> = new Set([
  'AWAITING_SPEND_SUBMISSION',
  'AWAITING_SPEND_DECISION',
  'AWAITING_EXECUTION',
  'AWAITING_IT_ASSESSMENT',
  'RESERVE_UNCONFIRMED',
  'BLOCKED',
  'COMPLETED',
]);
const PAST_BATCH: ReadonlySet<DemoRequestTarget> = new Set([
  'AWAITING_SPEND_DECISION',
  'AWAITING_EXECUTION',
  'RESERVE_UNCONFIRMED',
  'BLOCKED',
  'COMPLETED',
]);
const PAST_SPEND: ReadonlySet<DemoRequestTarget> = new Set(['AWAITING_EXECUTION', 'COMPLETED']);
/** Targets that lie past the head's confirmation of the reserve: the request has gone to the spending approver. */
const PAST_CONFIRMATION: ReadonlySet<DemoRequestTarget> = new Set([
  'AWAITING_SPEND_DECISION',
  'AWAITING_EXECUTION',
  'COMPLETED',
]);

type Step = (goal: ScenarioGoal, stage: string | null) => ScenarioAction | null;

const fromPending: Step = (goal) => {
  if (goal.target === 'REJECTED') return 'NEED_REJECT';
  if (goal.target === 'WITHDRAWN') return 'WITHDRAW';

  return PAST_NEED.has(goal.target) ? 'NEED_APPROVE' : null;
};

const fromSubmission: Step = (goal, stage) => {
  if (stage === 'RESERVE_CONFIRMATION')
    return goal.confirmReserve && PAST_CONFIRMATION.has(goal.target) ? 'CONFIRM_RESERVE' : null;
  if (stage === 'BLOCKED') return null;

  return PAST_BATCH.has(goal.target) ? 'SUBMIT_BATCH' : null;
};

/** What each state leads to; a state not listed leads nowhere the scenarios go. */
const FROM_STATE: Readonly<Record<string, Step>> = {
  PENDING: fromPending,
  AWAITING_SPEND_SUBMISSION: fromSubmission,
  AWAITING_SPEND_DECISION: (goal) => (PAST_SPEND.has(goal.target) ? 'APPROVE_SPEND' : null),
  AWAITING_EXECUTION: (goal) => (goal.target === 'COMPLETED' ? 'GRANT' : null),
  EXECUTING: (goal) => (goal.target === 'COMPLETED' ? 'COMPLETE_TASK' : null),
};

/**
 * The one next action that brings a request from where it is towards the target of its scenario, or null when no action of the
 * scenario leads there (the request went another way: a refusal, a stop, a different route of the budget check). Pure: the caller
 * reads the position, asks, acts, reads again.
 */
export function nextScenarioAction(position: ScenarioPosition, goal: ScenarioGoal): ScenarioAction | null {
  if (reachedTarget(position, goal)) return null;

  return FROM_STATE[position.state]?.(goal, position.stage) ?? null;
}
