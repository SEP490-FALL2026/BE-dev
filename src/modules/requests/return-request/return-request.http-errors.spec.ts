import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { ReturnRequestRefusedError } from './return-request.errors';
import { toReturnApiException } from './return-request.http-errors';

const answerOf = (error: unknown) => {
  const answer = toReturnApiException(error) as ApiException;

  return {
    status: answer.getStatus(),
    body: answer.getResponse() as { code: string; details?: Record<string, unknown> },
  };
};

/** The two 409 of a return that another request blocks name that request, so the client can open it (E3a, B3 rows 3 and 4). */
describe('RETURN_REQUEST blocking request details', () => {
  it.each(['ALREADY_REQUESTED', 'RENEWAL_PENDING'] as const)(
    '%s says the request that blocks, and stays 409',
    (reason) => {
      const { status, body } = answerOf(new ReturnRequestRefusedError(reason, null, 'r-1'));

      expect(status).toBe(HttpStatus.CONFLICT);
      expect(body.code).toBe(`RETURN_REQUEST.${reason}`);
      expect(body.details).toEqual({ requestId: 'r-1' });
    },
  );

  it.each(['ALREADY_REQUESTED', 'RENEWAL_PENDING'] as const)(
    '%s says nothing about a request the error does not know',
    (reason) => {
      const { status, body } = answerOf(new ReturnRequestRefusedError(reason));

      expect(status).toBe(HttpStatus.CONFLICT);
      expect(body).not.toHaveProperty('details');
    },
  );

  it('keeps the reason of the refusals that have one', () => {
    const { status, body } = answerOf(new ReturnRequestRefusedError('ASSIGNMENT_NOT_RETURNABLE', 'NOT_OPEN'));

    expect(status).toBe(HttpStatus.CONFLICT);
    expect(body.details).toEqual({ reason: 'NOT_OPEN' });
  });
});
