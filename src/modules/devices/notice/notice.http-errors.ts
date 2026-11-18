import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { MonitoringNoticeNotPublishedError, MonitoringNoticeReacknowledgementRequiredError } from './notice.errors';

const refuse = (status: HttpStatus, code: string, message: string): ApiException =>
  new ApiException(status, { code, message });

/** Maps the errors of the notice routes to their HTTP answers; a database that cannot answer is a 503. */
export function toNoticeApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof MonitoringNoticeNotPublishedError) {
    return refuse(HttpStatus.NOT_FOUND, 'MONITORING_NOTICE.NOT_PUBLISHED', error.message);
  }
  if (error instanceof MonitoringNoticeReacknowledgementRequiredError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'MONITORING_NOTICE.REACKNOWLEDGEMENT_REQUIRED', error.message);
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toNoticeApiException(error));

export const NOTICE_ERROR_EXAMPLES = {
  NOT_PUBLISHED: example(new MonitoringNoticeNotPublishedError()),
  REACKNOWLEDGEMENT_REQUIRED: example(new MonitoringNoticeReacknowledgementRequiredError()),
} as const;
