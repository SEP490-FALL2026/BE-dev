import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { NotificationNotFoundError } from './inbox.errors';

/** Maps the errors of the inbox routes to their HTTP answers; a database that cannot answer is a 503. */
export function toInboxApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof NotificationNotFoundError) {
    return new ApiException(HttpStatus.NOT_FOUND, { code: 'NOTIFICATION.NOT_FOUND', message: error.message });
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toInboxApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime. */
export const INBOX_ERROR_EXAMPLES = {
  NOT_FOUND: example(new NotificationNotFoundError()),
} as const;
