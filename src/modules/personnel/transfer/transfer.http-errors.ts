import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { toPersonnelAccessApiException } from '../personnel-access.http-errors';
import { TransferRefusedError } from './transfer.errors';
import { newTransferRefusal, type NewTransferFacts } from './transfer.policy';

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
  EMPLOYEE_UNPLACED: HttpStatus.CONFLICT,
  PLACEMENT_OVERLAP: HttpStatus.CONFLICT,
  CONCURRENT_CHANGE: HttpStatus.CONFLICT,
  ALREADY_EFFECTIVE: HttpStatus.CONFLICT,
  ALREADY_CANCELLED: HttpStatus.CONFLICT,
  ALREADY_CLOSED: HttpStatus.CONFLICT,
  NOT_CLOSEABLE: HttpStatus.CONFLICT,
};

/**
 * The refusals of the shared placement policy keep the code it gives: a department that cannot take people answers 409 (the state of
 * the destination), a department that is unknown answers 422 (the choice).
 */
function statusOf(code: string): HttpStatus | undefined {
  const known = STATUS[code];
  if (known) return known;
  if (code.endsWith('_NOT_FOUND')) return HttpStatus.UNPROCESSABLE_ENTITY;
  if (code.startsWith('DEPARTMENT_')) return HttpStatus.CONFLICT;

  return undefined;
}

const MESSAGES: Readonly<Record<string, string>> = {
  NOT_FOUND: 'The transfer does not exist.',
  EMPLOYEE_NOT_FOUND: 'The employee does not exist.',
  EMPLOYEE_LEFT: 'The employee has left the organization.',
  EFFECTIVE_DATE_IN_PAST: 'The day a change takes effect is today or later.',
  EFFECTIVE_DATE_NOT_AFTER_CURRENT_PERIOD: 'The day must come after the first day of the placement the person has now.',
  NO_CHANGE: 'The change leaves the department as it is.',
  GROUNDS_REQUIRED: 'The basis of the change is required.',
  GROUNDS_INCOMPLETE: 'The basis lacks a part: its type, number, issuer or day of issue.',
  GROUNDS_IS_NOTICE: 'The code of a notice is not the document the change rests on.',
  REASON_REQUIRED: 'A reason is required.',
  HEAD_SUCCESSOR_REQUIRED: 'The person heads the department they leave: name who follows, or that nobody does.',
  SUCCESSOR_NOT_A_MEMBER_ON_DATE: 'The person named cannot head the department on that day.',
  PENDING_EVENT_EXISTS: 'The person has another event waiting.',
  EMPLOYEE_UNPLACED: 'The employee is unplaced: use first placement instead of transfer.',
  PLACEMENT_OVERLAP: 'The placements of the person cannot take this change.',
  CONCURRENT_CHANGE: 'The person was changed by someone else meanwhile; read them again.',
  ALREADY_EFFECTIVE: 'The transfer has taken effect; only a new transfer can change it.',
  ALREADY_CANCELLED: 'The transfer was cancelled.',
  ALREADY_CLOSED: 'The transfer was closed already.',
  NOT_CLOSEABLE: 'The transfer cannot be closed yet.',
};

/**
 * Maps a refusal of a transfer to its answer (the actor that may not write it is a 403, the same as for every personnel write); a
 * database that cannot answer is a 503, anything else is returned unchanged for the global filter.
 */
export function toTransferApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  const refused = toPersonnelAccessApiException(error);
  if (refused) return refused;
  if (!(error instanceof TransferRefusedError)) return toUnavailableApiException(error) ?? error;
  const status = statusOf(error.code);
  if (status === undefined) return error;

  return new ApiException(status, {
    code: `DEPARTMENT_TRANSFER.${error.code}`,
    message: MESSAGES[error.code] ?? error.message,
    ...(error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {}),
  });
}

const example = (error: Error) => errorExampleOf(toTransferApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
/** A transfer to another department that nothing refuses; each example below changes one fact of it. */
const ACCEPTED_TRANSFER: NewTransferFacts = {
  today: '2026-01-01',
  effectiveOn: '2026-01-02',
  employee: { status: 'ACTIVE', workState: 'WORKING' },
  current: { departmentId: '<department-id>', validFrom: '2025-01-01' },
  target: { departmentId: '<other-department-id>' },
  destinationDepartment: { active: true },
  grounds: undefined,
  pending: null,
  namedAsSuccessor: false,
  successor: { required: false, chosen: undefined, candidate: null },
};

/**
 * A refusal of the destination as the policy of a new transfer gives it: its code and subject come from the shared placement
 * policy through `newTransferRefusal` (BEH.1), never written here.
 */
const destinationExample = (destination: Pick<NewTransferFacts, 'destinationDepartment'>) => {
  const refusal = newTransferRefusal({ ...ACCEPTED_TRANSFER, ...destination });
  if (!refusal) throw new Error('The facts of a refusal example must be refused');

  return example(new TransferRefusedError(refusal.code, refusal.details));
};

export const TRANSFER_ERROR_EXAMPLES = {
  NOT_FOUND: example(new TransferRefusedError('NOT_FOUND')),
  EMPLOYEE_NOT_FOUND: example(new TransferRefusedError('EMPLOYEE_NOT_FOUND')),
  EMPLOYEE_LEFT: example(new TransferRefusedError('EMPLOYEE_LEFT')),
  PLACEMENT_OVERLAP: example(new TransferRefusedError('PLACEMENT_OVERLAP')),
  CONCURRENT_CHANGE: example(new TransferRefusedError('CONCURRENT_CHANGE')),
  DEPARTMENT_INACTIVE: destinationExample({ destinationDepartment: { active: false } }),
  PENDING_EVENT_EXISTS: example(
    new TransferRefusedError('PENDING_EVENT_EXISTS', { kind: 'TRANSFER', effectiveOn: '2026-01-01' }),
  ),
  NO_CHANGE: example(new TransferRefusedError('NO_CHANGE')),
  EFFECTIVE_DATE_IN_PAST: example(new TransferRefusedError('EFFECTIVE_DATE_IN_PAST', { today: '2026-01-01' })),
  EFFECTIVE_DATE_NOT_AFTER_CURRENT_PERIOD: example(
    new TransferRefusedError('EFFECTIVE_DATE_NOT_AFTER_CURRENT_PERIOD', { currentPeriodFrom: '2026-01-01' }),
  ),
  DEPARTMENT_NOT_FOUND: destinationExample({ destinationDepartment: null }),
  GROUNDS_REQUIRED: example(new TransferRefusedError('GROUNDS_REQUIRED')),
  GROUNDS_INCOMPLETE: example(new TransferRefusedError('GROUNDS_INCOMPLETE', { missing: ['issuer'] })),
  GROUNDS_IS_NOTICE: example(new TransferRefusedError('GROUNDS_IS_NOTICE')),
  REASON_REQUIRED: example(new TransferRefusedError('REASON_REQUIRED')),
  HEAD_SUCCESSOR_REQUIRED: example(
    new TransferRefusedError('HEAD_SUCCESSOR_REQUIRED', { departmentName: '<department-name>' }),
  ),
  SUCCESSOR_NOT_A_MEMBER_ON_DATE: example(
    new TransferRefusedError('SUCCESSOR_NOT_A_MEMBER_ON_DATE', { reason: 'NOT_A_MEMBER_ON_DATE' }),
  ),
  ALREADY_EFFECTIVE: example(new TransferRefusedError('ALREADY_EFFECTIVE')),
  ALREADY_CANCELLED: example(new TransferRefusedError('ALREADY_CANCELLED')),
  ALREADY_CLOSED: example(new TransferRefusedError('ALREADY_CLOSED')),
  NOT_CLOSEABLE: example(new TransferRefusedError('NOT_CLOSEABLE', { blockers: ['NOT_EFFECTIVE'] })),
} as const;
