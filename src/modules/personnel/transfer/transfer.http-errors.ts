import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { TransferRefusedError } from './transfer.errors';

/** The answer of each refusal, by its semantic code. A code the table does not know is a programming error and stays a 500. */
const STATUS: Readonly<Record<string, HttpStatus>> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  EMPLOYEE_NOT_FOUND: HttpStatus.NOT_FOUND,
  EMPLOYEE_LEFT: HttpStatus.CONFLICT,
  EFFECTIVE_DATE_IN_PAST: HttpStatus.UNPROCESSABLE_ENTITY,
  EFFECTIVE_DATE_NOT_AFTER_CURRENT_PERIOD: HttpStatus.UNPROCESSABLE_ENTITY,
  NO_CHANGE: HttpStatus.UNPROCESSABLE_ENTITY,
  GROUNDS_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  GROUNDS_INCOMPLETE: HttpStatus.UNPROCESSABLE_ENTITY,
  GROUNDS_IS_NOTICE: HttpStatus.UNPROCESSABLE_ENTITY,
  REASON_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  HEAD_SUCCESSOR_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  SUCCESSOR_NOT_A_MEMBER_ON_DATE: HttpStatus.UNPROCESSABLE_ENTITY,
  PENDING_EVENT_EXISTS: HttpStatus.CONFLICT,
  PLACEMENT_OVERLAP: HttpStatus.CONFLICT,
  CONCURRENT_CHANGE: HttpStatus.CONFLICT,
  ALREADY_EFFECTIVE: HttpStatus.CONFLICT,
  ALREADY_CANCELLED: HttpStatus.CONFLICT,
  ALREADY_CLOSED: HttpStatus.CONFLICT,
  NOT_CLOSEABLE: HttpStatus.CONFLICT,
  SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN: HttpStatus.CONFLICT,
};

/**
 * The refusals of the shared placement policy keep the code it gives: the department and its Cost Center that cannot take people
 * answer 409 (the state of the destination), a department or a title that is unknown or retired answers 422 (the choice).
 */
function statusOf(code: string): HttpStatus | undefined {
  const known = STATUS[code];
  if (known) return known;
  if (code.startsWith('JOB_TITLE_') || code.endsWith('_NOT_FOUND')) return HttpStatus.UNPROCESSABLE_ENTITY;
  if (code.startsWith('DEPARTMENT_')) return HttpStatus.CONFLICT;

  return undefined;
}

const MESSAGES: Readonly<Record<string, string>> = {
  NOT_FOUND: 'The transfer does not exist.',
  EMPLOYEE_NOT_FOUND: 'The employee does not exist.',
  EMPLOYEE_LEFT: 'The employee has left the organization.',
  EFFECTIVE_DATE_IN_PAST: 'The day a change takes effect is today or later.',
  EFFECTIVE_DATE_NOT_AFTER_CURRENT_PERIOD: 'The day must come after the first day of the placement the person has now.',
  NO_CHANGE: 'The change leaves the department, the job title and the day as they are.',
  GROUNDS_REQUIRED: 'The basis of the change is required.',
  GROUNDS_INCOMPLETE: 'The basis lacks a part: its type, number, issuer or day of issue.',
  GROUNDS_IS_NOTICE: 'The code of a notice is not the document the change rests on.',
  REASON_REQUIRED: 'A reason is required.',
  HEAD_SUCCESSOR_REQUIRED: 'The person heads the department they leave: name who follows, or that nobody does.',
  SUCCESSOR_NOT_A_MEMBER_ON_DATE: 'The person named cannot head the department on that day.',
  PENDING_EVENT_EXISTS: 'The person has another event waiting.',
  PLACEMENT_OVERLAP: 'The placements of the person cannot take this change.',
  CONCURRENT_CHANGE: 'The person was changed by someone else meanwhile; read them again.',
  ALREADY_EFFECTIVE: 'The transfer has taken effect; only a new transfer can change it.',
  ALREADY_CANCELLED: 'The transfer was cancelled.',
  ALREADY_CLOSED: 'The transfer was closed already.',
  NOT_CLOSEABLE: 'The transfer cannot be closed yet.',
  SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN: 'An IT Admin does not record this for themselves while another IT Admin can.',
};

/** Maps a refusal of a transfer to its answer; anything else is returned unchanged for the global filter. */
export function toTransferApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (!(error instanceof TransferRefusedError)) return error;
  const status = statusOf(error.code);
  if (status === undefined) return error;

  return new ApiException(status, {
    code: `DEPARTMENT_TRANSFER.${error.code}`,
    message: MESSAGES[error.code] ?? error.message,
    ...(error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {}),
  });
}
