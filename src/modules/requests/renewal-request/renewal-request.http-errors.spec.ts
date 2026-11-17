import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { RenewalRequestRefusedError } from './renewal-request.errors';
import { toRenewalApiException } from './renewal-request.http-errors';

const answerOf = (error: unknown) => {
  const answer = toRenewalApiException(error) as ApiException;

  return {
    status: answer.getStatus(),
    body: answer.getResponse() as { code: string; details?: Record<string, unknown> },
  };
};

/** `RENEWAL_REQUEST.ALREADY_REQUESTED` names the request that already waits, so the client can open it (E3a, B3 row 2). */
describe('RENEWAL_REQUEST.ALREADY_REQUESTED details', () => {
  it('says the request that waits, and stays 409', () => {
    const { status, body } = answerOf(new RenewalRequestRefusedError('ALREADY_REQUESTED', null, 'r-1'));

    expect(status).toBe(HttpStatus.CONFLICT);
    expect(body.code).toBe('RENEWAL_REQUEST.ALREADY_REQUESTED');
    expect(body.details).toEqual({ requestId: 'r-1' });
  });

  it('says nothing about a request when the error does not know it', () => {
    const { status, body } = answerOf(new RenewalRequestRefusedError('ALREADY_REQUESTED'));

    expect(status).toBe(HttpStatus.CONFLICT);
    expect(body).not.toHaveProperty('details');
  });

  it('keeps the reason of the refusals that have one', () => {
    const { status, body } = answerOf(new RenewalRequestRefusedError('ASSIGNMENT_NOT_RENEWABLE', 'NOT_OPEN'));

    expect(status).toBe(HttpStatus.CONFLICT);
    expect(body.details).toEqual({ reason: 'NOT_OPEN' });
  });
});
