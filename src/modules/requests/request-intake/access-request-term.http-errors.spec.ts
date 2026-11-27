import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { EmployeeNotStartedError } from '../../organization/public/organization.errors';
import {
  AccessRequestPlanBoundToDeviceError,
  AccessRequestTermRefusedError,
} from '../access-request/access-request.errors';
import { toAccessRequestApiException } from '../access-request/access-request.http-errors';

const answerOf = (error: unknown) => {
  const answer = toAccessRequestApiException(error) as ApiException;

  return {
    status: answer.getStatus(),
    body: answer.getResponse() as { code: string; details?: Record<string, unknown> },
  };
};

/** `ACCESS_REQUEST.TERM_MONTHS_OUT_OF_RANGE` tells the client the most months the plan takes and the kind of plan (E3a, B3 row 1). */
describe('ACCESS_REQUEST.TERM_MONTHS_OUT_OF_RANGE details', () => {
  it.each([
    ['K1', 9],
    ['K2', 12],
    ['K5', 12],
  ] as const)('says the most months and the kind for a plan of kind %s', (kind, maxMonths) => {
    const { status, body } = answerOf(new AccessRequestTermRefusedError('TERM_MONTHS_OUT_OF_RANGE', null, kind));

    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(body.code).toBe('ACCESS_REQUEST.TERM_MONTHS_OUT_OF_RANGE');
    expect(body.details).toEqual({ maxMonths, provisioningType: kind });
  });

  it('says only the most months when the kind of plan is not known (a proposal is judged by the rule that takes the most)', () => {
    const { status, body } = answerOf(new AccessRequestTermRefusedError('TERM_MONTHS_OUT_OF_RANGE', null, null));

    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(body.details).toEqual({ maxMonths: 12 });
    expect(body.details).not.toHaveProperty('provisioningType');
  });

  it('adds no details to the other term refusals but the contract end', () => {
    const asked = answerOf(new AccessRequestTermRefusedError('TERM_REQUIRED', null, 'K1'));
    const ended = answerOf(new AccessRequestTermRefusedError('TERM_CONTRACT_ENDED', '2026-10-31', 'K1'));

    expect(asked.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(asked.body).not.toHaveProperty('details');
    expect(ended.body.details).toEqual({ contractEndDate: '2026-10-31' });
  });

  it('maps AccessRequestPlanBoundToDeviceError to 422 ACCESS_REQUEST.PLAN_BOUND_TO_DEVICE (W2-18)', () => {
    const mapped = answerOf(new AccessRequestPlanBoundToDeviceError());

    expect(mapped.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(mapped.body.code).toBe('ACCESS_REQUEST.PLAN_BOUND_TO_DEVICE');
  });

  it('maps EmployeeNotStartedError to 409 EMPLOYEE.NOT_STARTED', () => {
    const mapped = answerOf(new EmployeeNotStartedError('e-1'));

    expect(mapped.status).toBe(HttpStatus.CONFLICT);
    expect(mapped.body.code).toBe('EMPLOYEE.NOT_STARTED');
  });

  it('maps W3-17 K1 annual term errors with exact codes and contractEndDate details', () => {
    const fixed = answerOf(new AccessRequestTermRefusedError('K1_ANNUAL_TERM_FIXED', null, 'K1'));
    expect(fixed.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(fixed.body.code).toBe('ACCESS_REQUEST.K1_ANNUAL_TERM_FIXED');
    expect(fixed.body).not.toHaveProperty('details');

    const tooShort = answerOf(new AccessRequestTermRefusedError('K1_ANNUAL_CONTRACT_TOO_SHORT', '2027-03-31', 'K1'));
    expect(tooShort.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(tooShort.body.code).toBe('ACCESS_REQUEST.K1_ANNUAL_CONTRACT_TOO_SHORT');
    expect(tooShort.body.details).toEqual({ contractEndDate: '2027-03-31' });
  });
});
