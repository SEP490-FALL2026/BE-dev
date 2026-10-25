import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { LeaveRefusedError } from './leave.errors';

/** The answer of each refusal, by its semantic code. A code the table does not know is a programming error and stays a 500. */
const STATUS: Readonly<Record<string, HttpStatus>> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  EMPLOYEE_NOT_FOUND: HttpStatus.NOT_FOUND,
  EMPLOYEE_NOT_WORKING: HttpStatus.CONFLICT,
  ALREADY_ON_LEAVE: HttpStatus.CONFLICT,
  NOT_ACTIVE: HttpStatus.CONFLICT,
  CONCURRENT_CHANGE: HttpStatus.CONFLICT,
  SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN: HttpStatus.CONFLICT,
  START_DATE_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  RETURN_DATE_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  RETURN_DATE_IN_PAST: HttpStatus.UNPROCESSABLE_ENTITY,
  GROUNDS_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  GROUNDS_INCOMPLETE: HttpStatus.UNPROCESSABLE_ENTITY,
  GROUNDS_IS_NOTICE: HttpStatus.UNPROCESSABLE_ENTITY,
};

const MESSAGES: Readonly<Record<string, string>> = {
  NOT_FOUND: 'The long leave does not exist.',
  EMPLOYEE_NOT_FOUND: 'The employee does not exist.',
  EMPLOYEE_NOT_WORKING: 'The employee is not working: they are handing over before leaving, or have left.',
  ALREADY_ON_LEAVE: 'The employee is on a long leave already.',
  NOT_ACTIVE: 'The long leave has ended.',
  CONCURRENT_CHANGE: 'The person was changed by someone else meanwhile; read them again.',
  SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN: 'An IT Admin does not record this for themselves while another IT Admin can.',
  START_DATE_INVALID: 'The leave begins today or earlier, and not before the person joined.',
  RETURN_DATE_INVALID: 'The day is not valid for this leave.',
  RETURN_DATE_IN_PAST: 'The new day of return is today or later.',
  GROUNDS_REQUIRED: 'The basis of the day is required.',
  GROUNDS_INCOMPLETE: 'The basis lacks a part: its type, number, issuer or day of issue.',
  GROUNDS_IS_NOTICE: 'The code of a notice is not the document the day rests on.',
};

/** Maps a refusal of a long leave to its answer; anything else is returned unchanged for the global filter. */
export function toLeaveApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (!(error instanceof LeaveRefusedError)) return error;
  const status = STATUS[error.code];
  if (status === undefined) return error;

  return new ApiException(status, {
    code: `LONG_LEAVE.${error.code}`,
    message: MESSAGES[error.code] ?? error.message,
    ...(error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {}),
  });
}
