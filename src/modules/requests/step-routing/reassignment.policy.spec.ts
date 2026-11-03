import {
  alertRecipientsOf,
  configurationHintOf,
  decideReassignment,
  REASSIGNMENT_TRIGGERS,
  requestStateFor,
  touchesHeldStep,
  WAITING_REASON_CODES,
  type OpenStep,
  type ReassignableStepKind,
  type ReassignmentTrigger,
  type ReassignmentTriggerKind,
  type StepTarget,
} from './reassignment.policy';

const OLD = 'employee-old';
const NEW = 'employee-new';
const KINDS: ReassignableStepKind[] = ['NEED', 'SPEND_APPROVAL', 'FINANCE_REVIEW', 'IT_ASSESSMENT'];

const held = (kind: ReassignableStepKind, extra: Partial<OpenStep> = {}): OpenStep => ({
  kind,
  state: 'PENDING',
  holderEmployeeId: OLD,
  holderGone: false,
  waitingReason: null,
  ...extra,
});
const waiting = (
  kind: ReassignableStepKind,
  waitingReason: string = 'NO_SPENDING_APPROVER',
  extra: Partial<OpenStep> = {},
): OpenStep => ({
  kind,
  state: 'WAITING',
  holderEmployeeId: null,
  holderGone: false,
  waitingReason,
  ...extra,
});
const on = (kind: ReassignmentTriggerKind, employeeId: string | null = null): ReassignmentTrigger => ({
  kind,
  employeeId,
});
const goesTo = (assigneeEmployeeId: string, routingRow: number | null = 1): StepTarget => ({
  assigneeEmployeeId,
  routingRow,
});
const nobody: StepTarget = { assigneeEmployeeId: null, reason: 'NO_DEPARTMENT_HEAD' };
/** The triggers the sweep and the listeners raise; the conversion command raises the other one and moves only a step of the old rule. */
const EVERYDAY_TRIGGERS = REASSIGNMENT_TRIGGERS;

describe('which steps an event may touch (FR-3.16, US-05-12)', () => {
  it('is a closed list of events: the four of FR-3.16, the day a change takes effect, the retry of a waiting step, and the conversion', () => {
    expect([...REASSIGNMENT_TRIGGERS].sort()).toEqual(
      [
        'DEPARTMENT_CHANGED',
        'EFFECTIVE_DATE_REACHED',
        'HEAD_CHANGED',
        'HOLDER_LEFT',
        'ROLE_HOLDER_CHANGED',
        'WAITING_RETRY',
      ].sort(),
    );
    // No absence, leave or backlog is an event (US-05-12 AC-5).
    expect(REASSIGNMENT_TRIGGERS.filter((trigger) => /LEAVE|ABSENCE|BACKLOG|OVERDUE/.test(trigger))).toEqual([]);
  });

  it.each([
    ['NEED', 'DEPARTMENT_CHANGED', true],
    ['NEED', 'HEAD_CHANGED', true],
    ['NEED', 'EFFECTIVE_DATE_REACHED', true],
    ['SPEND_APPROVAL', 'DEPARTMENT_CHANGED', false],
    ['SPEND_APPROVAL', 'HEAD_CHANGED', false],
    ['SPEND_APPROVAL', 'EFFECTIVE_DATE_REACHED', false],
    ['FINANCE_REVIEW', 'DEPARTMENT_CHANGED', false],
    ['FINANCE_REVIEW', 'HEAD_CHANGED', false],
    ['IT_ASSESSMENT', 'DEPARTMENT_CHANGED', false],
    ['IT_ASSESSMENT', 'HEAD_CHANGED', false],
  ] as const)('a held %s step on %s: touched = %s', (kind, trigger, touched) => {
    expect(touchesHeldStep(held(kind), on(trigger))).toBe(touched);
  });

  it.each(KINDS)('a held %s step is touched when its holder has left, and only then', (kind) => {
    expect(touchesHeldStep(held(kind, { holderGone: true }), on('HOLDER_LEFT'))).toBe(true);
    expect(touchesHeldStep(held(kind), on('HOLDER_LEFT'))).toBe(false);
  });

  it.each([
    ['NEED', OLD, true],
    ['SPEND_APPROVAL', OLD, true],
    ['FINANCE_REVIEW', OLD, false],
    ['IT_ASSESSMENT', OLD, false],
    ['NEED', 'somebody-else', false],
    ['SPEND_APPROVAL', 'somebody-else', false],
  ] as const)(
    'a held %s step of %s when a role changes hands from the old holder: touched = %s',
    (kind, holder, touched) => {
      expect(touchesHeldStep(held(kind, { holderEmployeeId: holder }), on('ROLE_HOLDER_CHANGED', OLD))).toBe(touched);
    },
  );

  it('never touches a held step on the retry of waiting steps', () => {
    for (const kind of KINDS) expect(touchesHeldStep(held(kind), on('WAITING_RETRY'))).toBe(false);
  });
});

describe('keep, give or wait', () => {
  it('keeps the holder when the table still names them, so the deadline is never reset by a holder who stays', () => {
    expect(decideReassignment(held('NEED'), on('DEPARTMENT_CHANGED'), goesTo(OLD))).toEqual({ action: 'KEEP' });
  });

  it('gives the step to the person the table names now', () => {
    expect(decideReassignment(held('NEED'), on('HEAD_CHANGED'), goesTo(NEW, 1))).toEqual({
      action: 'ASSIGN',
      assigneeEmployeeId: NEW,
      routingRow: 1,
    });
  });

  it('makes the step wait, with the reason, when the table names nobody', () => {
    expect(decideReassignment(held('NEED'), on('DEPARTMENT_CHANGED'), nobody)).toEqual({
      action: 'WAIT',
      reason: 'NO_DEPARTMENT_HEAD',
    });
  });

  it('leaves a held step alone when the event may not touch it, whatever the table says', () => {
    expect(decideReassignment(held('SPEND_APPROVAL'), on('HEAD_CHANGED'), goesTo(NEW))).toEqual({ action: 'KEEP' });
    expect(decideReassignment(held('FINANCE_REVIEW'), on('ROLE_HOLDER_CHANGED', OLD), nobody)).toEqual({
      action: 'KEEP',
    });
  });

  it.each(KINDS)('gives a waiting %s step to a person as soon as the table names one, on any event', (kind) => {
    for (const trigger of EVERYDAY_TRIGGERS) {
      expect(decideReassignment(waiting(kind), on(trigger), goesTo(NEW, null))).toEqual({
        action: 'ASSIGN',
        assigneeEmployeeId: NEW,
        routingRow: null,
      });
    }
  });

  it('leaves a waiting step waiting, for the same reason, while the table names nobody for that reason', () => {
    for (const trigger of EVERYDAY_TRIGGERS) {
      expect(decideReassignment(waiting('NEED', 'NO_DEPARTMENT_HEAD'), on(trigger), nobody)).toEqual({
        action: 'KEEP',
      });
    }
  });

  it('keeps waiting when the table still gives nobody', () => {
    for (const trigger of EVERYDAY_TRIGGERS) {
      expect(decideReassignment(waiting('NEED', 'NO_SPENDING_APPROVER'), on(trigger), nobody)).toEqual({
        action: 'KEEP',
      });
    }
  });

  it('takes a step from a holder who has left, to the one the table names or to a wait', () => {
    const left = held('FINANCE_REVIEW', { holderGone: true });

    expect(decideReassignment(left, on('HOLDER_LEFT'), goesTo(NEW, null))).toEqual({
      action: 'ASSIGN',
      assigneeEmployeeId: NEW,
      routingRow: null,
    });
    expect(
      decideReassignment(left, on('HOLDER_LEFT'), { assigneeEmployeeId: null, reason: 'NO_FINANCE_REVIEWER' }),
    ).toEqual({
      action: 'WAIT',
      reason: 'NO_FINANCE_REVIEWER',
    });
  });
});

describe('what a waiting step needs to be put right (US-05-11)', () => {
  it.each([
    ['NO_SPENDING_APPROVER', 'CONFIGURE_SPENDING_APPROVER'],
    ['NO_DEPARTMENT_HEAD', 'ASSIGN_DEPARTMENT_HEAD'],
    ['SPENDING_APPROVER_IS_PARTY', 'CONFIGURE_SPENDING_APPROVER'],
    // The old reasons are still read, and none asks for a configuration that is gone (QĐ-93c).
    ['NO_FINANCE_REVIEWER', 'GRANT_FINANCE_ROLE'],
    ['NO_IT_ADMIN_IN_CHARGE', 'NAME_IT_ADMIN_IN_CHARGE'],
  ] as const)('%s asks for %s', (reason, hint) => {
    expect(configurationHintOf(reason)).toBe(hint);
  });

  it('has a hint for every reason a step can wait for, and invents none for a reason it does not know', () => {
    for (const reason of WAITING_REASON_CODES) expect(configurationHintOf(reason)).not.toBeNull();
    expect(configurationHintOf('SOMETHING_ELSE')).toBeNull();
  });

  it('never asks for a configuration that is gone: no hint names the fallback approver or the substitute', () => {
    const hints = WAITING_REASON_CODES.map((reason) => configurationHintOf(reason));

    expect(hints).not.toContain('CONFIGURE_FALLBACK_APPROVER');
    expect(hints).not.toContain('CONFIGURE_CONFLICT_SUBSTITUTE');
  });

  it('tells the Super Admin, and nobody else, whatever waits: no IT Admin in charge, no approver of last resort (AC-6, D-S20)', () => {
    // One answer for every kind of step and every reason, so a stretch of waiting is always told to somebody.
    expect(alertRecipientsOf()).toEqual(['SUPER_ADMIN']);
  });

  it.each([
    ['NEED', true, 'PENDING'],
    ['NEED', false, 'WAITING_CONTROLLED'],
    ['FINANCE_REVIEW', true, 'AWAITING_FINANCE_REVIEW'],
    ['FINANCE_REVIEW', false, 'WAITING_CONTROLLED'],
    ['SPEND_APPROVAL', true, 'AWAITING_SPEND_DECISION'],
    ['SPEND_APPROVAL', false, 'WAITING_CONTROLLED'],
    ['IT_ASSESSMENT', true, null],
    ['IT_ASSESSMENT', false, null],
  ] as const)('the %s step, held = %s, puts the request in %s', (kind, isHeld, state) => {
    expect(requestStateFor(kind, isHeld)).toBe(state);
  });
});
