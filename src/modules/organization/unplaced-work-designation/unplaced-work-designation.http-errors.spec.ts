import { HttpStatus } from '@nestjs/common';
import { FORBIDDEN_ERROR } from '../../../infrastructure/http/errors/access-errors';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { EmployeeNotFoundError } from '../public/organization.errors';
import {
  UnplacedWorkDesignationAlreadyActiveError,
  UnplacedWorkDesignationAlreadyEndedError,
  UnplacedWorkDesignationEmployeePlacedError,
  UnplacedWorkDesignationForbiddenError,
  UnplacedWorkDesignationNotFoundError,
  UnplacedWorkDesignationNotUsableError,
} from './unplaced-work-designation.errors';
import { toUnplacedWorkDesignationApiException } from './unplaced-work-designation.http-errors';

function answer(error: unknown): { status: number; body: { code: string; message: string } } {
  const mapped = toUnplacedWorkDesignationApiException(error);
  if (!(mapped instanceof ApiException)) throw new Error('expected an ApiException');

  return { status: mapped.getStatus(), body: mapped.getResponse() as { code: string; message: string } };
}

describe('toUnplacedWorkDesignationApiException', () => {
  it.each<[string, Error, HttpStatus, string]>([
    ['EmployeeNotFoundError', new EmployeeNotFoundError('emp-1'), HttpStatus.NOT_FOUND, 'EMPLOYEE.NOT_FOUND'],
    [
      'UnplacedWorkDesignationNotFoundError',
      new UnplacedWorkDesignationNotFoundError(),
      HttpStatus.NOT_FOUND,
      'UNPLACED_WORK_DESIGNATION.NOT_FOUND',
    ],
    [
      'UnplacedWorkDesignationEmployeePlacedError',
      new UnplacedWorkDesignationEmployeePlacedError(),
      HttpStatus.CONFLICT,
      'UNPLACED_WORK_DESIGNATION.EMPLOYEE_PLACED',
    ],
    [
      'UnplacedWorkDesignationAlreadyActiveError',
      new UnplacedWorkDesignationAlreadyActiveError(),
      HttpStatus.CONFLICT,
      'UNPLACED_WORK_DESIGNATION.ALREADY_ACTIVE',
    ],
    [
      'UnplacedWorkDesignationAlreadyEndedError',
      new UnplacedWorkDesignationAlreadyEndedError(),
      HttpStatus.CONFLICT,
      'UNPLACED_WORK_DESIGNATION.ALREADY_ENDED',
    ],
    [
      'UnplacedWorkDesignationNotUsableError',
      new UnplacedWorkDesignationNotUsableError(),
      HttpStatus.UNPROCESSABLE_ENTITY,
      'UNPLACED_WORK_DESIGNATION.NOT_USABLE_IT_ADMIN',
    ],
  ])('maps %s to %i %s', (_label, error, status, code) => {
    const result = answer(error);
    expect(result.status).toBe(status);
    expect(result.body.code).toBe(code);
  });

  it('maps UnplacedWorkDesignationForbiddenError to 403 FORBIDDEN_ERROR', () => {
    expect(answer(new UnplacedWorkDesignationForbiddenError())).toEqual({
      status: HttpStatus.FORBIDDEN,
      body: { ...FORBIDDEN_ERROR },
    });
  });
});
