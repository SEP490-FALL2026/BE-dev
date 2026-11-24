import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { EmployeeNotStartedError } from '../../organization/public/organization.errors';
import { GHOST_SEAT_ERROR_EXAMPLES, toGhostSeatApiException } from './board.http-errors';

describe('toGhostSeatApiException', () => {
  it('maps EmployeeNotStartedError to 409 EMPLOYEE.NOT_STARTED', () => {
    const mapped = toGhostSeatApiException(new EmployeeNotStartedError('emp-future'));

    expect(mapped).toBeInstanceOf(ApiException);
    const apiError = mapped as ApiException;
    expect(apiError.getStatus()).toBe(HttpStatus.CONFLICT);
    expect((apiError.getResponse() as { code: string }).code).toBe('EMPLOYEE.NOT_STARTED');
  });

  it('has an OpenAPI example for EMPLOYEE.NOT_STARTED', () => {
    expect(GHOST_SEAT_ERROR_EXAMPLES.EMPLOYEE_NOT_STARTED.code).toBe('EMPLOYEE.NOT_STARTED');
  });
});
