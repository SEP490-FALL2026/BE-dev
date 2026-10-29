import { HttpStatus } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { FinanceSetupIncompleteError } from '../../organization/public/organization.errors';
import {
  BudgetDepartmentHasNoHeadError,
  BudgetNotAHistoryReaderError,
  BudgetNotFinanceError,
  BudgetPlanNotFoundError,
  BudgetProposalOpenError,
  BudgetProposalStateError,
  BudgetReasonRequiredError,
  BudgetVersionInFlightError,
  BudgetVersionNumberTakenError,
} from './budget.errors';
import { toBudgetApiException } from './budget.http-errors';

/** What PostgreSQL answers through Prisma when a partial unique index stops the second of two concurrent writers. */
const uniqueViolation = (index: string) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: index },
  });

/**
 * What the pg adapter hands Prisma for a unique violation (`@prisma/adapter-pg`, `convertDriverError`): the message of the driver, which
 * names the index, and the columns read from the detail of the error. Either may be all a handler has, so each case gives one or both.
 */
const adapterViolation = (input: { index?: string; fields?: string[] }) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: {
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: '23505',
          originalMessage: input.index
            ? `duplicate key value violates unique constraint "${input.index}"`
            : 'duplicate key value',
          kind: 'UniqueConstraintViolation',
          ...(input.fields ? { constraint: { fields: input.fields } } : {}),
        },
      },
    },
  });

/** What PostgreSQL answers through Prisma and the adapter when a trigger of the database refuses with SQLSTATE 23514. */
const guardViolation = (constraint: string) =>
  new Prisma.PrismaClientKnownRequestError('check violation', {
    code: 'P2010',
    clientVersion: 'test',
    meta: { driverAdapterError: { cause: { originalCode: '23514', constraint } } },
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

  it('a second version in progress (budget_versions_in_flight_key) is BUDGET.VERSION_IN_FLIGHT with the message of the check', () => {
    expect(answer(uniqueViolation('budget_versions_in_flight_key'))).toEqual(answer(new BudgetVersionInFlightError()));
    expect(answer(new BudgetVersionInFlightError()).body).toEqual({
      code: 'BUDGET.VERSION_IN_FLIGHT',
      message: 'The Cost Center already has a version for this year that is not decided.',
    });
  });

  it('a second version made from the same refused version is a version in progress', () => {
    expect(answer(uniqueViolation('budget_versions_rejected_predecessor_id_key'))).toEqual(
      answer(new BudgetVersionInFlightError()),
    );
  });

  it('a collision of the number of the next version is BUDGET.VERSION_NUMBER_TAKEN, no longer a version in progress (F39)', () => {
    const lost = answer(uniqueViolation('budget_versions_cost_center_id_year_number_key'));

    expect(lost).toEqual(answer(new BudgetVersionNumberTakenError()));
    expect(lost.status).toBe(HttpStatus.CONFLICT);
    expect((lost.body as { code: string }).code).toBe('BUDGET.VERSION_NUMBER_TAKEN');
  });

  it.each([
    'budget_proposals_succession_guard',
    'budget_proposals_succession_check',
    'budget_proposals_succession_consistent',
  ])('the successor of a proposal refused by the database (%s) is the proposal that is still open', (constraint) => {
    expect(answer(guardViolation(constraint))).toEqual(answer(new BudgetProposalOpenError()));
  });

  it('two successors of one proposal: the loser at the unique index answers the same', () => {
    expect(answer(uniqueViolation('budget_proposals_successor_of_proposal_id_key'))).toEqual(
      answer(new BudgetProposalOpenError()),
    );
  });

  describe('as the pg adapter reports it: the index in the message of the driver, the columns in the constraint (R4 D-4)', () => {
    const COST_CENTER_YEAR = ['cost_center_id', 'year'];

    it.each([
      ['budget_proposals_open_key', new BudgetProposalOpenError()],
      ['budget_versions_in_flight_key', new BudgetVersionInFlightError()],
    ])('the index %s, which shares its columns with others, is told by its name', (index, expected) => {
      expect(answer(adapterViolation({ index, fields: COST_CENTER_YEAR }))).toEqual(answer(expected));
    });

    it('the current version that already exists is told by its name though its columns are those of two other indexes', () => {
      const lost = answer(adapterViolation({ index: 'budget_versions_current_key', fields: COST_CENTER_YEAR }));

      expect((lost.body as { code: string }).code).toBe('BUDGET.CURRENT_EXISTS');
      expect(lost.status).toBe(HttpStatus.CONFLICT);
    });

    it('columns that three indexes share name none of them: the error is not guessed, and passes through', () => {
      const unknown = adapterViolation({ fields: COST_CENTER_YEAR });

      expect(toBudgetApiException(unknown)).toBe(unknown);
    });

    it.each([
      [
        'a second version made from the same refused version',
        ['rejected_predecessor_id'],
        new BudgetVersionInFlightError(),
      ],
      ['a second successor of one proposal', ['successor_of_proposal_id'], new BudgetProposalOpenError()],
      [
        'a collision of the number of the next version',
        [...COST_CENTER_YEAR, 'number'],
        new BudgetVersionNumberTakenError(),
      ],
    ])('%s is told by its columns alone, which only its index has', (_case, fields, expected) => {
      expect(answer(adapterViolation({ fields }))).toEqual(answer(expected));
    });

    it('is told the same by the name of the index alone', () => {
      expect(answer(adapterViolation({ index: 'budget_versions_rejected_predecessor_id_key' }))).toEqual(
        answer(new BudgetVersionInFlightError()),
      );
      expect(answer(adapterViolation({ index: 'budget_proposals_successor_of_proposal_id_key' }))).toEqual(
        answer(new BudgetProposalOpenError()),
      );
    });
  });

  it('a version made again from a proposal that is not left reviewed by a refused version is a proposal that does not wait', () => {
    expect(answer(guardViolation('budget_versions_rejected_predecessor_guard'))).toEqual(
      answer(new BudgetProposalStateError('REVIEW', 'REVIEWED')),
    );
  });
});

describe('toBudgetApiException: the answers of the budget lifecycle (F27, F37, F64, F66, F13)', () => {
  it('a department without a Cost Center in use is the 409 FINANCE.SETUP_INCOMPLETE of the requests', () => {
    expect(answer(new FinanceSetupIncompleteError('d'))).toEqual({
      status: HttpStatus.CONFLICT,
      body: { code: 'FINANCE.SETUP_INCOMPLETE', message: new FinanceSetupIncompleteError('d').message },
    });
  });

  it('a revision for a department nobody heads is the 409 BUDGET.DEPARTMENT_HAS_NO_HEAD', () => {
    expect(answer(new BudgetDepartmentHasNoHeadError('d')).status).toBe(HttpStatus.CONFLICT);
    expect((answer(new BudgetDepartmentHasNoHeadError('d')).body as { code: string }).code).toBe(
      'BUDGET.DEPARTMENT_HAS_NO_HEAD',
    );
  });

  it('a line that names a plan the catalog does not have is the 422 BUDGET.PLAN_NOT_FOUND, naming the plans', () => {
    expect(answer(new BudgetPlanNotFoundError(['p1']))).toEqual({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      body: {
        code: 'BUDGET.PLAN_NOT_FOUND',
        message: 'A line names a plan that does not exist.',
        details: { planIds: ['p1'] },
      },
    });
  });

  it('the reason of a revision that is taken away is the 422 BUDGET.REVISION_REASON_REQUIRED', () => {
    expect(answer(new BudgetReasonRequiredError('REVISION')).status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect((answer(new BudgetReasonRequiredError('REVISION')).body as { code: string }).code).toBe(
      'BUDGET.REVISION_REASON_REQUIRED',
    );
  });

  it('the service refuses what the role guard refuses with the same code and message, and the history is refused as a 403 too', () => {
    const guard = answer(new BudgetNotFinanceError());
    expect(guard).toEqual({
      status: HttpStatus.FORBIDDEN,
      body: { code: 'AUTHORIZATION.FORBIDDEN', message: 'You do not have permission to perform this action.' },
    });
    expect(answer(new BudgetNotAHistoryReaderError()).status).toBe(HttpStatus.FORBIDDEN);
    expect((answer(new BudgetNotAHistoryReaderError()).body as { code: string }).code).toBe('AUTHORIZATION.FORBIDDEN');
  });
});
