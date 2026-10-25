import { checkNeedDecision, deciderRoleOf, nextRequestState, type DecisionFacts } from './need-decision.policy';

const facts = (patch: Partial<DecisionFacts> = {}): DecisionFacts => ({
  actorEmployeeId: 'head',
  requesterEmployeeId: 'sender',
  beneficiaryEmployeeIds: ['sender'],
  assigneeEmployeeId: 'head',
  stepState: 'PENDING',
  termMonths: 6,
  ...patch,
});
const approve = { decision: 'APPROVE' as const };

describe('who may decide the need step, and when (US-05-04)', () => {
  it('lets the person who holds a pending step decide it', () => {
    expect(checkNeedDecision(facts(), approve)).toBeNull();
    expect(checkNeedDecision(facts(), { decision: 'REJECT', reason: 'No need' })).toBeNull();
  });

  it('refuses the person who asked or the person it is for, even when they hold the step (SoD-4, AC-8)', () => {
    expect(checkNeedDecision(facts({ actorEmployeeId: 'sender', assigneeEmployeeId: 'sender' }), approve)).toBe(
      'OWN_REQUEST',
    );
    expect(
      checkNeedDecision(
        facts({ actorEmployeeId: 'for', beneficiaryEmployeeIds: ['for'], assigneeEmployeeId: 'for' }),
        approve,
      ),
    ).toBe('OWN_REQUEST');
  });

  it('refuses anybody who does not hold the step (AC-4)', () => {
    expect(checkNeedDecision(facts({ actorEmployeeId: 'other-head' }), approve)).toBe('NOT_THE_ASSIGNEE');
    expect(checkNeedDecision(facts({ assigneeEmployeeId: null }), approve)).toBe('NOT_THE_ASSIGNEE');
  });

  it.each(['WAITING', 'APPROVED', 'REJECTED'] as const)(
    'refuses a step that is %s: only a pending step is decided',
    (stepState) => {
      expect(checkNeedDecision(facts({ stepState }), approve)).toBe('STEP_NOT_PENDING');
    },
  );

  describe('a term of more than twelve months (AC-6, OI-07a)', () => {
    it('needs an explicit confirmation to be approved', () => {
      expect(checkNeedDecision(facts({ termMonths: 13 }), approve)).toBe('TERM_CONFIRMATION_REQUIRED');
      expect(checkNeedDecision(facts({ termMonths: 18 }), { ...approve, termConfirmationReason: '  ' })).toBe(
        'TERM_CONFIRMATION_REQUIRED',
      );
    });

    it('is approved with a confirmation, and twelve months or less needs none', () => {
      expect(
        checkNeedDecision(facts({ termMonths: 18 }), { ...approve, termConfirmationReason: 'Project runs 18 months' }),
      ).toBeNull();
      expect(checkNeedDecision(facts({ termMonths: 12 }), approve)).toBeNull();
    });

    it('does not stand in the way of a refusal', () => {
      expect(checkNeedDecision(facts({ termMonths: 36 }), { decision: 'REJECT', reason: 'No' })).toBeNull();
    });
  });
});

describe('what a decision leads to', () => {
  it('sends internal software on to the IT Admin and paid software on to be sent as spend (AC-1, AC-6)', () => {
    expect(nextRequestState('INTERNAL_FREE')).toBe('AWAITING_EXECUTION');
    expect(nextRequestState('PAID_IN_CATALOG')).toBe('AWAITING_SPEND_SUBMISSION');
  });

  it('names the role a person decided in from the row of the routing table that gave them the step', () => {
    expect([1, 2, 3, 4].map(deciderRoleOf)).toEqual([
      'MANAGER',
      'SPENDING_APPROVER',
      'FALLBACK_APPROVER',
      'FALLBACK_APPROVER',
    ]);
  });

  it('names the head the role of the manager in the rows of a request for a group: sent by the head (5) and sent by an Employee (9)', () => {
    expect([5, 9].map(deciderRoleOf)).toEqual(['MANAGER', 'MANAGER']);
  });

  it('has no role for a row that gives the step to nobody', () => {
    expect(() => deciderRoleOf(8)).toThrow();
  });
});
