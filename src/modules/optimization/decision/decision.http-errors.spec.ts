import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { EmployeeNotStartedError } from '../../organization/public/organization.errors';
import { toDecisionApiException } from './decision.http-errors';

describe('toDecisionApiException', () => {
  it('maps EmployeeNotStartedError to 409 EMPLOYEE.NOT_STARTED', () => {
    const mapped = toDecisionApiException(new EmployeeNotStartedError('emp-future'));

    expect(mapped).toBeInstanceOf(ApiException);
    const apiError = mapped as ApiException;
    expect(apiError.getStatus()).toBe(HttpStatus.CONFLICT);
    expect((apiError.getResponse() as { code: string }).code).toBe('EMPLOYEE.NOT_STARTED');
  });
});
