import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { toPersonnelAccessApiException } from '../personnel-access.http-errors';
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
  CASE_NOT_BLOCKED: HttpStatus.CONFLICT,
  CASE_CLOSED: HttpStatus.CONFLICT,
  NOT_HANDING_OVER: HttpStatus.CONFLICT,
  LAST_WORKING_DAY_AHEAD: HttpStatus.CONFLICT,
  GROUNDS_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  GROUNDS_INCOMPLETE: HttpStatus.UNPROCESSABLE_ENTITY,
  GROUNDS_IS_NOTICE: HttpStatus.UNPROCESSABLE_ENTITY,
  REASON_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  SUCCESSOR_NOT_A_MEMBER_ON_DATE: HttpStatus.UNPROCESSABLE_ENTITY,
  PENDING_EVENT_EXISTS: HttpStatus.CONFLICT,
  TRANSFER_CANCELLATION_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  NOTHING_TO_REVOKE: HttpStatus.CONFLICT,
  ASSIGNMENT_NOT_AVAILABLE: HttpStatus.UNPROCESSABLE_ENTITY,
  ACCOUNT_LOCK_NOT_RECORDED: HttpStatus.CONFLICT,
  ALREADY_RECORDED: HttpStatus.CONFLICT,
  REVOCATION_NOT_SUPPORTED: HttpStatus.CONFLICT,
  CASE_NOT_CLOSEABLE: HttpStatus.CONFLICT,
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
  CASE_NOT_BLOCKED: 'The employee is not blocked yet: the last working day has not passed and they have not left.',
  CASE_CLOSED: 'The case is closed.',
  NOT_HANDING_OVER: 'The case is not a handover under way.',
  LAST_WORKING_DAY_AHEAD:
    'The last working day has not come yet: move it to an earlier day to let the employee leave sooner.',
  GROUNDS_REQUIRED: 'The basis of the departure is required.',
  GROUNDS_INCOMPLETE: 'The basis lacks a part: its type, number, issuer or day of issue.',
  GROUNDS_IS_NOTICE: 'The code of a notice is not the document the departure rests on.',
  REASON_REQUIRED: 'A reason is required.',
  SUCCESSOR_NOT_A_MEMBER_ON_DATE: 'The person named cannot head the department on that day.',
  PENDING_EVENT_EXISTS: 'The person has another event waiting.',
  TRANSFER_CANCELLATION_REQUIRED:
    'The transfer that waits ends before it takes effect: confirm that it is cancelled with the departure.',
  NOTHING_TO_REVOKE: 'There is no right left to take away.',
  ASSIGNMENT_NOT_AVAILABLE: 'The seat is not held by the person or already has a revocation under way.',
  ACCOUNT_LOCK_NOT_RECORDED: 'The lock of the company account must be recorded before or with the revocations.',
  ALREADY_RECORDED: 'The lock of the company account was recorded already.',
  REVOCATION_NOT_SUPPORTED: 'The kind of provisioning of the seat has no revocation yet.',
  CASE_NOT_CLOSEABLE: 'Something still keeps the case open.',
  PLACEMENT_OVERLAP: 'The placements of the person cannot take this change.',
  CONCURRENT_CHANGE: 'The person was changed by someone else meanwhile; read the case again.',
};

/**
 * Maps a refusal of the record of a departure to its answer; a database that cannot answer is a 503, anything else
 * is returned unchanged for the global filter.
 */
export function toOffboardingApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  const refused = toPersonnelAccessApiException(error);
  if (refused) return refused;
  if (!(error instanceof OffboardingRefusedError)) return toUnavailableApiException(error) ?? error;
  const status = STATUS[error.code];
  if (status === undefined) return error;

  return new ApiException(status, {
    code: `OFFBOARDING_CASE.${error.code}`,
    message: MESSAGES[error.code] ?? error.message,
    ...(error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {}),
  });
}

const example = (error: Error) => errorExampleOf(toOffboardingApiException(error));

/**
 * The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). The details
 * have the shape of the site that throws the code (the policy, or the service where the policy does not judge it).
 */
export const OFFBOARDING_ERROR_EXAMPLES = {
  NOT_FOUND: example(new OffboardingRefusedError('NOT_FOUND')),
  EMPLOYEE_NOT_FOUND: example(new OffboardingRefusedError('EMPLOYEE_NOT_FOUND')),
  EMPLOYEE_LEFT: example(new OffboardingRefusedError('EMPLOYEE_LEFT')),
  ALREADY_HANDING_OVER: example(new OffboardingRefusedError('ALREADY_HANDING_OVER')),
  LAST_WORKING_DAY_REQUIRED: example(new OffboardingRefusedError('LAST_WORKING_DAY_REQUIRED')),
  LAST_WORKING_DAY_INVALID: example(
    new OffboardingRefusedError('LAST_WORKING_DAY_INVALID', { reason: 'IN_PAST', today: '2026-01-01' }),
  ),
  LAST_DAY_ALREADY_PASSED: example(
    new OffboardingRefusedError('LAST_DAY_ALREADY_PASSED', { lastWorkingDay: '2026-01-01' }),
  ),
  NO_CHANGE: example(new OffboardingRefusedError('NO_CHANGE')),
  CASE_LEFT: example(new OffboardingRefusedError('CASE_LEFT')),
  CASE_NOT_LEFT: example(new OffboardingRefusedError('CASE_NOT_LEFT')),
  CASE_NOT_BLOCKED: example(new OffboardingRefusedError('CASE_NOT_BLOCKED')),
  CASE_CLOSED: example(new OffboardingRefusedError('CASE_CLOSED')),
  NOT_HANDING_OVER: example(new OffboardingRefusedError('NOT_HANDING_OVER')),
  LAST_WORKING_DAY_AHEAD: example(
    new OffboardingRefusedError('LAST_WORKING_DAY_AHEAD', { lastWorkingDay: '2026-01-02' }),
  ),
  GROUNDS_REQUIRED: example(new OffboardingRefusedError('GROUNDS_REQUIRED')),
  GROUNDS_INCOMPLETE: example(new OffboardingRefusedError('GROUNDS_INCOMPLETE', { missing: ['issuedOn'] })),
  GROUNDS_IS_NOTICE: example(new OffboardingRefusedError('GROUNDS_IS_NOTICE')),
  REASON_REQUIRED: example(new OffboardingRefusedError('REASON_REQUIRED')),
  SUCCESSOR_NOT_A_MEMBER_ON_DATE: example(
    new OffboardingRefusedError('SUCCESSOR_NOT_A_MEMBER_ON_DATE', { reason: 'NOT_A_MEMBER_ON_DATE' }),
  ),
  PENDING_EVENT_EXISTS: example(
    new OffboardingRefusedError('PENDING_EVENT_EXISTS', { kind: 'TRANSFER', effectiveOn: '2026-01-01' }),
  ),
  TRANSFER_CANCELLATION_REQUIRED: example(new OffboardingRefusedError('TRANSFER_CANCELLATION_REQUIRED')),
  NOTHING_TO_REVOKE: example(new OffboardingRefusedError('NOTHING_TO_REVOKE')),
  ASSIGNMENT_NOT_AVAILABLE: example(
    new OffboardingRefusedError('ASSIGNMENT_NOT_AVAILABLE', { assignmentId: '<assignment-id>' }),
  ),
  ACCOUNT_LOCK_NOT_RECORDED: example(new OffboardingRefusedError('ACCOUNT_LOCK_NOT_RECORDED')),
  ALREADY_RECORDED: example(new OffboardingRefusedError('ALREADY_RECORDED')),
  REVOCATION_NOT_SUPPORTED: example(
    new OffboardingRefusedError('REVOCATION_NOT_SUPPORTED', {
      assignmentId: '<assignment-id>',
      provisioningType: 'K3',
    }),
  ),
  CASE_NOT_CLOSEABLE: example(
    new OffboardingRefusedError('CASE_NOT_CLOSEABLE', {
      blockers: ['ACCOUNT_LOCK_NOT_RECORDED', 'PERSONAL_RIGHTS_OPEN'],
    }),
  ),
  // One example per code in a response: the reason a caller has to act on (`D-S28`); `NO_OPEN_PLACEMENT` is in the descriptions.
  PLACEMENT_OVERLAP: example(
    new OffboardingRefusedError('PLACEMENT_OVERLAP', { reason: 'FIRST_PLACEMENT_PENDING', validFrom: '2026-01-01' }),
  ),
  CONCURRENT_CHANGE: example(new OffboardingRefusedError('CONCURRENT_CHANGE')),
} as const;
