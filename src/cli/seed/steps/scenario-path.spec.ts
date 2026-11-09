import { nextScenarioAction } from './scenario-path';

describe('the next action of a demo request scenario', () => {
  it.each([
    ['PENDING', 'REJECTED', 'NEED_REJECT'],
    ['PENDING', 'WITHDRAWN', 'WITHDRAW'],
    ['PENDING', 'AWAITING_SPEND_SUBMISSION', 'NEED_APPROVE'],
    ['PENDING', 'AWAITING_IT_ASSESSMENT', 'NEED_APPROVE'],
    ['PENDING', 'COMPLETED', 'NEED_APPROVE'],
    ['AWAITING_SPEND_SUBMISSION', 'AWAITING_SPEND_DECISION', 'SUBMIT_BATCH'],
    ['AWAITING_SPEND_DECISION', 'COMPLETED', 'APPROVE_SPEND'],
    ['AWAITING_EXECUTION', 'COMPLETED', 'GRANT'],
    ['EXECUTING', 'COMPLETED', 'COMPLETE_TASK'],
  ] as const)('from %s towards %s is %s', (state, target, action) => {
    expect(nextScenarioAction(state, target)).toBe(action);
  });

  it.each([
    ['COMPLETED', 'COMPLETED'],
    ['PENDING', 'PENDING'],
    // The request went another way: nothing the scenario does brings it back, so the run reports a conflict.
    ['REJECTED', 'COMPLETED'],
    // Finance has no review any more (QĐ-97c): a request in a state that is retired leads nowhere.
    ['AWAITING_FINANCE_REVIEW', 'AWAITING_SPEND_DECISION'],
    ['AWAITING_SPEND_SUBMISSION', 'AWAITING_SPEND_SUBMISSION'],
    ['WAITING_CONTROLLED', 'COMPLETED'],
  ] as const)('from %s towards %s is none', (state, target) => {
    expect(nextScenarioAction(state, target)).toBeNull();
  });
});
