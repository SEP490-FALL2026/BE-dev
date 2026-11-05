import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  AiDisabledError,
  AiProviderUnavailableError,
  NoAssignedStepsError,
  SummaryNotFoundError,
  SummarySourceStaleError,
} from './queue-summary.errors';

function refuse(status: HttpStatus, code: string, message: string): ApiException {
  return new ApiException(status, { code, message });
}

/**
 * The one place the refusals of the AI summary of the queue become HTTP answers; anything else reaches the global filter. The wording
 * is the mapper's own, never the message of the error. A call that failed (the AI service down or slow, an answer outside the
 * contract) is not a refusal: it is read as the state of the call.
 */
export function toQueueSummaryApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof AiDisabledError) {
    return refuse(HttpStatus.FORBIDDEN, 'AI.DISABLED', 'The AI summary of the queue is switched off.');
  }
  if (error instanceof NoAssignedStepsError) {
    return refuse(HttpStatus.FORBIDDEN, 'AI.NO_ASSIGNED_STEPS', 'No approval step waits for this person.');
  }
  if (error instanceof SummarySourceStaleError) {
    return refuse(HttpStatus.CONFLICT, 'AI.SOURCE_STALE', 'The queue changed since it was read. Read it again.');
  }
  if (error instanceof SummaryNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'AI.NOT_FOUND', 'There is no such summary.');
  }
  if (error instanceof AiProviderUnavailableError) {
    return refuse(HttpStatus.SERVICE_UNAVAILABLE, 'AI.PROVIDER_UNAVAILABLE', 'No AI service is available.');
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toQueueSummaryApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime. */
export const QUEUE_SUMMARY_ERROR_EXAMPLES = {
  DISABLED: example(new AiDisabledError()),
  NO_ASSIGNED_STEPS: example(new NoAssignedStepsError()),
  SOURCE_STALE: example(new SummarySourceStaleError()),
  NOT_FOUND: example(new SummaryNotFoundError()),
  PROVIDER_UNAVAILABLE: example(new AiProviderUnavailableError()),
} as const;
