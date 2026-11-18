import { isEnded, withdrawalOutcome } from './revocation-withdrawal.policy';

describe('US-07-05 AC-22: what taking a reason back does to the task', () => {
  const base = { remaining: 0, claimedBy: null, cancelInProgressClaimedBy: undefined };

  it('goes on while another reason stands, whatever the state', () => {
    for (const status of ['QUEUED', 'RETRY_SCHEDULED', 'IN_PROGRESS', 'FAILED'] as const) {
      expect(withdrawalOutcome({ ...base, status, remaining: 1 })).toBe('CONTINUES');
    }
  });

  it('cancels the task that waits or failed when no reason is left', () => {
    for (const status of ['QUEUED', 'RETRY_SCHEDULED', 'FAILED'] as const) {
      expect(withdrawalOutcome({ ...base, status })).toBe('CANCELLED');
    }
  });

  it('cancels a task in progress only for the IT Admin who took it', () => {
    const working = { ...base, status: 'IN_PROGRESS' as const, claimedBy: 'it-1' };

    expect(withdrawalOutcome({ ...working, cancelInProgressClaimedBy: 'it-1' })).toBe('CANCELLED');
    expect(withdrawalOutcome({ ...working, cancelInProgressClaimedBy: 'it-2' })).toBe('IT_ADMIN_TO_CLOSE');
    expect(withdrawalOutcome(working)).toBe('IT_ADMIN_TO_CLOSE');
  });

  it('knows which tasks are ended', () => {
    expect(isEnded('COMPLETED') && isEnded('CLOSED_FAILED') && isEnded('CANCELLED')).toBe(true);
    expect(isEnded('QUEUED') || isEnded('IN_PROGRESS') || isEnded('FAILED')).toBe(false);
  });
});
