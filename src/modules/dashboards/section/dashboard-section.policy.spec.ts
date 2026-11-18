import { DashboardRefusedError } from './dashboard-section.errors';
import { assertHoldsRole, atSource, counted, notAvailable } from './dashboard-section.policy';

describe('dashboard section', () => {
  it('gives a count only to a section that was counted, with the operation that lists it', () => {
    expect(counted(0, 'saasIssueList')).toEqual({
      state: 'COUNTED',
      count: 0,
      sourceOperationId: 'saasIssueList',
      reason: null,
    });
    expect(counted(7, 'meSoftwareRightList').count).toBe(7);
  });

  it.each([-1, 1.5, Number.NaN])('refuses a count of %p', (value) => {
    expect(() => counted(value, 'saasIssueList')).toThrow(RangeError);
  });

  it('names the operation of a section read at its source and gives it no number', () => {
    expect(atSource('spendQueueList')).toEqual({
      state: 'AT_SOURCE',
      count: null,
      sourceOperationId: 'spendQueueList',
      reason: null,
    });
  });

  // US-12-15 AC-3: data with no source yet is never shown as zero.
  it('says why a section has no data and shows neither a number nor an operation', () => {
    expect(notAvailable('FINANCE_FIGURES_NOT_DELIVERED')).toEqual({
      state: 'NOT_AVAILABLE',
      count: null,
      sourceOperationId: null,
      reason: 'FINANCE_FIGURES_NOT_DELIVERED',
    });
  });

  it('lets a caller who holds the role through and refuses one who does not', () => {
    expect(() => assertHoldsRole(['IT_ADMIN'], 'IT_ADMIN')).not.toThrow();
    expect(() => assertHoldsRole(['EMPLOYEE'], 'IT_ADMIN')).toThrow(DashboardRefusedError);
    expect(() => assertHoldsRole([], 'SUPER_ADMIN')).toThrow(DashboardRefusedError);
  });
});
