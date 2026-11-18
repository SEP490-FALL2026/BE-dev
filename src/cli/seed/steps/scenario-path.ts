import type { DemoRequestStep, DemoRequestTarget } from '../fixture/demo-fixture.types';

export type ScenarioAction =
  | 'NEED_APPROVE'
  | 'NEED_REJECT'
  | 'NEED_RETURN'
  | 'WITHDRAW'
  | 'SUBMIT_BATCH'
  | 'CONFIRM_RESERVE'
  | 'APPROVE_SPEND'
  | 'REJECT_SPEND'
  | 'RETURN_SPEND'
  | 'ASSESSMENT_REJECT'
  | 'ASSESSMENT_RETURN'
  | 'GRANT'
  | 'FAIL_TASK_OPEN'
  | 'FAIL_TASK_CLOSE'
  | 'COMPLETE_TASK';

/**
 * What the seed reads of a request to place it on the path of its scenario. `stage` is `request.spend.stage` (not submitted, waiting for the
 * reserve confirmation, blocked, refused, ...); for a request that is `EXECUTING` it is the status of the task of its grant (`QUEUED`,
 * `IN_PROGRESS`, `FAILED`), which the request itself does not carry (Review 1, C-3).
 */
export interface ScenarioPosition {
  state: string;
  stage: string | null;
}

export interface ScenarioGoal {
  target: DemoRequestTarget;
  confirmReserve?: boolean;
  rejectAt?: DemoRequestStep;
  returnAt?: DemoRequestStep;
}

/**
 * Whether the request is where its scenario wants it. The two budget stops are read from the spend step, not from the state: a request
 * that waits for the head's confirmation of the reserve, or was blocked by the check, still waits in the queue of the head. A refusal of
 * the spending approver is a `REJECTED` request at the stage `REFUSED`, and a refusal of the need is one that is not.
 */
export function reachedTarget(position: ScenarioPosition, goal: ScenarioGoal): boolean {
  if (goal.target === 'RESERVE_UNCONFIRMED') return position.stage === 'RESERVE_CONFIRMATION';
  if (goal.target === 'BLOCKED') return position.stage === 'BLOCKED' || position.stage === 'RETURNED_TO_REQUESTER';
  if (goal.target === 'PENDING_OR_CANCELLED') return position.state === 'PENDING' || position.state === 'CANCELLED';
  if (goal.target === 'REJECTED') {
    return position.state === 'REJECTED' && (position.stage === 'REFUSED') === (goal.rejectAt === 'SPEND');
  }

  return position.state === goal.target;
}

/**
 * The point of the path a goal lies at. Two goals with the same target can lie at different points (a request refused or sent back by the
 * head, by IT or by the spending approver), so the sets below are of these names and not of targets.
 */
type Point =
  DemoRequestTarget | 'REJECTED_AT_SPEND' | 'RETURNED_AT_NEED' | 'RETURNED_AT_ASSESSMENT' | 'RETURNED_AT_SPEND';

function pointOf(goal: ScenarioGoal): Point {
  if (goal.target === 'REJECTED' && goal.rejectAt === 'SPEND') return 'REJECTED_AT_SPEND';
  if (goal.target !== 'AWAITING_REQUESTER_REVISION') return goal.target;
  if (goal.returnAt === 'ASSESSMENT') return 'RETURNED_AT_ASSESSMENT';

  return goal.returnAt === 'SPEND' ? 'RETURNED_AT_SPEND' : 'RETURNED_AT_NEED';
}

/** The targets where the grant task has been opened: the request was approved to be granted. */
const GRANTED: readonly Point[] = ['EXECUTING', 'FAILED', 'AWAITING_IT_CLOSE'];

const PAST_NEED: ReadonlySet<Point> = new Set<Point>([
  'AWAITING_SPEND_SUBMISSION',
  'AWAITING_SPEND_DECISION',
  'AWAITING_EXECUTION',
  'AWAITING_IT_ASSESSMENT',
  'RESERVE_UNCONFIRMED',
  'BLOCKED',
  'COMPLETED',
  'REJECTED_AT_SPEND',
  'RETURNED_AT_ASSESSMENT',
  'RETURNED_AT_SPEND',
  'IT_REJECTED',
  ...GRANTED,
]);
const PAST_BATCH: ReadonlySet<Point> = new Set<Point>([
  'AWAITING_SPEND_DECISION',
  'AWAITING_EXECUTION',
  'RESERVE_UNCONFIRMED',
  'BLOCKED',
  'COMPLETED',
  'REJECTED_AT_SPEND',
  'RETURNED_AT_SPEND',
  ...GRANTED,
]);
const PAST_SPEND: ReadonlySet<Point> = new Set<Point>(['AWAITING_EXECUTION', 'COMPLETED', ...GRANTED]);
/** Targets that lie past the head's confirmation of the reserve: the request has gone to the spending approver. */
const PAST_CONFIRMATION: ReadonlySet<Point> = new Set<Point>([
  'AWAITING_SPEND_DECISION',
  'AWAITING_EXECUTION',
  'COMPLETED',
  'REJECTED_AT_SPEND',
  'RETURNED_AT_SPEND',
  ...GRANTED,
]);

type Step = (goal: ScenarioGoal, stage: string | null) => ScenarioAction | null;

const fromPending: Step = (goal) => {
  const point = pointOf(goal);
  if (point === 'REJECTED') return 'NEED_REJECT';
  if (point === 'RETURNED_AT_NEED') return 'NEED_RETURN';
  if (point === 'WITHDRAWN') return 'WITHDRAW';

  return PAST_NEED.has(point) ? 'NEED_APPROVE' : null;
};

const fromAssessment: Step = (goal) => {
  const point = pointOf(goal);
  if (point === 'IT_REJECTED') return 'ASSESSMENT_REJECT';

  return point === 'RETURNED_AT_ASSESSMENT' ? 'ASSESSMENT_RETURN' : null;
};

const fromSubmission: Step = (goal, stage) => {
  const point = pointOf(goal);
  if (stage === 'RESERVE_CONFIRMATION') {
    return goal.confirmReserve && PAST_CONFIRMATION.has(point) ? 'CONFIRM_RESERVE' : null;
  }
  if (stage === 'BLOCKED') return null;

  return PAST_BATCH.has(point) ? 'SUBMIT_BATCH' : null;
};

const fromSpendDecision: Step = (goal) => {
  const point = pointOf(goal);
  if (point === 'REJECTED_AT_SPEND') return 'REJECT_SPEND';
  if (point === 'RETURNED_AT_SPEND') return 'RETURN_SPEND';

  return PAST_SPEND.has(point) ? 'APPROVE_SPEND' : null;
};

const fromExecution: Step = (goal) =>
  goal.target !== 'AWAITING_EXECUTION' && PAST_SPEND.has(pointOf(goal)) ? 'GRANT' : null;

/** The grant task is open: complete it, or fail it, and then close it as failed or withdraw the request while it waits for the close. */
const fromExecuting: Step = (goal, taskStatus) => {
  if (goal.target === 'COMPLETED') return 'COMPLETE_TASK';
  if (goal.target === 'FAILED') return taskStatus === 'FAILED' ? 'FAIL_TASK_CLOSE' : 'FAIL_TASK_OPEN';
  if (goal.target === 'AWAITING_IT_CLOSE') return taskStatus === 'FAILED' ? 'WITHDRAW' : 'FAIL_TASK_OPEN';

  return null;
};

/** What each state leads to; a state not listed leads nowhere the scenarios go. */
const FROM_STATE: Readonly<Record<string, Step>> = {
  PENDING: fromPending,
  AWAITING_IT_ASSESSMENT: fromAssessment,
  AWAITING_SPEND_SUBMISSION: fromSubmission,
  AWAITING_SPEND_DECISION: fromSpendDecision,
  AWAITING_EXECUTION: fromExecution,
  EXECUTING: fromExecuting,
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
