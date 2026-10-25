import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { NoticeRefusedError } from './notice.errors';

/** The answer of each refusal, by its semantic code. A code the table does not know is a programming error and stays a 500. */
const STATUS: Readonly<Record<string, HttpStatus>> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  EMPLOYEE_NOT_FOUND: HttpStatus.NOT_FOUND,
  EMPLOYEE_LEFT: HttpStatus.CONFLICT,
  NOT_DEPARTMENT_HEAD: HttpStatus.FORBIDDEN,
  KIND_NOT_ALLOWED: HttpStatus.FORBIDDEN,
  SELF_NOTICE: HttpStatus.UNPROCESSABLE_ENTITY,
  TARGET_DEPARTMENT_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  TARGET_DEPARTMENT_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  DUPLICATE_PENDING: HttpStatus.CONFLICT,
  NOT_PENDING: HttpStatus.CONFLICT,
  REASON_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  VERIFICATION_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  GROUNDS_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  GROUNDS_INCOMPLETE: HttpStatus.UNPROCESSABLE_ENTITY,
  GROUNDS_IS_NOTICE: HttpStatus.UNPROCESSABLE_ENTITY,
  EVENT_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  DUPLICATE_EVENT: HttpStatus.CONFLICT,
  NO_MATCHING_EVENT: HttpStatus.CONFLICT,
};

const MESSAGES: Readonly<Record<string, string>> = {
  NOT_FOUND: 'The notice does not exist.',
  EMPLOYEE_NOT_FOUND: 'The employee does not exist.',
  EMPLOYEE_LEFT: 'The employee has left the organization.',
  NOT_DEPARTMENT_HEAD: 'Only the head of the department the person belongs to sends this notice.',
  KIND_NOT_ALLOWED: 'This kind of notice is not allowed for this person.',
  SELF_NOTICE: 'A head does not send a notice about themselves.',
  TARGET_DEPARTMENT_REQUIRED: 'A transfer names the department the person goes to.',
  TARGET_DEPARTMENT_INVALID: 'The department named is not one the person can go to, or the kind takes none.',
  DUPLICATE_PENDING: 'A notice of this kind about this person already waits.',
  NOT_PENDING: 'The notice is not waiting for verification any more.',
  REASON_REQUIRED: 'A reason is required.',
  VERIFICATION_REQUIRED: 'The verification names how and against what the notice was checked.',
  GROUNDS_REQUIRED: 'The basis of the event is required.',
  GROUNDS_INCOMPLETE: 'The basis lacks a part: its type, number, issuer or day of issue.',
  GROUNDS_IS_NOTICE: 'The code of a notice is not the document the event rests on.',
  EVENT_INVALID: 'The event lacks a field its kind needs, or carries one it does not take.',
  DUPLICATE_EVENT: 'The person already has such an event: reject the notice or link it to that event.',
  NO_MATCHING_EVENT: 'The event is not one of this person and of the kind of this notice that is in force.',
};

/** Maps a refusal of a notice to its answer; anything else is returned unchanged for the global filter. */
export function toNoticeApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (!(error instanceof NoticeRefusedError)) return error;
  const status = STATUS[error.code];
  if (status === undefined) return error;

  return new ApiException(status, {
    code: `PERSONNEL_NOTICE.${error.code}`,
    message: MESSAGES[error.code] ?? error.message,
    ...(error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {}),
  });
}
