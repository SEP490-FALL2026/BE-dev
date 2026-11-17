import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../infrastructure/http/errors/api.exception';
import { AssignmentConflictError } from './public/licensing.errors';
import { toLicensingApiException } from './licensing.http-errors';

const answerOf = (error: unknown) => {
  const answer = toLicensingApiException(error) as ApiException;

  return {
    status: answer.getStatus(),
    body: answer.getResponse() as { code: string; details?: Record<string, unknown> },
  };
};

/**
 * `LICENSE_ASSIGNMENT.OVERLAP` and `LICENSE_ASSIGNMENT.IDENTIFIER_IN_USE` open the seat that blocks when the error knows it (E3c, B3 rows 14
 * and 15). The database says only that two periods overlap, so a site that did not look the seat up leaves the details out.
 */
describe('details of the license assignment conflicts', () => {
  it.each([
    ['OVERLAP', 'LICENSE_ASSIGNMENT.OVERLAP'],
    ['IDENTIFIER_IN_USE', 'LICENSE_ASSIGNMENT.IDENTIFIER_IN_USE'],
  ] as const)('%s says the seat that blocks when it is known, and stays 422', (conflict, code) => {
    const { status, body } = answerOf(new AssignmentConflictError(conflict, 0, undefined, 'a-1'));

    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(body.code).toBe(code);
    expect(body.details).toEqual({ conflictingAssignmentId: 'a-1' });
  });

  it.each([
    ['OVERLAP', 'LICENSE_ASSIGNMENT.OVERLAP'],
    ['IDENTIFIER_IN_USE', 'LICENSE_ASSIGNMENT.IDENTIFIER_IN_USE'],
  ] as const)('%s has no details, and no empty key, when the seat is not known', (conflict, code) => {
    const { status, body } = answerOf(new AssignmentConflictError(conflict, 0));

    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(body.code).toBe(code);
    expect(body).not.toHaveProperty('details');
  });

  it('leaves the details of the other conflicts as they were', () => {
    const capacity = answerOf(new AssignmentConflictError('SEAT_CAPACITY', 0, 2));
    const ended = answerOf(new AssignmentConflictError('EXPECTED_END_REQUIRED', 0, undefined, 'a-1'));

    expect(capacity.status).toBe(HttpStatus.CONFLICT);
    expect(capacity.body.details).toEqual({ freeSeatsInPool: 2 });
    expect(ended.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(ended.body).not.toHaveProperty('details');
  });
});
