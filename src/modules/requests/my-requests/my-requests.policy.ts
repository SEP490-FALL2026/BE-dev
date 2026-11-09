import { ENDED_STATES, type SpendStage } from '../access-request/access-request.types';
import { checkWithdrawal } from '../access-request/withdrawal.policy';
import { queuedStatus } from '../spend/spend-status.service';
import type {
  MyRequestNeedStep,
  MyRequestRow,
  MyRequestView,
  OutcomeFacts,
  SentState,
  SpendStageFacts,
} from './my-requests.types';

/** Every state a request that was sent can be in: all of them but `DRAFT`, which is not a request until it is sent. */
export const SENT_STATES: readonly SentState[] = [
  'PENDING',
  'WAITING_CONTROLLED',
  'AWAITING_EXECUTION',
  'AWAITING_IT_ASSESSMENT',
  'AWAITING_SPEND_SUBMISSION',
  'AWAITING_SPEND_DECISION',
  'AWAITING_REQUESTER_REVISION',
  'REJECTED',
  'IT_REJECTED',
  'EXECUTING',
  'COMPLETED',
  'FAILED',
  'AWAITING_IT_CLOSE',
  'WITHDRAWN',
  'CANCELLED',
];

/** The states a `state` parameter of the list names: comma-separated, each a state of a request, none twice. Null when it is not such a list. */
export function parseStateList(value: string): SentState[] | null {
  const names = value.split(',');
  const states = names.filter((name): name is SentState => (SENT_STATES as readonly string[]).includes(name));

  return states.length === names.length && new Set(states).size === states.length ? states : null;
}

/** Whether a `state` parameter is such a list (the DTO refuses what is not). */
export const isStateList = (value: string): boolean => parseStateList(value) !== null;

/**
 * The states a row of the list may have: the states named, if any, within the group asked for. `open` is everything that is not over,
 * including a request that waits for the IT Admin to close the task of a withdrawal (it has not ended yet); `ended` is the states
 * nothing is left to do in. A draft is in neither: it is not a request.
 */
export function statesOf(view: MyRequestView | undefined, named: readonly SentState[] | undefined) {
  const inView = (state: SentState): boolean => {
    if (view === undefined) return true;

    return view === 'ended' ? ENDED_STATES.includes(state) : !ENDED_STATES.includes(state);
  };

  return SENT_STATES.filter((state) => inView(state) && (named === undefined || named.includes(state)));
}

/**
 * Where the request waits for the person who decides its need: the first need step still held or waiting, else the first. A request
 * for one person has one; a request for a group has more, and the first open one is the one that waits now.
 */
export function needStepOf<T extends { state: string }>(steps: readonly T[]): T {
  const open = steps.find((step) => step.state === 'PENDING' || step.state === 'WAITING');
  const [first] = steps;
  const chosen = open ?? first;
  if (chosen === undefined) throw new Error('A request has no need step.');

  return chosen;
}

/**
 * The person the list names as the one the request waits for: whoever holds the need step while it is held. A step that is decided
 * or closed holds nobody that anything waits for, and a step that waits under control has nobody (the reason says why).
 */
export const waitingForOf = (step: MyRequestNeedStep): string | null =>
  step.state === 'PENDING' ? step.assigneeEmployeeId : null;

/**
 * Where a request that costs money stands on its way to the spending approver, for the people who read it: the same answer the
 * detail of the request gives, judged here from facts read once for the whole page. Never a figure of a budget.
 */
export function spendStageOf(
  row: Pick<MyRequestRow, 'id' | 'state' | 'hasSpendStep'>,
  facts: SpendStageFacts,
): SpendStage | null {
  if (!row.hasSpendStep) return null;
  const { id } = row;
  switch (row.state) {
    case 'AWAITING_REQUESTER_REVISION':
      return 'RETURNED_TO_REQUESTER';
    case 'AWAITING_SPEND_SUBMISSION':
      return queuedStageOf(id, facts);
    case 'AWAITING_SPEND_DECISION':
      return 'WAITING_SPEND_DECISION';
    case 'WAITING_CONTROLLED':
      return controlledStageOf(id, facts);
    case 'REJECTED':
      return facts.spendRefusals.has(id) ? 'REFUSED' : null;
    default:
      return null;
  }
}

/** A request in the queue of its head: blocked, waiting for the head to confirm the reserve, or not yet sent on. */
function queuedStageOf(id: string, facts: SpendStageFacts): SpendStage {
  return queuedStatus(facts.checks.get(id) ?? null).stage;
}

/** A request that waits under control is read by the spend step that is open. */
function controlledStageOf(id: string, facts: SpendStageFacts): SpendStage | null {
  return facts.openSpendApproval.has(id) ? 'WAITING_SPEND_DECISION' : null;
}

/**
 * Why the request did not go on, for the one who sent it: what the person who decided the need wrote, what the spending approver wrote,
 * or what the IT Admin wrote at the gate (the same reasons the detail and the assessment of the request give to its sender). A request
 * for a group has none here: each person of it has an outcome of their own, read as lines. Null for a request that did not end in a refusal.
 */
export function outcomeOf(
  row: Pick<MyRequestRow, 'id' | 'type' | 'state' | 'needStepId'>,
  stage: SpendStage | null,
  facts: SpendStageFacts & OutcomeFacts,
): { reason: string | null } | null {
  if (row.state === 'IT_REJECTED') return { reason: facts.assessmentRefusals.get(row.id) ?? null };
  if (row.state !== 'REJECTED') return null;
  if (row.type === 'GROUP_GRANT') return { reason: null };
  if (stage === 'REFUSED') return { reason: facts.spendRefusals.get(row.id)?.reason ?? null };

  return { reason: facts.needRefusals.get(row.needStepId) ?? null };
}

/**
 * Whether the sender may withdraw the request now, by the policy of the withdrawal (`checkWithdrawal`) as it judges the sender. A hint
 * for the screen only: the withdrawal judges again on the locked request, and the task of a grant that is being worked is refused there
 * by licensing, which a list does not ask.
 */
export function canWithdrawOwn(
  row: Pick<MyRequestRow, 'state'> & { requesterEmployeeId: string },
  stage: SpendStage | null,
): boolean {
  return (
    checkWithdrawal({
      actorEmployeeId: row.requesterEmployeeId,
      requesterEmployeeId: row.requesterEmployeeId,
      actorHeadsDepartment: false,
      state: row.state,
      spendStage: stage,
      reason: null,
    }) === null
  );
}
