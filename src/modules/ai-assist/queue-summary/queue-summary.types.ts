import type { StepKind } from '../ai-service/ai-service.types';
import type { InvocationStatus } from '../invocation/invocation.types';

/** The feature this capability records its calls under. */
export const QUEUE_SUMMARY_FEATURE = 'ACCESS_REQUEST_QUEUE_SUMMARY' as const;

/** A run still live after this long is taken for stuck and recorded FAILED when a request of its owner touches it. */
export const RUN_STUCK_AFTER_MS = 150_000;

/**
 * The stable codes a summary that shows nothing carries in `errorCode`. They are states of a call, read by `GET`, never an HTTP
 * error: the person sees "no summary" and the queue they read by hand is unchanged (AC-6).
 */
export const SUMMARY_ERROR_CODES = {
  /** The AI service could not be reached, refused the call or stopped. */
  PROVIDER_UNAVAILABLE: 'AI.PROVIDER_UNAVAILABLE',
  /** The AI service did not answer in time, or the run was taken for stuck. */
  PROVIDER_TIMEOUT: 'AI.PROVIDER_TIMEOUT',
  /** The AI service answered outside the contract, or the model's output could not be parsed. */
  OUTPUT_INVALID: 'AI.OUTPUT_INVALID',
  /** Every line was rejected by the checks, or none is the person's any more. */
  NO_VALID_OUTPUT: 'AI.NO_VALID_OUTPUT',
  /** A step of the person points at a record that is missing: the context could not be composed. */
  SOURCE_UNREADABLE: 'AI.SOURCE_UNREADABLE',
  /** The run failed in a way nobody expected; the operator log names the kind of error. */
  INTERNAL_ERROR: 'AI.INTERNAL_ERROR',
} as const;
export type SummaryErrorCode = (typeof SUMMARY_ERROR_CODES)[keyof typeof SUMMARY_ERROR_CODES];

export type QueueSummaryStatus = InvocationStatus;

/** One checked line of a summary: the step it is about and the request it leads to. */
export interface QueueSummaryItem {
  requestId: string;
  stepId: string;
  stepKind: StepKind;
  summary: string;
}

/**
 * A summary as its owner reads it. `items` are the checked lines whose step still waits for them, in the order of the queue;
 * `omittedCount` is how many steps still theirs a shown summary leaves out (past the first 20, or whose line did not pass);
 * `sourceStale` says the queue changed since the summary was composed.
 */
export interface QueueSummaryView {
  invocationId: string;
  status: QueueSummaryStatus;
  createdAt: string;
  sourceStale: boolean;
  /** True for a call the simulation answered (`provider_mode` SIMULATED), whatever its state: the label "not AI" is always shown. */
  simulated: boolean;
  omittedCount: number;
  items: QueueSummaryItem[];
  errorCode: string | null;
}

/**
 * The queue of a person as a summary would read it now, without asking the AI service: the revision to ask a summary with, the
 * steps it would cover (at most 20) and how many steps still theirs it would leave out.
 */
export interface QueueSummarySource {
  queueRevision: string;
  stepCount: number;
  omittedCount: number;
}
