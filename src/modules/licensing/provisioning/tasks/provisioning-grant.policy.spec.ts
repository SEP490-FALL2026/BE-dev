import { claimMatchesAnswer, grantTaskAudit, grantWarnings } from './provisioning-grant.policy';

describe('what the grant of the seat of a request is judged and recorded by (US-07-01, QĐ-89a, SoD-5)', () => {
  const answer = { employeeId: 'emp-1', planId: 'plan-1', seat: 'PERSONAL' as const };

  it('goes on only when the request claimed is for the person, the plan and the kind of seat that were read before', () => {
    expect(claimMatchesAnswer({ ...answer }, answer)).toBe(true);
    expect(claimMatchesAnswer({ ...answer, employeeId: 'emp-2' }, answer)).toBe(false);
    expect(claimMatchesAnswer({ ...answer, planId: 'plan-2' }, answer)).toBe(false);
    expect(claimMatchesAnswer({ ...answer, seat: 'SERVICE' }, answer)).toBe(false);
  });

  it('says in the audit entry which request the task is for, which seat, the channel and who is in charge by default', () => {
    expect(grantTaskAudit('req-1', 'asg-1', { channel: 'MANUAL', defaultResponsibleEmployeeId: 'it-1' }, null)).toEqual(
      {
        requestId: 'req-1',
        assignmentId: 'asg-1',
        channel: 'MANUAL',
        defaultResponsibleEmployeeId: 'it-1',
      },
    );
  });

  it('adds whether the IT Admin answered for the account themselves only when a person answers for it', () => {
    const task = { channel: 'MANUAL', defaultResponsibleEmployeeId: null };

    expect(grantTaskAudit('req-1', 'asg-1', task, true)).toMatchObject({ selfExecuted: true });
    expect(grantTaskAudit('req-1', 'asg-1', task, false)).toMatchObject({ selfExecuted: false });
  });

  it('warns that the department has no IT Admin when the person in charge by default is nobody', () => {
    expect(grantWarnings({ itAdminEmployeeId: null })).toEqual(['DEPARTMENT_WITHOUT_IT_ADMIN']);
    expect(grantWarnings({ itAdminEmployeeId: 'it-1' })).toEqual([]);
    expect(grantWarnings(null)).toEqual([]);
  });
});
