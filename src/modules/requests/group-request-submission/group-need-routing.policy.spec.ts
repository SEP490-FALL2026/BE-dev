import type { RoutingFacts } from '../access-request/routing.policy';
import {
  groupLineRowsOf,
  groupStartState,
  planNeedSteps,
  SENT_BY_EMPLOYEE_ROW,
  SENT_BY_HEAD_ROW,
} from './group-need-routing.policy';

const people = (...ids: string[]) => ids.map((employeeId) => ({ employeeId }));
const facts = (patch: Partial<RoutingFacts> = {}): RoutingFacts => ({
  requesterEmployeeId: 'sender',
  departmentHeadEmployeeId: 'head',
  spendingApproverEmployeeId: 'approver',
  chainHasSpendStep: true,
  ...patch,
});
const plan = (who: { sender: string; head: string | null; lines: string[] }, routing: Partial<RoutingFacts> = {}) =>
  planNeedSteps({
    senderEmployeeId: who.sender,
    senderIsHead: who.sender === who.head,
    headEmployeeId: who.head,
    lines: people(...who.lines),
    facts: facts({ requesterEmployeeId: who.sender, ...routing }),
    slaWorkingDays: 2,
  });
const shape = (planned: ReturnType<typeof plan>) =>
  planned.map((entry) => ({
    lines: entry.lines.map((line) => line.employeeId),
    state: entry.step.state,
    assignee: entry.step.assigneeEmployeeId,
    row: entry.step.routingRow,
    reason: entry.step.waitingReason,
    confirmed: entry.confirmedBySending,
  }));

describe('the steps the people of a group go to (US-05-03 AC-8, AC-14, US-05-17 AC-3, AC-11, AC-16)', () => {
  describe('a head sends', () => {
    it('confirms the others by sending, in a step of the head, and has nothing else for them to decide', () => {
      expect(shape(plan({ sender: 'head', head: 'head', lines: ['e1', 'e2'] }))).toEqual([
        {
          lines: ['e1', 'e2'],
          state: 'PENDING',
          assignee: 'head',
          row: SENT_BY_HEAD_ROW,
          reason: null,
          confirmed: true,
        },
      ]);
    });

    it('gives the line of the head to the spending approver, in a step of its own, which the head does not decide', () => {
      expect(shape(plan({ sender: 'head', head: 'head', lines: ['e1', 'head', 'e2'] }))).toEqual([
        { lines: ['e1', 'e2'], state: 'PENDING', assignee: 'head', row: 5, reason: null, confirmed: true },
        { lines: ['head'], state: 'PENDING', assignee: 'approver', row: 2, reason: null, confirmed: false },
      ]);
    });

    it('lets the line of a head who is also the spending approver wait, and gives it to nobody (QĐ-93b: data from before)', () => {
      const [, own] = plan(
        { sender: 'head', head: 'head', lines: ['e1', 'head'] },
        { spendingApproverEmployeeId: 'head' },
      );

      expect([own.step.state, own.step.assigneeEmployeeId, own.step.waitingReason]).toEqual([
        'WAITING',
        null,
        'NO_SPENDING_APPROVER',
      ]);
    });

    it('lets the line of the head wait under control when nobody can decide it, and keeps the others confirmed', () => {
      const planned = plan(
        { sender: 'head', head: 'head', lines: ['e1', 'head'] },
        { spendingApproverEmployeeId: null },
      );

      expect(shape(planned)).toEqual([
        { lines: ['e1'], state: 'PENDING', assignee: 'head', row: 5, reason: null, confirmed: true },
        { lines: ['head'], state: 'WAITING', assignee: null, row: 8, reason: 'NO_SPENDING_APPROVER', confirmed: false },
      ]);
    });

    it('has only the step of the head own line when the head names nobody else', () => {
      expect(shape(plan({ sender: 'head', head: 'head', lines: ['head'] }))).toEqual([
        { lines: ['head'], state: 'PENDING', assignee: 'approver', row: 2, reason: null, confirmed: false },
      ]);
    });
  });

  describe('an Employee sends', () => {
    it('gives every person to the head, confirming nobody, including the Employee who sends', () => {
      expect(shape(plan({ sender: 'e1', head: 'head', lines: ['e1', 'e2', 'e3'] }))).toEqual([
        {
          lines: ['e1', 'e2', 'e3'],
          state: 'PENDING',
          assignee: 'head',
          row: SENT_BY_EMPLOYEE_ROW,
          reason: null,
          confirmed: false,
        },
      ]);
    });

    it('gives the line of the head to the person who decides a head of their own request, in a second step', () => {
      expect(shape(plan({ sender: 'e1', head: 'head', lines: ['e1', 'head'] }))).toEqual([
        { lines: ['e1'], state: 'PENDING', assignee: 'head', row: 9, reason: null, confirmed: false },
        { lines: ['head'], state: 'PENDING', assignee: 'approver', row: 2, reason: null, confirmed: false },
      ]);
    });

    it('a group line of a department without head waits', () => {
      const noHead = { departmentHeadEmployeeId: null };

      // Nobody takes the step in place of the head (`QĐ-93c`): the people wait together under control, on row 4.
      expect(shape(plan({ sender: 'e1', head: null, lines: ['e1', 'e2'] }, noHead))).toEqual([
        {
          lines: ['e1', 'e2'],
          state: 'WAITING',
          assignee: null,
          row: 4,
          reason: 'NO_DEPARTMENT_HEAD',
          confirmed: false,
        },
      ]);
      // Not even a person who holds the spending approver role, or who is named among the people, is given it.
      expect(
        shape(
          plan(
            { sender: 'e1', head: null, lines: ['e1', 'approver'] },
            { ...noHead, spendingApproverEmployeeId: 'approver' },
          ),
        ),
      ).toEqual([
        {
          lines: ['e1', 'approver'],
          state: 'WAITING',
          assignee: null,
          row: 4,
          reason: 'NO_DEPARTMENT_HEAD',
          confirmed: false,
        },
      ]);
    });
  });

  it('keeps the order the people were named in, within each step', () => {
    const planned = plan({ sender: 'head', head: 'head', lines: ['e3', 'head', 'e1', 'e2'] });

    expect(planned[0].lines.map((line) => line.employeeId)).toEqual(['e3', 'e1', 'e2']);
  });
});

describe('the state a request for a group starts in, and the rows of its lines (US-05-17, US-05-03 AC-8)', () => {
  const step = (state: 'PENDING' | 'WAITING') => ({
    state,
    assigneeEmployeeId: null,
    routingRow: 1,
    waitingReason: null,
    samePersonAsSpend: false,
    slaWorkingDays: 2,
  });
  const entry = (state: 'PENDING' | 'WAITING', confirmedBySending: boolean, ...ids: string[]) => ({
    lines: people(...ids),
    step: step(state),
    confirmedBySending,
  });

  it('goes on at once to what follows the need when the head confirmed every person by sending', () => {
    expect(groupStartState([entry('PENDING', true, 'a', 'b')], 'PAID_IN_CATALOG')).toBe('AWAITING_SPEND_SUBMISSION');
    expect(groupStartState([entry('PENDING', true, 'a')], 'INTERNAL_FREE')).toBe('AWAITING_EXECUTION');
  });

  it('waits under control only when every step that is still open waits for somebody, and is pending otherwise', () => {
    expect(groupStartState([entry('WAITING', false, 'a')], 'PAID_IN_CATALOG')).toBe('WAITING_CONTROLLED');
    expect(groupStartState([entry('WAITING', false, 'a'), entry('PENDING', false, 'b')], 'PAID_IN_CATALOG')).toBe(
      'PENDING',
    );
    expect(groupStartState([entry('PENDING', true, 'a'), entry('WAITING', false, 'b')], 'PAID_IN_CATALOG')).toBe(
      'WAITING_CONTROLLED',
    );
  });

  it('writes a line for each person under the step that holds them, confirmed by sending or waiting for their need', () => {
    const planned = [entry('PENDING', true, 'a', 'b'), entry('PENDING', false, 'c')];

    expect(
      groupLineRowsOf('req-1', planned, ['step-1', 'step-2']).map((row) => [row.employeeId, row.state, row.needStepId]),
    ).toEqual([
      ['a', 'NEED_CONFIRMED', 'step-1'],
      ['b', 'NEED_CONFIRMED', 'step-1'],
      ['c', 'AWAITING_NEED', 'step-2'],
    ]);
  });

  it('keeps the end each person asked for, and none when they gave none', () => {
    const planned = [
      {
        lines: [{ employeeId: 'a', expectedEndDate: '2027-03-31' }, { employeeId: 'b' }],
        step: step('PENDING'),
        confirmedBySending: false,
      },
    ];

    expect(groupLineRowsOf('req-1', planned, ['step-1']).map((row) => row.expectedEndDate)).toEqual([
      '2027-03-31',
      null,
    ]);
  });
});
