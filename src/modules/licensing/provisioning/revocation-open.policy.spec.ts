import { reasonFactsOf, revocationOpenedAudit } from './revocation-open.policy';

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
