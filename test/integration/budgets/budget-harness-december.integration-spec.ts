import { pretendBusinessToday } from '../../support/pretend-today';
import { SpendHarness } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

/**
 * FIX-LB4 MG-01: the cycle the harness opens for the running year must outlive every day a suite can run on. A head sends `BM-10` only
 * while the cycle is open and the cycle locks from the day after its submission deadline (`QĐ-111z`), so a deadline of 1 December made every
 * `budgetFor`/`approvedBudget` of the running year answer 409 `BUDGET_CYCLE.LOCKED` from 2 December on, whatever suite stood on it.
 */
describe('the budget a suite stands on late in December (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await h.start();
    await h.withApprover();
  }, 240000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await h.stop();
  });

  it('opens the cycle of the running year with deadlines no day of that year is behind', async () => {
    const { rows } = await h.ctx.sql.query<{ submission: string; decision: string }>(
      `SELECT to_char(submission_deadline, 'YYYY-MM-DD') AS submission, to_char(decision_deadline, 'YYYY-MM-DD') AS decision
         FROM budget_cycles WHERE year = $1`,
      [h.year],
    );

    expect(rows).toEqual([{ submission: `${h.year}-12-31`, decision: `${h.year}-12-31` }]);
  });

  it('approves a budget of the running year on the 20th of December', async () => {
    // The department is made on the real day (a head cannot be assigned from a day in the past of the pretended one).
    const unit = await h.departmentWithHead('P-DEC');
    const day = pretendBusinessToday(h.ctx.app, `${h.year}-12-20`);
    try {
      const version = await h.budgetFor(unit, { total: 100 * M });

      expect(version.state).toBe('APPROVED');
      expect(version.year).toBe(h.year);
    } finally {
      day.mockRestore();
    }
  });
});
