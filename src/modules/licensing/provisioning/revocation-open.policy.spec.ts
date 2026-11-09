import { RevocationInputError } from '../public/licensing.errors';
import { assertTiming, effectiveTiming, reasonFactsOf, revocationOpenedAudit } from './revocation-open.policy';

const reason = {
  source: 'RETURN',
  decidedByEmployeeId: 'emp-1',
  decidedRole: 'EMPLOYEE',
  referenceKind: 'RETURN_REQUEST' as string | null,
  referenceId: 'ret-1' as string | null,
  note: 'không dùng nữa',
};
const task = { id: 'task-1', status: 'QUEUED', defaultResponsibleEmployeeId: 'it-1' as string | null };

describe('what opening the revocation of a seat says (US-07-05 AC-3, AC-11, AC-12)', () => {
  it('names the first reason that opens a task: nothing before it, and who decided and on what after it, never the note', () => {
    expect(revocationOpenedAudit({ reused: false, task, assignmentId: 'asg-1', reason, selfExecuted: false })).toEqual({
      action: 'PROVISIONING_TASK.REVOCATION_OPENED',
      before: null,
      after: {
        assignmentId: 'asg-1',
        source: 'RETURN',
        decidedByEmployeeId: 'emp-1',
        decidedRole: 'EMPLOYEE',
        referenceKind: 'RETURN_REQUEST',
        referenceId: 'ret-1',
        defaultResponsibleEmployeeId: 'it-1',
        selfExecuted: false,
      },
    });
  });

  it('names a reason that is added beside a task that was already open, with the state the task was in before it', () => {
    const recorded = revocationOpenedAudit({ reused: true, task, assignmentId: 'asg-1', reason, selfExecuted: true });

    expect(recorded.action).toBe('PROVISIONING_TASK.REVOCATION_REASON_ADDED');
    expect(recorded.before).toEqual({ status: 'QUEUED' });
    expect(recorded.after).toMatchObject({ selfExecuted: true, defaultResponsibleEmployeeId: 'it-1' });
    expect(recorded.after).not.toHaveProperty('note');
  });

  it('keeps of a reason what the listeners are told: the source, who decided and in which role, and what it refers to', () => {
    expect(reasonFactsOf(reason)).toEqual({
      source: 'RETURN',
      decidedByEmployeeId: 'emp-1',
      decidedRole: 'EMPLOYEE',
      referenceKind: 'RETURN_REQUEST',
      referenceId: 'ret-1',
    });
  });
});

describe('BR-MF5-04: the timing of a revocation from its reasons', () => {
  const none = { dueOn: null, notBefore: null };

  it('mốc gộp: a reason with a day not before gives it; one with none takes it away; withdrawing that one gives it back', () => {
    const grace = { dueOn: null, notBefore: '2026-11-08' };

    expect(effectiveTiming([grace])).toEqual(grace);
    expect(effectiveTiming([grace, none]).notBefore).toBeNull();
    expect(effectiveTiming([grace])).toEqual(grace);
  });

  it('mốc gộp: the earliest of the days not before, and the only due day given', () => {
    expect(
      effectiveTiming([
        { dueOn: '2026-11-20', notBefore: '2026-11-10' },
        { dueOn: null, notBefore: '2026-11-08' },
      ]),
    ).toEqual({ dueOn: '2026-11-20', notBefore: '2026-11-08' });
  });

  it('has no timing without a reason', () => {
    expect(effectiveTiming([])).toEqual(none);
  });

  it('input sai: a day not before after the due day is a fault of the caller', () => {
    expect(() => assertTiming({ notBefore: '2026-11-09', dueOn: '2026-11-08' })).toThrow(RevocationInputError);
    expect(assertTiming({ notBefore: '2026-11-08', dueOn: '2026-11-08' })).toEqual({
      notBefore: '2026-11-08',
      dueOn: '2026-11-08',
    });
    expect(assertTiming(undefined)).toEqual(none);
  });
});
