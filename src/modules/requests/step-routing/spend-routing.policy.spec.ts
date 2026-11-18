import { routeSpendStep } from './spend-routing.policy';

const people = { requesterEmployeeId: 'h1', beneficiaryEmployeeIds: ['e1', 'e2'] };

describe('who holds the spend step (US-06-01, US-05-11 AC-10, D-S21)', () => {
  it('is the spending approver', () => {
    expect(routeSpendStep(people, 'c1')).toEqual({ outcome: 'ASSIGNED', assigneeEmployeeId: 'c1' });
  });

  it('waits when nobody holds the role, and never goes to someone else', () => {
    expect(routeSpendStep(people, null)).toEqual({ outcome: 'WAITING', reason: 'NO_SPENDING_APPROVER' });
  });

  it('waits for the spending approver and never assigns a substitute', () => {
    const waiting = { outcome: 'WAITING', reason: 'SPENDING_APPROVER_IS_PARTY' };

    // Only the data of before the rule gets here: a request cannot be sent by or for the spending approver any more.
    expect(routeSpendStep(people, 'e2')).toEqual(waiting);
    expect(routeSpendStep(people, 'h1')).toEqual(waiting);
    expect(routeSpendStep(people, 'e1')).not.toHaveProperty('substituted');
  });
});
