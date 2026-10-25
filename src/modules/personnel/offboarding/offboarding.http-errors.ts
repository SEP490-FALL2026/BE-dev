import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { OffboardingRefusedError } from './offboarding.errors';

/** The answer of each refusal, by its semantic code. A code the table does not know is a programming error and stays a 500. */
const STATUS: Readonly<Record<string, HttpStatus>> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  EMPLOYEE_NOT_FOUND: HttpStatus.NOT_FOUND,
  EMPLOYEE_LEFT: HttpStatus.CONFLICT,
  ALREADY_HANDING_OVER: HttpStatus.CONFLICT,
  LAST_WORKING_DAY_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  LAST_WORKING_DAY_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  LAST_DAY_ALREADY_PASSED: HttpStatus.CONFLICT,
  NO_CHANGE: HttpStatus.UNPROCESSABLE_ENTITY,
  CASE_LEFT: HttpStatus.CONFLICT,
  CASE_NOT_LEFT: HttpStatus.CONFLICT,
  CASE_CLOSED: HttpStatus.CONFLICT,
  NOT_HANDING_OVER: HttpStatus.CONFLICT,
  DEPARTED_ON_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  GROUNDS_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  GROUNDS_INCOMPLETE: HttpStatus.UNPROCESSABLE_ENTITY,
  GROUNDS_IS_NOTICE: HttpStatus.UNPROCESSABLE_ENTITY,
  REASON_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  SUCCESSOR_NOT_A_MEMBER_ON_DATE: HttpStatus.UNPROCESSABLE_ENTITY,
  PENDING_EVENT_EXISTS: HttpStatus.CONFLICT,
  TRANSFER_CANCELLATION_REASON_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  COUNT_MISMATCH: HttpStatus.UNPROCESSABLE_ENTITY,
  ASSIGNMENT_NOT_AVAILABLE: HttpStatus.UNPROCESSABLE_ENTITY,
  ACCOUNT_LOCK_NOT_RECORDED: HttpStatus.CONFLICT,
  ALREADY_RECORDED: HttpStatus.CONFLICT,
  REVOCATION_NOT_SUPPORTED: HttpStatus.CONFLICT,
  CASE_NOT_CLOSEABLE: HttpStatus.CONFLICT,
  SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN: HttpStatus.CONFLICT,
  PLACEMENT_OVERLAP: HttpStatus.CONFLICT,
  CONCURRENT_CHANGE: HttpStatus.CONFLICT,
};

const MESSAGES: Readonly<Record<string, string>> = {
  NOT_FOUND: 'The offboarding case does not exist.',
  EMPLOYEE_NOT_FOUND: 'The employee does not exist.',
  EMPLOYEE_LEFT: 'The employee has left the organization.',
  ALREADY_HANDING_OVER: 'The employee is already handing over before leaving.',
  LAST_WORKING_DAY_REQUIRED: 'The last working day is required.',
  LAST_WORKING_DAY_INVALID: 'The last working day cannot be that day.',
  LAST_DAY_ALREADY_PASSED: 'The last working day has passed: cancel the handover or record that the employee has left.',
  NO_CHANGE: 'The last working day is the same.',
  CASE_LEFT: 'The employee has already left; the handover cannot change.',
  CASE_NOT_LEFT: 'The employee has not left yet.',
  CASE_CLOSED: 'The case is closed.',
  NOT_HANDING_OVER: 'The case is not a handover under way.',
  DEPARTED_ON_INVALID: 'The day the employee left cannot be in the future or before the handover was recorded.',
  GROUNDS_REQUIRED: 'The basis of the departure is required.',
  GROUNDS_INCOMPLETE: 'The basis lacks a part: its type, number, issuer or day of issue.',
  GROUNDS_IS_NOTICE: 'The code of a notice is not the document the departure rests on.',
  REASON_REQUIRED: 'A reason is required.',
  SUCCESSOR_NOT_A_MEMBER_ON_DATE: 'The person named cannot head the department on that day.',
  PENDING_EVENT_EXISTS: 'The person has another event waiting.',
  TRANSFER_CANCELLATION_REASON_REQUIRED:
    'The transfer that waits ends before it takes effect: give the reason to cancel it.',
  COUNT_MISMATCH: 'The number does not match the rights selected.',
  ASSIGNMENT_NOT_AVAILABLE: 'The seat is not held by the person or already has a revocation under way.',
  ACCOUNT_LOCK_NOT_RECORDED: 'The lock of the company account must be recorded before or with the revocations.',
  ALREADY_RECORDED: 'The lock of the company account was recorded already.',
  REVOCATION_NOT_SUPPORTED: 'The kind of provisioning of the seat has no revocation yet.',
  CASE_NOT_CLOSEABLE: 'Something still keeps the case open.',
  SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN: 'An IT Admin does not do this for themselves while another IT Admin can.',
  PLACEMENT_OVERLAP: 'The placements of the person cannot take this change.',
  CONCURRENT_CHANGE: 'The person was changed by someone else meanwhile; read the case again.',
};

/** Maps a refusal of the record of a departure to its answer; anything else is returned unchanged for the global filter. */
export function toOffboardingApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (!(error instanceof OffboardingRefusedError)) return error;
  const status = STATUS[error.code];
  if (status === undefined) return error;

  return new ApiException(status, {
    code: `OFFBOARDING_CASE.${error.code}`,
    message: MESSAGES[error.code] ?? error.message,
    ...(error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {}),
  });
}
