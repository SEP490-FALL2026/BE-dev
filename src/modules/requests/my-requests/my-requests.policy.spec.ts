import { requestStateSchema } from '../access-request/access-request.dto';
import {
  canWithdrawOwn,
  isStateList,
  needStepOf,
  outcomeOf,
  parseStateList,
  SENT_STATES,
  spendStageOf,
  statesOf,
  waitingForOf,
} from './my-requests.policy';
import type { MyRequestRow, OutcomeFacts, SpendStageFacts } from './my-requests.types';

const NO_FACTS: SpendStageFacts & OutcomeFacts = {
  checks: new Map(),
  openSpendApproval: new Set(),
  spendRefusals: new Map(),
  needRefusals: new Map(),
  assessmentRefusals: new Map(),
};
const withFacts = (facts: Partial<SpendStageFacts & OutcomeFacts>) => ({ ...NO_FACTS, ...facts });
const row = (state: MyRequestRow['state'], extra: Partial<MyRequestRow> = {}) => ({
  id: 'r1',
  type: 'GRANT' as const,
  needStepId: 's1',
  hasSpendStep: true,
  state,
  ...extra,
});

describe('the states of a request that was sent', () => {
  it('are the states a request wire carries, and never a draft', () => {
    expect([...SENT_STATES].sort()).toEqual([...requestStateSchema.options].sort());
    expect(SENT_STATES).not.toContain('DRAFT');
  });

  it.each([
    ['one state', 'PENDING', ['PENDING']],
    ['several states', 'PENDING,AWAITING_SPEND_DECISION,REJECTED', ['PENDING', 'AWAITING_SPEND_DECISION', 'REJECTED']],
  ])('reads %s of a state parameter', (_name, value, expected) => {
    expect(parseStateList(value)).toEqual(expected);
  });

  it.each([
    ['a draft', 'DRAFT'],
    ['an unknown name', 'PENDING,GONE'],
    ['a state twice', 'PENDING,PENDING'],
    ['an empty item', 'PENDING,'],
    ['a space', 'PENDING, REJECTED'],
    ['lower case', 'pending'],
    ['nothing', ''],
  ])('refuses %s in a state parameter', (_name, value) => {
    expect(parseStateList(value)).toBeNull();
    expect(isStateList(value)).toBe(false);
  });
});

describe('the states a row of the list may have', () => {
  it('are all of them when nothing narrows it, and none of them a draft', () => {
    expect(statesOf(undefined, undefined)).toEqual(SENT_STATES);
  });

  it('puts a withdrawal that waits for the IT Admin among the requests that are open, and the ones nothing is left in among the ended', () => {
    expect(statesOf('open', undefined)).toEqual(
      expect.arrayContaining(['PENDING', 'EXECUTING', 'AWAITING_IT_CLOSE', 'WAITING_CONTROLLED']),
    );
    expect(statesOf('ended', undefined).sort()).toEqual(
      ['CANCELLED', 'COMPLETED', 'FAILED', 'IT_REJECTED', 'REJECTED', 'WITHDRAWN'].sort(),
    );
    expect(statesOf('open', undefined).filter((state) => statesOf('ended', undefined).includes(state))).toEqual([]);
  });

  it('keeps the states named within the group asked for, so that two narrowings both hold', () => {
    expect(statesOf('open', ['PENDING', 'COMPLETED'])).toEqual(['PENDING']);
    expect(statesOf('ended', ['PENDING'])).toEqual([]);
    expect(statesOf(undefined, ['REJECTED', 'PENDING'])).toEqual(['PENDING', 'REJECTED']);
  });
});

describe('where the request waits at the need step', () => {
  const step = (id: string, state: string, assignee: string | null = null) => ({ id, state, assignee });

  it('is the first step that is held or waiting, else the first step', () => {
    expect(needStepOf([step('a', 'APPROVED'), step('b', 'PENDING'), step('c', 'WAITING')]).id).toBe('b');
    expect(needStepOf([step('a', 'APPROVED'), step('b', 'CLOSED')]).id).toBe('a');
    expect(() => needStepOf([])).toThrow('no need step');
  });

  it.each([
    ['held', 'PENDING', 'e1', 'e1'],
    ['waiting under control', 'WAITING', null, null],
    ['decided', 'APPROVED', 'e1', null],
    ['refused', 'REJECTED', 'e1', null],
    ['closed by the end of the request', 'CLOSED', 'e1', null],
  ] as const)('names the holder of a step that is %s only while it is held', (_name, state, holder, named) => {
    expect(waitingForOf({ state, assigneeEmployeeId: holder, waitingReason: null })).toBe(named);
  });
});

describe('where a request that costs money stands', () => {
  it('is nothing for a request with no spend step, whatever its state', () => {
    expect(spendStageOf(row('AWAITING_SPEND_DECISION', { hasSpendStep: false }), NO_FACTS)).toBeNull();
  });

  it.each([
    ['AWAITING_SPEND_DECISION', 'WAITING_SPEND_DECISION'],
    ['PENDING', null],
    ['COMPLETED', null],
  ] as const)('reads %s as %s', (state, stage) => {
    expect(spendStageOf(row(state), NO_FACTS)).toBe(stage);
  });

  it('BR-MF1-06g/06h: reads the queue of the head from the newest check: blocked, waiting for the reserve to be confirmed, or not sent', () => {
    const queued = {
      route: 'SPEND_APPROVAL' as const,
      staleCostEvidence: false,
      blockReasons: [],
      overBaseByMinor: null,
      overByMinor: null,
      currency: 'VND',
    };
    const blocked = {
      ...queued,
      route: 'BLOCKED' as const,
      outcome: 'BLOCKED' as const,
      blockReasons: ['OVER_RESERVE' as const],
      overByMinor: 3n,
    };
    const usesReserve = { ...queued, outcome: 'USES_RESERVE' as const, overBaseByMinor: 2n };
    const stageOf = (check?: typeof blocked | typeof usesReserve) =>
      spendStageOf(
        row('AWAITING_SPEND_SUBMISSION'),
        check ? withFacts({ checks: new Map([['r1', check]]) }) : NO_FACTS,
      );

    expect(stageOf()).toBe('NOT_SUBMITTED');
    expect(stageOf(blocked)).toBe('BLOCKED');
    expect(stageOf(usesReserve)).toBe('RESERVE_CONFIRMATION');
  });

  it('reads a check made before the three outcomes that blocked the request as blocked', () => {
    const legacy = {
      outcome: null,
      route: 'BLOCKED' as const,
      blockReasons: [],
      staleCostEvidence: true,
      overBaseByMinor: null,
      overByMinor: null,
      currency: 'VND',
    };

    expect(spendStageOf(row('AWAITING_SPEND_SUBMISSION'), withFacts({ checks: new Map([['r1', legacy]]) }))).toBe(
      'BLOCKED',
    );
  });

  it('reads a request that waits under control by the spend step that is open', () => {
    const open = (held: boolean) => withFacts({ openSpendApproval: new Set(held ? ['r1'] : []) });

    expect(spendStageOf(row('WAITING_CONTROLLED'), open(true))).toBe('WAITING_SPEND_DECISION');
    expect(spendStageOf(row('WAITING_CONTROLLED'), open(false))).toBeNull();
  });

  it('says refused only for a request the spending approver refused, not one the head refused at the need', () => {
    expect(spendStageOf(row('REJECTED'), withFacts({ spendRefusals: new Map([['r1', { reason: 'no' }]]) }))).toBe(
      'REFUSED',
    );
    expect(spendStageOf(row('REJECTED'), NO_FACTS)).toBeNull();
  });
});

describe('why a request did not go on', () => {
  it('is what the head wrote when the head refused the need', () => {
    const facts = withFacts({ needRefusals: new Map([['s1', 'Already has seats']]) });

    expect(outcomeOf(row('REJECTED'), null, facts)).toEqual({ reason: 'Already has seats' });
  });

  it('is what the spending approver wrote when they refused it', () => {
    const facts = withFacts({
      spendRefusals: new Map([['r1', { reason: 'Over the limit' }]]),
      needRefusals: new Map([['s1', 'not this']]),
    });

    expect(outcomeOf(row('REJECTED'), 'REFUSED', facts)).toEqual({ reason: 'Over the limit' });
  });

  it('is what the IT Admin wrote at the gate', () => {
    const facts = withFacts({ assessmentRefusals: new Map([['r1', 'Cannot be controlled']]) });

    expect(outcomeOf(row('IT_REJECTED'), null, facts)).toEqual({ reason: 'Cannot be controlled' });
  });

  it('is nothing for a request of a group, which gives a reason for each person', () => {
    expect(outcomeOf(row('REJECTED', { type: 'GROUP_GRANT' }), null, NO_FACTS)).toEqual({ reason: null });
  });

  it.each(['PENDING', 'COMPLETED', 'WITHDRAWN', 'FAILED', 'CANCELLED', 'AWAITING_IT_CLOSE'] as const)(
    'is no outcome at all for a request in %s',
    (state) => {
      expect(outcomeOf(row(state), null, NO_FACTS)).toBeNull();
    },
  );
});

describe('whether the sender may withdraw the request now', () => {
  it.each([
    ['PENDING', null, true],
    ['WAITING_CONTROLLED', null, true],
    ['AWAITING_IT_ASSESSMENT', null, true],
    ['AWAITING_SPEND_SUBMISSION', 'BLOCKED', true],
    ['AWAITING_SPEND_SUBMISSION', 'RESERVE_CONFIRMATION', true],
    ['AWAITING_SPEND_DECISION', 'WAITING_SPEND_DECISION', true],
    ['EXECUTING', null, true],
    ['AWAITING_IT_CLOSE', null, false],
    ['COMPLETED', null, false],
    ['REJECTED', 'REFUSED', false],
    ['IT_REJECTED', null, false],
    ['FAILED', null, false],
    ['WITHDRAWN', null, false],
    ['CANCELLED', null, false],
  ] as const)('is judged by the policy of the withdrawal: %s with stage %s is %s', (state, stage, expected) => {
    expect(canWithdrawOwn({ state, requesterEmployeeId: 'e1' }, stage)).toBe(expected);
  });
});
