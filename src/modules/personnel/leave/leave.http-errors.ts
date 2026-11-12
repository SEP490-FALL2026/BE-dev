import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { toPersonnelAccessApiException } from '../personnel-access.http-errors';
import { LeaveRefusedError } from './leave.errors';

/** The answer of each refusal, by its semantic code. A code the table does not know is a programming error and stays a 500. */
const STATUS: Readonly<Record<string, HttpStatus>> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  EMPLOYEE_NOT_FOUND: HttpStatus.NOT_FOUND,
  EMPLOYEE_NOT_WORKING: HttpStatus.CONFLICT,
  ALREADY_ON_LEAVE: HttpStatus.CONFLICT,
  NOT_ACTIVE: HttpStatus.CONFLICT,
  CONCURRENT_CHANGE: HttpStatus.CONFLICT,
  START_DATE_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  RETURN_DATE_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  RETURN_DATE_IN_PAST: HttpStatus.UNPROCESSABLE_ENTITY,
  GROUNDS_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  GROUNDS_TOO_LONG: HttpStatus.UNPROCESSABLE_ENTITY,
  GROUNDS_IS_NOTICE: HttpStatus.UNPROCESSABLE_ENTITY,
};

const MESSAGES: Readonly<Record<string, string>> = {
  NOT_FOUND: 'The long leave does not exist.',
  EMPLOYEE_NOT_FOUND: 'The employee does not exist.',
  EMPLOYEE_NOT_WORKING: 'The employee is not working: they are handing over before leaving, or have left.',
  ALREADY_ON_LEAVE: 'The employee is on a long leave already.',
  NOT_ACTIVE: 'The long leave has ended.',
  CONCURRENT_CHANGE: 'The person was changed by someone else meanwhile; read them again.',
  START_DATE_INVALID: 'The leave begins today or earlier, and not before the person joined.',
  RETURN_DATE_INVALID: 'The day is not valid for this leave.',
  RETURN_DATE_IN_PAST: 'The new day of return is today or later.',
  GROUNDS_REQUIRED: 'The basis of the day is required.',
  GROUNDS_TOO_LONG: 'The basis is longer than 500 characters.',
  GROUNDS_IS_NOTICE: 'The code of a notice is not the document the day rests on.',
};

/**
 * Maps a refusal of a long leave to its answer (the actor that may not write it is a 403, the same as for every personnel write); a
 * database that cannot answer is a 503, anything else is returned unchanged for the global filter.
 */
export function toLeaveApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  const refused = toPersonnelAccessApiException(error);
  if (refused) return refused;
  if (!(error instanceof LeaveRefusedError)) return toUnavailableApiException(error) ?? error;
  const status = STATUS[error.code];
  if (status === undefined) return error;

  return new ApiException(status, {
    code: `LONG_LEAVE.${error.code}`,
    message: MESSAGES[error.code] ?? error.message,
    ...(error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {}),
  });
}

const example = (error: Error) => errorExampleOf(toLeaveApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const LEAVE_ERROR_EXAMPLES = {
  NOT_FOUND: example(new LeaveRefusedError('NOT_FOUND')),
  EMPLOYEE_NOT_FOUND: example(new LeaveRefusedError('EMPLOYEE_NOT_FOUND')),
  ALREADY_ON_LEAVE: example(new LeaveRefusedError('ALREADY_ON_LEAVE')),
  EMPLOYEE_NOT_WORKING: example(new LeaveRefusedError('EMPLOYEE_NOT_WORKING', { workState: 'HANDING_OVER' })),
  NOT_ACTIVE: example(new LeaveRefusedError('NOT_ACTIVE')),
  START_DATE_INVALID: example(new LeaveRefusedError('START_DATE_INVALID', { reason: 'IN_FUTURE' })),
  RETURN_DATE_NOT_AFTER_START: example(new LeaveRefusedError('RETURN_DATE_INVALID', { reason: 'NOT_AFTER_START' })),
  RETURN_DATE_IN_FUTURE: example(new LeaveRefusedError('RETURN_DATE_INVALID', { reason: 'IN_FUTURE' })),
  RETURN_DATE_IN_PAST: example(new LeaveRefusedError('RETURN_DATE_IN_PAST')),
  GROUNDS_REQUIRED: example(new LeaveRefusedError('GROUNDS_REQUIRED')),
  GROUNDS_TOO_LONG: example(new LeaveRefusedError('GROUNDS_TOO_LONG')),
  GROUNDS_IS_NOTICE: example(new LeaveRefusedError('GROUNDS_IS_NOTICE')),
} as const;
