import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { FinanceSetupIncompleteError } from '../../organization/public/organization.errors';
import {
  BudgetCostCenterRequiredError,
  BudgetCurrentExistsError,
  BudgetProposalOpenError,
  BudgetVersionInFlightError,
} from './budget.errors';
import { toBudgetApiException } from './budget.http-errors';

const answerOf = (error: unknown) => {
  const answer = toBudgetApiException(error) as ApiException;

  return {
    status: answer.getStatus(),
    body: answer.getResponse() as { code: string; details?: Record<string, unknown> },
  };
};

/**
 * What the client needs to act on a refused budget write (E3b, B3 rows 6 and 9 to 12): the record that blocks, the department that has no Cost
 * Center, the Cost Centers to choose from. The status and the code are the ones they always had; a value the error does not know is absent.
 */
describe('details of the budget conflicts', () => {
  it('FINANCE.SETUP_INCOMPLETE says the department that has no Cost Center, and stays 409', () => {
    const { status, body } = answerOf(new FinanceSetupIncompleteError('d-1'));

    expect(status).toBe(HttpStatus.CONFLICT);
    expect(body.code).toBe('FINANCE.SETUP_INCOMPLETE');
    expect(body.details).toEqual({ departmentId: 'd-1' });
  });

  it('BUDGET.COST_CENTER_REQUIRED lists the Cost Centers the person answers for, and stays 422', () => {
    const { status, body } = answerOf(new BudgetCostCenterRequiredError(['cc-1', 'cc-2']));

    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(body.code).toBe('BUDGET.COST_CENTER_REQUIRED');
    expect(body.details).toEqual({ costCenterIds: ['cc-1', 'cc-2'] });
  });

  it('BUDGET.COST_CENTER_REQUIRED has no details when the error lists none', () => {
    const { status, body } = answerOf(new BudgetCostCenterRequiredError());

    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(body).not.toHaveProperty('details');
  });

  it.each([
    ['BUDGET.VERSION_IN_FLIGHT', (id?: string) => new BudgetVersionInFlightError(id), { versionId: 'v-1' }],
    ['BUDGET.CURRENT_EXISTS', (id?: string) => new BudgetCurrentExistsError(id), { versionId: 'v-1' }],
    ['BUDGET.PROPOSAL_ALREADY_OPEN', (id?: string) => new BudgetProposalOpenError(id), { proposalId: 'v-1' }],
  ])('%s says the record that blocks, and stays 409', (code, make, details) => {
    const known = answerOf(make('v-1'));
    const unknown = answerOf(make());

    expect(known.status).toBe(HttpStatus.CONFLICT);
    expect(known.body.code).toBe(code);
    expect(known.body.details).toEqual(details);
    // Two writers that meet at the unique index know nobody to name: no details, not an empty value.
    expect(unknown.status).toBe(HttpStatus.CONFLICT);
    expect(unknown.body).not.toHaveProperty('details');
  });
});
