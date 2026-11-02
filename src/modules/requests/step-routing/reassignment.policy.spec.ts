import {
  alertRecipientsOf,
  configurationHintOf,
  decideReassignment,
  isLegacyStep,
  REASSIGNMENT_TRIGGERS,
  requestStateFor,
  touchesHeldStep,
  WAITING_REASON_CODES,
  type LegacyCandidate,
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
  legacy: false,
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
  legacy: false,
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
const EVERYDAY_TRIGGERS = REASSIGNMENT_TRIGGERS.filter((trigger) => trigger !== 'QD93_CONVERSION');

describe('which steps an event may touch (FR-3.16, US-05-12)', () => {
  it('is a closed list of events: the four of FR-3.16, the day a change takes effect, the retry of a waiting step, and the conversion', () => {
    expect([...REASSIGNMENT_TRIGGERS].sort()).toEqual(
      [
        'DEPARTMENT_CHANGED',
        'EFFECTIVE_DATE_REACHED',
        'HEAD_CHANGED',
        'HOLDER_LEFT',
        'QD93_CONVERSION',
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

  it('touches a step on the conversion only when it is a step of the old rule', () => {
    for (const kind of KINDS) {
      expect(touchesHeldStep(held(kind, { legacy: true }), on('QD93_CONVERSION'))).toBe(true);
      expect(touchesHeldStep(held(kind), on('QD93_CONVERSION'))).toBe(false);
    }
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

  it('rewaits with the new reason and keeps the stretch', () => {
    // The step waits for another reason than the table gives now: only the reason is written, the stretch (and so the deadline)
    // goes on — the decision carries no holder, no row and no time.
    for (const trigger of EVERYDAY_TRIGGERS) {
      expect(decideReassignment(waiting('NEED', 'NO_SPENDING_APPROVER'), on(trigger), nobody)).toEqual({
        action: 'REWAIT',
        reason: 'NO_DEPARTMENT_HEAD',
      });
    }
    expect(
      decideReassignment(waiting('NEED', 'NO_FALLBACK_APPROVER', { legacy: true }), on('QD93_CONVERSION'), nobody),
    ).toEqual({ action: 'REWAIT', reason: 'NO_DEPARTMENT_HEAD' });
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

describe('a step of the old rule stays still until the conversion (QĐ-93k(2))', () => {
  const frozen = (kind: ReassignableStepKind, extra: Partial<OpenStep> = {}): OpenStep =>
    held(kind, { legacy: true, ...extra });
  const frozenWaiting = (reason: string): OpenStep => waiting('NEED', reason, { legacy: true });

  it('keeps a legacy step frozen for every trigger but the conversion', () => {
    for (const trigger of EVERYDAY_TRIGGERS) {
      for (const target of [goesTo(NEW), goesTo(OLD), nobody]) {
        expect(decideReassignment(frozen('NEED', { holderGone: true }), on(trigger, OLD), target)).toEqual({
          action: 'KEEP',
        });
        expect(decideReassignment(frozenWaiting('NO_FALLBACK_APPROVER'), on(trigger), target)).toEqual({
          action: 'KEEP',
        });
        expect(decideReassignment(frozen('SPEND_APPROVAL'), on(trigger, OLD), target)).toEqual({ action: 'KEEP' });
      }
    }
  });

  it('moves a step that is not of the old rule on no conversion: the conversion leaves the rest as it is', () => {
    expect(decideReassignment(held('NEED'), on('QD93_CONVERSION'), goesTo(NEW))).toEqual({ action: 'KEEP' });
    expect(decideReassignment(waiting('NEED'), on('QD93_CONVERSION'), goesTo(NEW))).toEqual({ action: 'KEEP' });
  });

  it('gives a legacy step the person the table names, or makes it wait, on the conversion', () => {
    expect(decideReassignment(frozen('NEED'), on('QD93_CONVERSION'), goesTo(NEW, 1))).toEqual({
      action: 'ASSIGN',
      assigneeEmployeeId: NEW,
      routingRow: 1,
    });
    expect(decideReassignment(frozen('NEED'), on('QD93_CONVERSION'), nobody)).toEqual({
      action: 'WAIT',
      reason: 'NO_DEPARTMENT_HEAD',
    });
    expect(decideReassignment(frozenWaiting('NO_FALLBACK_APPROVER'), on('QD93_CONVERSION'), goesTo(NEW, 1))).toEqual({
      action: 'ASSIGN',
      assigneeEmployeeId: NEW,
      routingRow: 1,
    });
  });

  it('reassigns a legacy step to its own holder to rewrite the row', () => {
    // The approver of last resort is now the head: the table still names them, and the row of the step is written again as 1.
    expect(decideReassignment(frozen('NEED'), on('QD93_CONVERSION'), goesTo(OLD, 1))).toEqual({
      action: 'ASSIGN',
      assigneeEmployeeId: OLD,
      routingRow: 1,
    });
    // A step that is not of the old rule stays with a holder the table still names.
    expect(decideReassignment(held('NEED'), on('DEPARTMENT_CHANGED'), goesTo(OLD, 1))).toEqual({ action: 'KEEP' });
  });
});

describe('which steps are of the old rule (QĐ-93k(2), the rule of the old spend step)', () => {
  const step = (over: Partial<LegacyCandidate>): LegacyCandidate => ({
    kind: 'NEED',
    state: 'PENDING',
    routingRow: 1,
    assigneeEmployeeId: OLD,
    waitingReason: null,
    ...over,
  });
  const waitingStep = (waitingReason: string, over: Partial<LegacyCandidate> = {}): LegacyCandidate =>
    step({ state: 'WAITING', assigneeEmployeeId: null, waitingReason, ...over });
  const nobodyEverHeld = new Set<string>();

  it('calls a need step legacy when it is pending on row 3 or 4, and not on any other row', () => {
    for (const routingRow of [3, 4]) expect(isLegacyStep(step({ routingRow }), nobodyEverHeld)).toBe(true);
    for (const routingRow of [1, 2, 5, 9]) expect(isLegacyStep(step({ routingRow }), nobodyEverHeld)).toBe(false);
  });

  it('calls a waiting step legacy when its reason is one of the old rule, and not for the reasons of today', () => {
    for (const reason of [
      'NO_FALLBACK_APPROVER',
      'FALLBACK_IS_REQUESTER',
      'NO_CONFLICT_SUBSTITUTE',
      'SPENDING_APPROVER_IS_PARTY',
    ]) {
      expect(isLegacyStep(waitingStep(reason), nobodyEverHeld)).toBe(true);
    }
    for (const reason of [
      'NO_DEPARTMENT_HEAD',
      'NO_SPENDING_APPROVER',
      'NO_FINANCE_REVIEWER',
      'NO_IT_ADMIN_IN_CHARGE',
    ]) {
      expect(isLegacyStep(waitingStep(reason), nobodyEverHeld)).toBe(false);
    }
    // A need step that waits on row 4 for a head is not of the old rule: row 4 is the row of a wait now.
    expect(isLegacyStep(waitingStep('NO_DEPARTMENT_HEAD', { routingRow: 4 }), nobodyEverHeld)).toBe(false);
  });

  it('calls a spend step legacy only when its holder never held SPENDING_APPROVER', () => {
    const spend = step({ kind: 'SPEND_APPROVAL', assigneeEmployeeId: 'substitute' });

    expect(isLegacyStep(spend, new Set(['somebody-else']))).toBe(true);
    expect(isLegacyStep(spend, new Set(['substitute']))).toBe(false);
  });

  it('never calls a spend step of a former or current grant holder legacy', () => {
    // The set is the people who have a `role_grants` row of SPENDING_APPROVER, revoked or not: revoking or transferring the role
    // changes who holds it now and never who held it once.
    const everHeld = new Set([OLD]);

    expect(isLegacyStep(step({ kind: 'SPEND_APPROVAL', assigneeEmployeeId: OLD }), everHeld)).toBe(false);
    // Whatever the row of a spend step says: the rule is the holder.
    expect(isLegacyStep(step({ kind: 'SPEND_APPROVAL', routingRow: 4, assigneeEmployeeId: OLD }), everHeld)).toBe(
      false,
    );
  });

  it('does not call the review of Finance or the assessment of the IT Admin legacy', () => {
    for (const kind of ['FINANCE_REVIEW', 'IT_ASSESSMENT'] as const) {
      expect(isLegacyStep(step({ kind, routingRow: 3 }), nobodyEverHeld)).toBe(false);
    }
  });
});

describe('what a waiting step needs to be put right (US-05-11)', () => {
  it.each([
    ['NO_SPENDING_APPROVER', 'CONFIGURE_SPENDING_APPROVER'],
    ['NO_DEPARTMENT_HEAD', 'ASSIGN_DEPARTMENT_HEAD'],
    ['SPENDING_APPROVER_IS_PARTY', 'CONFIGURE_SPENDING_APPROVER'],
    // The old reasons are still read, and none asks for a configuration that is gone (QĐ-93c).
    ['NO_FALLBACK_APPROVER', 'ASSIGN_DEPARTMENT_HEAD'],
    ['FALLBACK_IS_REQUESTER', 'ASSIGN_DEPARTMENT_HEAD'],
    ['NO_CONFLICT_SUBSTITUTE', 'CONFIGURE_SPENDING_APPROVER'],
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
