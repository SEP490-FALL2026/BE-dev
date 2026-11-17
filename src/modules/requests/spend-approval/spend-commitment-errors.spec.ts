import { BudgetCommitmentExistsError, BudgetCommitmentNotHoldableError } from '../../budgets/public/budgets.errors';
import { toGroupRequestApiException } from '../group-request/group-request.http-errors';
import { toSpendApiException } from '../spend/spend.http-errors';

type Mapped = { getStatus(): number; getResponse(): unknown };

describe('FX-T1: commitment errors of budgets answer 409 on a spend decision, not 500', () => {
  const holdable = () => new BudgetCommitmentNotHoldableError('NO_APPROVED_BUDGET', 2026);
  const exists = () => new BudgetCommitmentExistsError(2026);

  it('maps BudgetCommitmentNotHoldableError to 409 BUDGET.COMMITMENT_NOT_HOLDABLE with reason and year', () => {
    const mapped = toSpendApiException(holdable()) as Mapped;

    expect(mapped.getStatus()).toBe(409);
    expect(mapped.getResponse()).toMatchObject({
      code: 'BUDGET.COMMITMENT_NOT_HOLDABLE',
      details: { reason: 'NO_APPROVED_BUDGET', year: 2026 },
    });
  });

  it('leaves the year out of the details when the refusal has none', () => {
    const mapped = toSpendApiException(new BudgetCommitmentNotHoldableError('MORE_THAN_ONE_YEAR')) as Mapped;

    expect(mapped.getStatus()).toBe(409);
    expect((mapped.getResponse() as { details: unknown }).details).toEqual({ reason: 'MORE_THAN_ONE_YEAR' });
  });

  it('maps BudgetCommitmentExistsError to 409 BUDGET.COMMITMENT_EXISTS with the year', () => {
    const mapped = toSpendApiException(exists()) as Mapped;

    expect(mapped.getStatus()).toBe(409);
    expect(mapped.getResponse()).toMatchObject({ code: 'BUDGET.COMMITMENT_EXISTS', details: { year: 2026 } });
  });

  it('gives the same answers through the mapper of the group request', () => {
    const notHoldable = toGroupRequestApiException(holdable()) as Mapped;
    const taken = toGroupRequestApiException(exists()) as Mapped;

    expect(notHoldable.getStatus()).toBe(409);
    expect(notHoldable.getResponse()).toMatchObject({
      code: 'BUDGET.COMMITMENT_NOT_HOLDABLE',
      details: { reason: 'NO_APPROVED_BUDGET', year: 2026 },
    });
    expect(taken.getStatus()).toBe(409);
    expect(taken.getResponse()).toMatchObject({ code: 'BUDGET.COMMITMENT_EXISTS', details: { year: 2026 } });
  });
});
