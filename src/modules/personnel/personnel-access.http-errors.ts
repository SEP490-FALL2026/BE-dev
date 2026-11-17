import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../infrastructure/http/errors/api.exception';
import { FORBIDDEN_ERROR } from '../../infrastructure/http/errors/access-errors';
import { errorExampleOf } from '../../infrastructure/http/openapi-error-examples';
import { PersonnelAccessRefusedError } from './public/personnel.errors';

const SELF_CHANGE_MESSAGE =
  'An event or a notice about yourself is not recorded in the application: it is done by the controlled procedure (pnpm ops:record-super-admin-event).';

/**
 * The two answers of the policy of a personnel write, the same for the transfer, the long leave, the departure and the notices of the
 * heads. A role that may not write is `AUTHORIZATION.FORBIDDEN`; the Super Admin about themselves is
 * `PERSONNEL.SELF_CHANGE_FORBIDDEN` and its description points only to the controlled procedure. Null for any other error.
 */
export function toPersonnelAccessApiException(error: unknown): ApiException | null {
  if (!(error instanceof PersonnelAccessRefusedError)) return null;
  if (error.problem === 'FORBIDDEN') return new ApiException(HttpStatus.FORBIDDEN, { ...FORBIDDEN_ERROR });

  return new ApiException(HttpStatus.FORBIDDEN, {
    code: 'PERSONNEL.SELF_CHANGE_FORBIDDEN',
    message: SELF_CHANGE_MESSAGE,
  });
}

/** A basis cannot be issued after today (the day of the organization): the Owner's rule for every operation that takes one. */
export function groundsIssuedOnFutureException(today: string): ApiException {
  return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
    code: 'PERSONNEL.GROUNDS_ISSUED_ON_FUTURE',
    message: 'The basis cannot be issued after today.',
    details: { today },
  });
}

/** The code of the refusal of a head who leaves without naming who follows them: the same for a departure and a transfer (`QĐ-110h`). */
export const SUCCESSOR_REQUIRED_CODE = 'PERSONNEL.SUCCESSOR_REQUIRED';

/** A head who leaves must name an employee to follow them: nothing given and "nobody" are both refused (`QĐ-110h`). */
export function successorRequiredException(details?: Record<string, unknown>): ApiException {
  return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
    code: SUCCESSOR_REQUIRED_CODE,
    message: 'The person heads the department they leave: name an employee of it who follows them as head.',
    ...(details && Object.keys(details).length > 0 ? { details } : {}),
  });
}

/** The answer above as OpenAPI examples, each produced by the mapper that gives it at runtime. */
export const PERSONNEL_ACCESS_ERROR_EXAMPLES = {
  SELF_CHANGE_FORBIDDEN: errorExampleOf(
    toPersonnelAccessApiException(new PersonnelAccessRefusedError('SELF_CHANGE_FORBIDDEN')),
  ),
  GROUNDS_ISSUED_ON_FUTURE: errorExampleOf(groundsIssuedOnFutureException('2026-01-01')),
  SUCCESSOR_REQUIRED: errorExampleOf(successorRequiredException({ departmentId: '<department-id>' })),
} as const;
