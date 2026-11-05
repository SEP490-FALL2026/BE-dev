import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { DepartmentMemberRefusedError } from './department-member.errors';

const STATUS: Readonly<Record<DepartmentMemberRefusedError['code'], HttpStatus>> = {
  OUT_OF_SCOPE: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
};

const MESSAGES: Readonly<Record<DepartmentMemberRefusedError['code'], string>> = {
  OUT_OF_SCOPE: 'Only the head of the department reads the people of that department.',
  NOT_FOUND: 'The person is not a member of the department today.',
};

/** Maps a refusal of the read of a member to its answer; a database that cannot answer is a 503, anything else is returned unchanged. */
export function toDepartmentMemberApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (!(error instanceof DepartmentMemberRefusedError)) return toUnavailableApiException(error) ?? error;

  return new ApiException(STATUS[error.code], {
    code: `DEPARTMENT_MEMBER.${error.code}`,
    message: MESSAGES[error.code],
  });
}

const example = (error: Error) => errorExampleOf(toDepartmentMemberApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const DEPARTMENT_MEMBER_ERROR_EXAMPLES = {
  OUT_OF_SCOPE: example(new DepartmentMemberRefusedError('OUT_OF_SCOPE')),
  NOT_FOUND: example(new DepartmentMemberRefusedError('NOT_FOUND')),
} as const;
