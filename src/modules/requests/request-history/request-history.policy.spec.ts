import { awaitsHead, isFlagList, oversightScopeOf, parseFlagList } from './request-history.policy';

describe('what the roles of a caller of the history of the organization reach (SoD-3, SoD-7)', () => {
  it('gives the IT Admin every request', () => {
    expect(oversightScopeOf(['IT_ADMIN'])).toEqual({
      kind: 'OVERSIGHT',
      all: true,
      spendStepOpened: false,
      spendApproved: false,
    });
  });

  it('gives the spending approver the requests a spend step was opened on, and Finance those whose spend was approved', () => {
    expect(oversightScopeOf(['SPENDING_APPROVER'])).toMatchObject({
      all: false,
      spendStepOpened: true,
      spendApproved: false,
    });
    expect(oversightScopeOf(['FINANCE'])).toMatchObject({ all: false, spendStepOpened: false, spendApproved: true });
  });

  it('gives a caller with both money roles the union', () => {
    expect(oversightScopeOf(['FINANCE', 'SPENDING_APPROVER'])).toMatchObject({
      spendStepOpened: true,
      spendApproved: true,
    });
  });

  it.each([[['SUPER_ADMIN']], [['MANAGER']], [['EMPLOYEE']]])('gives %j nothing at all', (roles) => {
    expect(oversightScopeOf(roles)).toEqual({
      kind: 'OVERSIGHT',
      all: false,
      spendStepOpened: false,
      spendApproved: false,
    });
  });
});

describe('the flags a history is narrowed by', () => {
  it('reads one or both flags, comma-separated', () => {
    expect(parseFlagList('ONE_STEP')).toEqual(['ONE_STEP']);
    expect(parseFlagList('ONE_STEP,RESERVE_USED')).toEqual(['ONE_STEP', 'RESERVE_USED']);
  });

  it.each(['ONE_STEP,ONE_STEP', 'OTHER', '', 'ONE_STEP,', 'MANY_PAID_SOFTWARE'])('refuses %j', (value) => {
    expect(parseFlagList(value)).toBeNull();
    expect(isFlagList(value)).toBe(false);
  });
});

describe('whether a request of the department waits for its head now', () => {
  const row = (state: string, step: string, assignee: string | null) => ({
    state,
    needStep: { state: step, assigneeEmployeeId: assignee },
  });

  it('waits for the head who holds its need step, and in the queue of the head to be sent on', () => {
    expect(awaitsHead(row('PENDING', 'PENDING', 'head'), 'head')).toBe(true);
    expect(awaitsHead(row('AWAITING_SPEND_SUBMISSION', 'APPROVED', 'head'), 'head')).toBe(true);
  });

  it('does not wait for the head once decided, or while another person holds the step', () => {
    expect(awaitsHead(row('COMPLETED', 'APPROVED', 'head'), 'head')).toBe(false);
    expect(awaitsHead(row('PENDING', 'PENDING', 'someone-else'), 'head')).toBe(false);
    expect(awaitsHead(row('AWAITING_SPEND_DECISION', 'APPROVED', 'head'), 'head')).toBe(false);
  });
});
