import { alertRecipients, dueMilestone, finalAlertSkipped } from './renewal-alerts.policy';

describe('the milestone due (FR-1.4, US-11-01 AC-1, AC-2, AC-7)', () => {
  const deadline = '2026-12-01';

  it('counts back from the deadline, the last milestone until the deadline itself', () => {
    expect(dueMilestone(deadline, '2026-11-15', [15, 7])).toBeNull();
    expect(dueMilestone(deadline, '2026-11-16', [15, 7])).toEqual({ days: 15, final: false, alertDate: '2026-11-16' });
    expect(dueMilestone(deadline, '2026-11-23', [15, 7])).toEqual({ days: 15, final: false, alertDate: '2026-11-16' });
    expect(dueMilestone(deadline, '2026-11-24', [15, 7])).toEqual({ days: 7, final: true, alertDate: '2026-11-24' });
    expect(dueMilestone(deadline, '2026-12-01', [15, 7])).toEqual({ days: 7, final: true, alertDate: '2026-11-24' });
  });

  it('sends nothing after the deadline: never counted from the renewal date (AC-2)', () => {
    expect(dueMilestone(deadline, '2026-12-02', [15, 7])).toBeNull();
    expect(dueMilestone(deadline, '2026-12-24', [15, 7])).toBeNull();
  });

  it('follows the parameter, whatever its order (AC-7)', () => {
    expect(dueMilestone(deadline, '2026-11-01', [10, 30])).toEqual({ days: 30, final: false, alertDate: '2026-11-01' });
    expect(dueMilestone(deadline, '2026-11-21', [10, 30])).toEqual({ days: 10, final: true, alertDate: '2026-11-21' });
    expect(dueMilestone(deadline, '2026-11-10', [])).toBeNull();
  });
});

describe('the last milestone left out (QĐ-62t, US-11-01 AC-8)', () => {
  it('only when the decision and its outcome are both recorded', () => {
    expect(finalAlertSkipped({ decided: true, outcomeRecorded: true })).toBe(true);
    expect(finalAlertSkipped({ decided: true, outcomeRecorded: false })).toBe(false);
    expect(finalAlertSkipped({ decided: false, outcomeRecorded: false })).toBe(false);
  });
});

describe('the people told (US-11-01 AC-1, AC-10, AC-11, QĐ-111g: no Business Owner)', () => {
  const people = { itAdmin: 'IT1', finance: 'F1', approver: 'C1', superAdmin: 'S1' };

  it('tells the IT Admin, Finance and the spending approver, and the Super Admin only at the last milestone', () => {
    expect(alertRecipients(people, false).map((r) => r.audience)).toEqual(['IT_ADMIN', 'FINANCE', 'SPENDING_APPROVER']);
    expect(alertRecipients(people, true).map((r) => r.employeeId)).toEqual(['IT1', 'F1', 'C1', 'S1']);
  });

  it('leaves out a role nobody holds and tells a person who holds two roles once', () => {
    expect(alertRecipients({ ...people, finance: null }, false).map((r) => r.employeeId)).toEqual(['IT1', 'C1']);
    expect(alertRecipients({ ...people, approver: 'IT1' }, false).map((r) => r.employeeId)).toEqual(['IT1', 'F1']);
  });
});
