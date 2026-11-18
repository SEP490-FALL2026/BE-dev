import { nextScenarioAction, reachedTarget, type ScenarioGoal } from './scenario-path';

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

describe('the paths to the remaining states of a request (T10, S10a)', () => {
  const goal = (target: string, extra: Record<string, unknown> = {}) => ({ target, ...extra }) as ScenarioGoal;

  it.each([
    ['AWAITING_SPEND_DECISION', null, goal('REJECTED', { rejectAt: 'SPEND' }), 'REJECT_SPEND'],
    ['PENDING', null, goal('REJECTED', { rejectAt: 'SPEND' }), 'NEED_APPROVE'],
    ['PENDING', null, goal('REJECTED'), 'NEED_REJECT'],
    ['PENDING', null, goal('AWAITING_REQUESTER_REVISION', { returnAt: 'NEED' }), 'NEED_RETURN'],
    ['PENDING', null, goal('AWAITING_REQUESTER_REVISION', { returnAt: 'ASSESSMENT' }), 'NEED_APPROVE'],
    [
      'AWAITING_IT_ASSESSMENT',
      null,
      goal('AWAITING_REQUESTER_REVISION', { returnAt: 'ASSESSMENT' }),
      'ASSESSMENT_RETURN',
    ],
    ['AWAITING_SPEND_DECISION', null, goal('AWAITING_REQUESTER_REVISION', { returnAt: 'SPEND' }), 'RETURN_SPEND'],
    ['AWAITING_SPEND_SUBMISSION', null, goal('AWAITING_REQUESTER_REVISION', { returnAt: 'SPEND' }), 'SUBMIT_BATCH'],
    ['PENDING', null, goal('IT_REJECTED'), 'NEED_APPROVE'],
    ['AWAITING_IT_ASSESSMENT', null, goal('IT_REJECTED'), 'ASSESSMENT_REJECT'],
    ['AWAITING_EXECUTION', null, goal('EXECUTING'), 'GRANT'],
    ['AWAITING_EXECUTION', null, goal('FAILED'), 'GRANT'],
    // Review 1 (C-3): the state of the task of the grant goes beside the state of the request.
    ['EXECUTING', 'QUEUED', goal('FAILED'), 'FAIL_TASK_OPEN'],
    ['EXECUTING', 'FAILED', goal('FAILED'), 'FAIL_TASK_CLOSE'],
    // QĐ-113d: the requester withdraws only before the first decision; once sent back, the withdrawal ends the request.
    ['PENDING', null, goal('WITHDRAWN_AFTER_RETURN'), 'NEED_RETURN'],
    ['AWAITING_REQUESTER_REVISION', null, goal('WITHDRAWN_AFTER_RETURN'), 'WITHDRAW'],
    ['WITHDRAWN', null, goal('WITHDRAWN_AFTER_RETURN'), null],
    ['AWAITING_REQUESTER_REVISION', null, goal('AWAITING_REQUESTER_REVISION', { returnAt: 'NEED' }), null],
    ['EXECUTING', null, goal('EXECUTING'), null],
    ['EXECUTING', 'QUEUED', goal('COMPLETED'), 'COMPLETE_TASK'],
    ['PENDING', null, goal('PENDING_OR_CANCELLED'), null],
    ['CANCELLED', null, goal('PENDING_OR_CANCELLED'), null],
  ] as const)('from %s (%s) towards %j is %s', (state, stage, aim, action) => {
    expect(nextScenarioAction(at(state, stage), aim)).toBe(action);
  });

  it('reads a refusal of the spending approver from the spend step, and a refusal of the need as no such refusal', () => {
    const refusedAtSpend = goal('REJECTED', { rejectAt: 'SPEND' });

    expect(reachedTarget(at('REJECTED', 'REFUSED'), refusedAtSpend)).toBe(true);
    expect(reachedTarget(at('REJECTED', null), refusedAtSpend)).toBe(false);
    expect(reachedTarget(at('REJECTED', null), goal('REJECTED'))).toBe(true);
    expect(reachedTarget(at('REJECTED', 'REFUSED'), goal('REJECTED'))).toBe(false);
  });

  it.each(['PENDING', 'CANCELLED'])(
    'counts %s as where a request that may be cancelled by a job has arrived',
    (state) => {
      expect(reachedTarget(at(state), goal('PENDING_OR_CANCELLED'))).toBe(true);
      expect(reachedTarget(at('AWAITING_EXECUTION'), goal('PENDING_OR_CANCELLED'))).toBe(false);
    },
  );

  it('counts a request sent back to its requester as arrived whichever step sent it back', () => {
    expect(
      reachedTarget(at('AWAITING_REQUESTER_REVISION', 'RETURNED_TO_REQUESTER'), goal('AWAITING_REQUESTER_REVISION')),
    ).toBe(true);
  });
});
