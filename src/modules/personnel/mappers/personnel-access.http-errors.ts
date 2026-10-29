import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { FORBIDDEN_ERROR } from '../../../infrastructure/http/errors/access-errors';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { PersonnelAccessRefusedError } from '../public/personnel.errors';

const SELF_CHANGE_MESSAGE =
  'An event or a notice about yourself is not recorded in the application: it is done by the controlled procedure (pnpm ops:record-super-admin-event).';

/**
 * The two answers of the policy of a personnel write, the same for the transfer, the long leave, the departure and the notices of the
 * heads (F13, F19). A role that may not write is `AUTHORIZATION.FORBIDDEN`; the Super Admin about themselves is
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

/** The answer above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const PERSONNEL_ACCESS_ERROR_EXAMPLES = {
  SELF_CHANGE_FORBIDDEN: errorExampleOf(
    toPersonnelAccessApiException(new PersonnelAccessRefusedError('SELF_CHANGE_FORBIDDEN')),
  ),
} as const;
