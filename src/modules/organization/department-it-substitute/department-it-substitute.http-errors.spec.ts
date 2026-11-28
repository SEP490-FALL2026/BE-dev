import { HttpStatus } from '@nestjs/common';
import { FORBIDDEN_ERROR } from '../../../infrastructure/http/errors/access-errors';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { DepartmentNotFoundError } from '../department/department.errors';
import {
  DepartmentItSubstituteAlreadyActiveError,
  DepartmentItSubstituteAlreadyEndedError,
  DepartmentItSubstituteDepartmentInactiveError,
  DepartmentItSubstituteForbiddenError,
  DepartmentItSubstituteIsInChargeError,
  DepartmentItSubstituteNotFoundError,
  DepartmentItSubstituteNotUsableError,
} from './department-it-substitute.errors';
import { toDepartmentItSubstituteApiException } from './department-it-substitute.http-errors';

function answer(error: unknown): { status: number; body: { code: string; message: string } } {
  const mapped = toDepartmentItSubstituteApiException(error);
  if (!(mapped instanceof ApiException)) throw new Error('expected an ApiException');

  return { status: mapped.getStatus(), body: mapped.getResponse() as { code: string; message: string } };
}

describe('toDepartmentItSubstituteApiException', () => {
  it.each<[string, Error, HttpStatus, string]>([
    ['DepartmentNotFoundError', new DepartmentNotFoundError(), HttpStatus.NOT_FOUND, 'DEPARTMENT.NOT_FOUND'],
    [
      'DepartmentItSubstituteNotFoundError',
      new DepartmentItSubstituteNotFoundError(),
      HttpStatus.NOT_FOUND,
      'DEPARTMENT_IT_SUBSTITUTE.NOT_FOUND',
    ],
    [
      'DepartmentItSubstituteAlreadyActiveError',
      new DepartmentItSubstituteAlreadyActiveError(),
      HttpStatus.CONFLICT,
      'DEPARTMENT_IT_SUBSTITUTE.ALREADY_ACTIVE',
    ],
    [
      'DepartmentItSubstituteIsInChargeError',
      new DepartmentItSubstituteIsInChargeError(),
      HttpStatus.CONFLICT,
      'DEPARTMENT_IT_SUBSTITUTE.IS_IN_CHARGE',
    ],
    [
      'DepartmentItSubstituteDepartmentInactiveError',
      new DepartmentItSubstituteDepartmentInactiveError(),
      HttpStatus.CONFLICT,
      'DEPARTMENT_IT_SUBSTITUTE.DEPARTMENT_INACTIVE',
    ],
    [
      'DepartmentItSubstituteAlreadyEndedError',
      new DepartmentItSubstituteAlreadyEndedError(),
      HttpStatus.CONFLICT,
      'DEPARTMENT_IT_SUBSTITUTE.ALREADY_ENDED',
    ],
    [
      'DepartmentItSubstituteNotUsableError',
      new DepartmentItSubstituteNotUsableError(),
      HttpStatus.UNPROCESSABLE_ENTITY,
      'DEPARTMENT_IT_SUBSTITUTE.NOT_USABLE_IT_ADMIN',
    ],
  ])('maps %s to %i %s', (_label, error, status, code) => {
    const result = answer(error);
    expect(result.status).toBe(status);
    expect(result.body.code).toBe(code);
  });

  it('maps DepartmentItSubstituteForbiddenError to 403 FORBIDDEN_ERROR', () => {
    expect(answer(new DepartmentItSubstituteForbiddenError())).toEqual({
      status: HttpStatus.FORBIDDEN,
      body: { ...FORBIDDEN_ERROR },
    });
  });
});
