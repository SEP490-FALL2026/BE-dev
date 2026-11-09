import { nextScenarioAction, reachedTarget } from './scenario-path';

const at = (state: string, stage: string | null = null) => ({ state, stage });

describe('the next action of a demo request scenario', () => {
  it.each([
    ['PENDING', 'REJECTED', 'NEED_REJECT'],
    ['PENDING', 'WITHDRAWN', 'WITHDRAW'],
    ['PENDING', 'AWAITING_SPEND_SUBMISSION', 'NEED_APPROVE'],
    ['PENDING', 'AWAITING_IT_ASSESSMENT', 'NEED_APPROVE'],
    ['PENDING', 'AWAITING_EXECUTION', 'NEED_APPROVE'],
    ['PENDING', 'COMPLETED', 'NEED_APPROVE'],
    ['AWAITING_SPEND_SUBMISSION', 'AWAITING_SPEND_DECISION', 'SUBMIT_BATCH'],
    ['AWAITING_SPEND_SUBMISSION', 'RESERVE_UNCONFIRMED', 'SUBMIT_BATCH'],
    ['AWAITING_SPEND_SUBMISSION', 'BLOCKED', 'SUBMIT_BATCH'],
    ['AWAITING_SPEND_DECISION', 'COMPLETED', 'APPROVE_SPEND'],
    ['AWAITING_SPEND_DECISION', 'AWAITING_EXECUTION', 'APPROVE_SPEND'],
    ['AWAITING_EXECUTION', 'COMPLETED', 'GRANT'],
    ['EXECUTING', 'COMPLETED', 'COMPLETE_TASK'],
  ] as const)('from %s towards %s is %s', (state, target, action) => {
    expect(nextScenarioAction(at(state), { target })).toBe(action);
  });

  it('confirms the reserve only for a scenario whose head confirms it, and only once it waits for it', () => {
    const waiting = at('AWAITING_SPEND_SUBMISSION', 'RESERVE_CONFIRMATION');

    expect(nextScenarioAction(waiting, { target: 'AWAITING_SPEND_DECISION', confirmReserve: true })).toBe(
      'CONFIRM_RESERVE',
    );
    expect(nextScenarioAction(waiting, { target: 'AWAITING_SPEND_DECISION' })).toBeNull();
  });

  it.each([
    [at('COMPLETED'), 'COMPLETED'],
    [at('PENDING'), 'PENDING'],
    [at('AWAITING_SPEND_SUBMISSION', 'RESERVE_CONFIRMATION'), 'RESERVE_UNCONFIRMED'],
    [at('AWAITING_SPEND_SUBMISSION', 'BLOCKED'), 'BLOCKED'],
  ] as const)('%j has reached %s', (position, target) => {
    expect(reachedTarget(position, { target })).toBe(true);
    expect(nextScenarioAction(position, { target })).toBeNull();
  });

  it.each([
    // The request went another way: nothing the scenario does brings it back, so the run reports a conflict.
    [at('REJECTED'), 'COMPLETED'],
    [at('AWAITING_SPEND_SUBMISSION', 'BLOCKED'), 'COMPLETED'],
    [at('AWAITING_REQUESTER_REVISION'), 'AWAITING_SPEND_DECISION'],
    [at('WAITING_CONTROLLED'), 'COMPLETED'],
  ] as const)('from %j towards %s is none', (position, target) => {
    expect(nextScenarioAction(position, { target })).toBeNull();
  });
});
