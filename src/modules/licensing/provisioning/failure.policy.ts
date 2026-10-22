import { ProvisioningTaskAlreadyManualError, ProvisioningTaskStateError } from '../licensing.errors';
import type {
  ProvisioningChannel,
  ProvisioningDecision,
  ProvisioningFailureKind,
  ProvisioningTaskStatus,
} from '../licensing.types';

const FIRST_DELAY_MINUTES = 5;
const LONGEST_DELAY_MINUTES = 240;

/** The wait before the retry that follows the `attempt`-th failure: 5 minutes, doubling each time, never over 4 hours. */
export function retryDelayMinutes(attempt: number): number {
  return Math.min(FIRST_DELAY_MINUTES * 2 ** Math.max(0, attempt - 1), LONGEST_DELAY_MINUTES);
}

/** The tries a task gets: the first one and the retries that were allowed (`PROVISIONING_RETRY_COUNT`). */
export function maxAttempts(retryCount: number): number {
  return retryCount + 1;
}

export type FailureOutcome =
  { status: 'RETRY_SCHEDULED'; delayMinutes: number } | { status: 'FAILED'; retriesExhausted: boolean };

/**
 * What a failure leads to (`F-12`, `US-07-04` AC-1→AC-4, AC-7). `attempts` counts the tries made, this failed one
 * included. A temporary failure is tried again after a longer wait each time while retries are left; when the last try
 * fails too it is handled as a permanent one. Every other kind goes to the failure queue at once, to be decided by a
 * person: nothing here retries, hands off or closes it.
 */
export function classifyFailure(input: {
  kind: ProvisioningFailureKind;
  attempts: number;
  retryCount: number;
}): FailureOutcome {
  if (input.kind !== 'TRANSIENT') return { status: 'FAILED', retriesExhausted: false };
  if (input.attempts <= input.retryCount) {
    return { status: 'RETRY_SCHEDULED', delayMinutes: retryDelayMinutes(input.attempts) };
  }

  return { status: 'FAILED', retriesExhausted: true };
}

/** What the IT Admin may decide: only a failed task has decisions, and only a connector task can be handed to a person. */
export function availableDecisions(
  status: ProvisioningTaskStatus,
  channel: ProvisioningChannel,
): ProvisioningDecision[] {
  if (status !== 'FAILED') return [];

  return channel === 'CONNECTOR' ? ['RETRY', 'HAND_OFF', 'CLOSE_FAILED'] : ['RETRY', 'CLOSE_FAILED'];
}

/** A decision is made on a failed task and on nothing else. Throws ProvisioningTaskStateError. */
export function assertDecidable(status: ProvisioningTaskStatus): void {
  if (status !== 'FAILED') throw new ProvisioningTaskStateError('NOT_FAILED');
}

/** A task that is by hand already has nothing to hand off. Throws ProvisioningTaskAlreadyManualError. */
export function assertHandOffAllowed(channel: ProvisioningChannel): void {
  if (channel === 'MANUAL') throw new ProvisioningTaskAlreadyManualError();
}
