import { HttpStatus } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { BudgetProposalOpenError, BudgetVersionInFlightError } from './budget.errors';
import { toBudgetApiException } from './budget.http-errors';

/** What PostgreSQL answers through Prisma when a partial unique index stops the second of two concurrent writers. */
const uniqueViolation = (index: string) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: index },
  });

const answer = (error: unknown) => {
  const mapped = toBudgetApiException(error);
  if (!(mapped instanceof ApiException)) throw new Error('the mapper let the error through');

  return { status: mapped.getStatus(), body: mapped.getResponse() };
};

/**
 * One code, one message (Owner, Prompt 02, 26/10/2026): the writer that loses the race at the unique index answers exactly
 * what the check before it answers, so the contract shows a single message for each of these codes.
 */
describe('toBudgetApiException: the loser of a race answers as the check does', () => {
  it('a second open proposal of the Cost Center and year is BUDGET.PROPOSAL_ALREADY_OPEN with the message of the check', () => {
    expect(answer(uniqueViolation('budget_proposals_open_key'))).toEqual(answer(new BudgetProposalOpenError()));
    expect(answer(new BudgetProposalOpenError()).status).toBe(HttpStatus.CONFLICT);
  });

  it.each(['budget_versions_in_flight_key', 'budget_versions_cost_center_id_year_number_key'])(
    'a second version in progress (%s) is BUDGET.VERSION_IN_FLIGHT with the message of the check',
    (index) => {
      expect(answer(uniqueViolation(index))).toEqual(answer(new BudgetVersionInFlightError()));
      expect(answer(new BudgetVersionInFlightError()).body).toEqual({
        code: 'BUDGET.VERSION_IN_FLIGHT',
        message: 'The Cost Center already has a version for this year that is not decided.',
      });
    },
  );
});
