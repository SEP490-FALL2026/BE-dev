import { ProvisioningTaskAlreadyManualError, ProvisioningTaskStateError } from '../licensing.errors';
import {
  assertDecidable,
  assertHandOffAllowed,
  availableDecisions,
  classifyFailure,
  maxAttempts,
  retryDelayMinutes,
} from './failure.policy';
import { nextStatus } from './provisioning.policy';

describe('the pace of retries (US-07-04 AC-1)', () => {
  it('waits longer after each failure, from five minutes, and never more than four hours', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(retryDelayMinutes)).toEqual([5, 10, 20, 40, 80, 160, 240, 240]);
  });

  it('is one try and the retries that were allowed', () => {
    expect(maxAttempts(3)).toBe(4);
    expect(maxAttempts(0)).toBe(1);
  });
});

describe('what a failure of each kind leads to (F-12, US-07-04 AC-1→AC-4, AC-7)', () => {
  it('schedules a retry of a temporary failure while retries are left, with a longer wait each time', () => {
    expect(classifyFailure({ kind: 'TRANSIENT', attempts: 1, retryCount: 3 })).toEqual({
      status: 'RETRY_SCHEDULED',
      delayMinutes: 5,
    });
    expect(classifyFailure({ kind: 'TRANSIENT', attempts: 3, retryCount: 3 })).toEqual({
      status: 'RETRY_SCHEDULED',
      delayMinutes: 20,
    });
  });

  it('treats a temporary failure as a permanent one when the last try also failed', () => {
    expect(classifyFailure({ kind: 'TRANSIENT', attempts: 4, retryCount: 3 })).toEqual({
      status: 'FAILED',
      retriesExhausted: true,
    });
    expect(classifyFailure({ kind: 'TRANSIENT', attempts: 1, retryCount: 0 })).toEqual({
      status: 'FAILED',
      retriesExhausted: true,
    });
  });

  it.each(['PERMANENT', 'AUTHENTICATION', 'QUOTA_EXCEEDED', 'NOT_DONE'] as const)(
    'never retries a %s failure by itself',
    (kind) => {
      expect(classifyFailure({ kind, attempts: 1, retryCount: 10 })).toEqual({
        status: 'FAILED',
        retriesExhausted: false,
      });
    },
  );
});

describe('what the IT Admin may decide (US-07-04 AC-8→AC-10, AC-14)', () => {
  it('offers retry and closing for a failed manual task, and also the hand-off for a connector task', () => {
    expect(availableDecisions('FAILED', 'MANUAL')).toEqual(['RETRY', 'CLOSE_FAILED']);
    expect(availableDecisions('FAILED', 'CONNECTOR')).toEqual(['RETRY', 'HAND_OFF', 'CLOSE_FAILED']);
  });

  it.each(['QUEUED', 'RETRY_SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED_FAILED'] as const)(
    'offers nothing for a task that is %s',
    (status) => {
      expect(availableDecisions(status, 'CONNECTOR')).toEqual([]);
    },
  );

  it('decides only on a failed task', () => {
    expect(() => assertDecidable('FAILED')).not.toThrow();
    for (const status of ['QUEUED', 'RETRY_SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED_FAILED'] as const) {
      expect(() => assertDecidable(status)).toThrow(new ProvisioningTaskStateError('NOT_FAILED'));
    }
  });

  it('hands off only what is not by hand already', () => {
    expect(() => assertHandOffAllowed('CONNECTOR')).not.toThrow();
    expect(() => assertHandOffAllowed('MANUAL')).toThrow(ProvisioningTaskAlreadyManualError);
  });
});

describe('the work of a person on a task in the new states (US-07-04, US-07-02)', () => {
  it.each(['RETRY_SCHEDULED', 'CLOSED_FAILED'] as const)('is refused on a %s task', (status) => {
    expect(() => nextStatus(status, 'CLAIM', 'MANUAL')).toThrow(new ProvisioningTaskStateError('NOT_CLAIMABLE'));
    expect(() => nextStatus(status, 'COMPLETE', 'MANUAL')).toThrow(new ProvisioningTaskStateError('NOT_IN_PROGRESS'));
    expect(() => nextStatus(status, 'FAIL', 'MANUAL')).toThrow(new ProvisioningTaskStateError('NOT_IN_PROGRESS'));
  });
});
