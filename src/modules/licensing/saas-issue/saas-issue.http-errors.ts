import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { toLicensingApiException } from '../mappers/licensing.http-errors';
import { SaasIssueError, type SaasIssueProblem } from './saas-issue.errors';

const ANSWERS: Readonly<Record<SaasIssueProblem, { status: HttpStatus; message: string }>> = {
  NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'The SaaS issue does not exist.' },
  ASSIGNMENT_NOT_YOURS: {
    status: HttpStatus.FORBIDDEN,
    message: 'An error can be reported only for a right that is granted to you.',
  },
  ASSIGNMENT_NOT_OPEN: {
    status: HttpStatus.CONFLICT,
    message: 'The right has ended or never took a seat: there is nothing to report on.',
  },
  NO_IT_ADMIN: { status: HttpStatus.CONFLICT, message: 'No IT Admin can take the report now.' },
  INVALID_TRANSITION: {
    status: HttpStatus.CONFLICT,
    message: 'The report cannot move from its state to the one asked for.',
  },
  RESOLUTION_REQUIRED: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The result is required to resolve a report.',
  },
  MESSAGE_REQUIRED: { status: HttpStatus.UNPROCESSABLE_ENTITY, message: 'A message is required.' },
  DUPLICATE_TARGET_INVALID: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The report it duplicates must be another report that is not itself a duplicate.',
  },
  REASON_REQUIRED: { status: HttpStatus.UNPROCESSABLE_ENTITY, message: 'A reason is required.' },
  REOPEN_WINDOW_ENDED: {
    status: HttpStatus.CONFLICT,
    message: 'The time to reopen the report has ended: send a new report.',
  },
  NOT_RESOLVED: { status: HttpStatus.CONFLICT, message: 'Only a resolved report can be reopened.' },
  CLOSED: { status: HttpStatus.CONFLICT, message: 'The report is closed or a duplicate: nothing more is added to it.' },
  OCCURRED_IN_FUTURE: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The moment the error happened cannot be in the future.',
  },
  SCOPE_FORBIDDEN: { status: HttpStatus.FORBIDDEN, message: 'Only an IT Admin lists the reports of other people.' },
  LINKED_WORK_INVALID: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The grant task named does not exist.',
  },
};

/** Maps the refusals of the routes of SaaS issues to their codes (`SAAS_ISSUE.*`); the rest goes to the licensing mapper. */
export function toSaasIssueApiException(error: unknown): unknown {
  if (error instanceof SaasIssueError) {
    const answer = ANSWERS[error.problem];

    return new ApiException(answer.status, {
      code: `SAAS_ISSUE.${error.problem}`,
      message: answer.message,
      ...(error.reason ? { details: { reason: error.reason } } : {}),
    });
  }

  return toLicensingApiException(error);
}

const example = (error: Error) => errorExampleOf(toSaasIssueApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const SAAS_ISSUE_ERROR_EXAMPLES = {
  NOT_FOUND: example(new SaasIssueError('NOT_FOUND')),
  ASSIGNMENT_NOT_YOURS: example(new SaasIssueError('ASSIGNMENT_NOT_YOURS')),
  ASSIGNMENT_NOT_OPEN: example(new SaasIssueError('ASSIGNMENT_NOT_OPEN')),
  NO_IT_ADMIN: example(new SaasIssueError('NO_IT_ADMIN')),
  INVALID_TRANSITION: example(new SaasIssueError('INVALID_TRANSITION')),
  RESOLUTION_REQUIRED: example(new SaasIssueError('RESOLUTION_REQUIRED')),
  MESSAGE_REQUIRED: example(new SaasIssueError('MESSAGE_REQUIRED')),
  DUPLICATE_TARGET_INVALID: example(new SaasIssueError('DUPLICATE_TARGET_INVALID')),
  REASON_REQUIRED: example(new SaasIssueError('REASON_REQUIRED')),
  REOPEN_WINDOW_ENDED: example(new SaasIssueError('REOPEN_WINDOW_ENDED')),
  NOT_RESOLVED: example(new SaasIssueError('NOT_RESOLVED')),
  CLOSED: example(new SaasIssueError('CLOSED')),
  OCCURRED_IN_FUTURE: example(new SaasIssueError('OCCURRED_IN_FUTURE')),
  SCOPE_FORBIDDEN: example(new SaasIssueError('SCOPE_FORBIDDEN')),
  LINKED_WORK_INVALID: example(new SaasIssueError('LINKED_WORK_INVALID', 'GRANT_TASK_NOT_FOUND')),
} as const;
