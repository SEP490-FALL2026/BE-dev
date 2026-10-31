import type { DemoRequestTarget } from '../fixture/demo-fixture.types';

export type ScenarioAction =
  'NEED_APPROVE' | 'NEED_REJECT' | 'WITHDRAW' | 'SUBMIT_BATCH' | 'APPROVE_SPEND' | 'GRANT' | 'COMPLETE_TASK';

const AFTER_NEED: ReadonlySet<DemoRequestTarget> = new Set([
  'AWAITING_SPEND_SUBMISSION',
  'AWAITING_EXECUTION',
  'AWAITING_SPEND_DECISION',
  'AWAITING_FINANCE_REVIEW',
  'AWAITING_IT_ASSESSMENT',
  'COMPLETED',
]);
const AFTER_BATCH: ReadonlySet<DemoRequestTarget> = new Set([
  'AWAITING_SPEND_DECISION',
  'AWAITING_FINANCE_REVIEW',
  'COMPLETED',
]);

function fromPending(target: DemoRequestTarget): ScenarioAction | null {
  if (target === 'REJECTED') return 'NEED_REJECT';
  if (target === 'WITHDRAWN') return 'WITHDRAW';

  return AFTER_NEED.has(target) ? 'NEED_APPROVE' : null;
}

/** What each state leads to, by the target of the scenario; a state not listed leads nowhere the scenarios go. */
const FROM_STATE: Readonly<Record<string, (target: DemoRequestTarget) => ScenarioAction | null>> = {
  PENDING: fromPending,
  AWAITING_SPEND_SUBMISSION: (target) => (AFTER_BATCH.has(target) ? 'SUBMIT_BATCH' : null),
  AWAITING_SPEND_DECISION: (target) => (target === 'COMPLETED' ? 'APPROVE_SPEND' : null),
  AWAITING_EXECUTION: (target) => (target === 'COMPLETED' ? 'GRANT' : null),
  EXECUTING: (target) => (target === 'COMPLETED' ? 'COMPLETE_TASK' : null),
};

/**
 * The one next action that brings a request from the state it is in towards the target of its scenario, or null when no
 * action of the scenario leads there (the request went another way: a refusal, a stop, a different route of the budget
 * check). Pure: the caller reads the state, asks, acts, reads again.
 */
export function nextScenarioAction(state: string, target: DemoRequestTarget): ScenarioAction | null {
  if (state === target) return null;

  return FROM_STATE[state]?.(target) ?? null;
}
