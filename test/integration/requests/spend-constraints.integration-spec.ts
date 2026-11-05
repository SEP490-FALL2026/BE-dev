import { randomUUID } from 'node:crypto';
import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const CHECK = '23514';
const UNIQUE = '23505';
const RESTRICT = '23001';

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await h.ctx.sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('the check and the review (integration, PostgreSQL constraints)', () => {
  let unit: Unit;
  let plan: string;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    unit = await h.departmentWithHead('P-SC');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A request that waits in the queue, attached to nothing: the head approved it as "outside the plan" and that is cleared. */
  const request = async () => {
    const id = await h.paidRequest(unit, plan, { amount: 1_000_000 });
    await h.ctx.sql.query(`UPDATE access_requests SET off_plan = false WHERE id = $1`, [id]);

    return id;
  };

  const insert = async (table: string, row: Record<string, unknown>, casts: Record<string, string> = {}) => {
    const columns = Object.keys(row);
    const state = await sqlState(
      `INSERT INTO ${table} (${columns.join(', ')})
       VALUES (${columns.map((column, index) => `$${index + 1}${casts[column] ? `::"${casts[column]}"` : ''}`).join(', ')})`,
      columns.map((column) => row[column]),
    );

    return state;
  };

  const checkRow = (requestId: string, over: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    organization_id: h.seed.organizationId,
    request_id: requestId,
    number: 1,
    trigger: 'SUBMISSION',
    route: 'SPEND_APPROVAL',
    stale_cost_evidence: false,
    plan_line_overdue: false,
    period_closed: false,
    off_plan: false,
    currency: 'VND',
    binding_total_minor: 100,
    ...over,
  });
  const checkCasts = { trigger: 'BudgetCheckTrigger', route: 'BudgetCheckRoute' };
  const made = async (over: Record<string, unknown> = {}) => {
    const requestId = await request();
    const row = checkRow(requestId, over);

    return { requestId, row, state: await insert('request_budget_checks', row, checkCasts) };
  };

  describe('a check (US-06-12)', () => {
    it('takes a check for each route when what it says fits it', async () => {
      expect((await made()).state).toBeNull();
      expect((await made({ route: 'FINANCE_REVIEW', plan_line_overdue: true })).state).toBeNull();
      expect((await made({ route: 'BLOCKED', stale_cost_evidence: true })).state).toBeNull();
      expect((await made({ route: 'BLOCKED', period_closed: true })).state).toBeNull();
    });

    it.each([
      ['a problem with the data that goes somewhere', { route: 'FINANCE_REVIEW', stale_cost_evidence: true }],
      ['a year that has ended that goes to the approver', { period_closed: true }],
      ['a stop with nothing wrong with the data', { route: 'BLOCKED' }],
      ['a plan line that is overdue that goes straight to the approver', { plan_line_overdue: true }],
      ['a number of nothing', { number: 0 }],
      ['a total below nothing', { binding_total_minor: -1 }],
    ])('refuses %s', async (_name, over) => {
      expect((await made(over)).state).toBe(CHECK);
    });

    it('takes one check of a number for a request', async () => {
      const first = await made();

      expect(await insert('request_budget_checks', checkRow(first.requestId, { id: randomUUID() }), checkCasts)).toBe(
        UNIQUE,
      );
      expect(
        await insert('request_budget_checks', checkRow(first.requestId, { id: randomUUID(), number: 2 }), checkCasts),
      ).toBeNull();
    });

    it('is never changed or deleted, by update, delete or truncate', async () => {
      const { row } = await made();

      expect(await sqlState(`UPDATE request_budget_checks SET off_plan = true WHERE id = $1`, [row.id])).toBe(RESTRICT);
      expect(await sqlState(`DELETE FROM request_budget_checks WHERE id = $1`, [row.id])).toBe(RESTRICT);
      expect(await sqlState(`TRUNCATE request_budget_checks CASCADE`)).toBe(RESTRICT);
    });
  });

  describe('the years of a check (US-06-12 AC-5, AC-7, AC-15)', () => {
    const year = (checkId: string, over: Record<string, unknown> = {}) => ({
      check_id: checkId,
      year: 2026,
      cost_minor: 100,
      code: 'BUDGET_OK',
      version_id: randomUUID(),
      budget_minor: 1000,
      held_minor: 0,
      spent_minor: 0,
      remaining_minor: 1000,
      share_basis_points: 1000,
      ...over,
    });
    const years = { code: 'BudgetYearCode' };

    it('takes a year with a budget, a year with none and a year that has ended, each with what fits it', async () => {
      const { row } = await made();
      // A version of the budget is needed for the first: made through the real routes.
      const version = await h.budgetFor(unit, { total: 1_000_000, year: 2026 });

      expect(await insert('request_budget_check_years', year(row.id, { version_id: version.id }), years)).toBeNull();
      expect(
        await insert(
          'request_budget_check_years',
          year(row.id, {
            year: 2027,
            code: 'NO_ACTIVE_BUDGET',
            version_id: null,
            budget_minor: null,
            held_minor: null,
            spent_minor: null,
            remaining_minor: null,
            share_basis_points: null,
          }),
          years,
        ),
      ).toBeNull();
      expect(
        await insert(
          'request_budget_check_years',
          year(row.id, {
            year: 2025,
            code: null,
            version_id: null,
            budget_minor: null,
            held_minor: null,
            spent_minor: null,
            remaining_minor: null,
            share_basis_points: null,
          }),
          years,
        ),
      ).toBeNull();
    });

    it.each([
      ['a year with a code and no budget figures', { remaining_minor: null }],
      ['a year with no budget that carries a budget', { code: 'NO_ACTIVE_BUDGET' }],
      ['a year with no code that carries a figure', { code: null }],
      ['a year that is not a year', { year: 26 }],
      ['a cost below nothing', { cost_minor: -1 }],
      ['a share below nothing', { share_basis_points: -1 }],
    ])('refuses %s', async (_name, over) => {
      const { row } = await made();

      expect(await insert('request_budget_check_years', year(row.id, over), years)).toBe(CHECK);
    });

    it('takes one row for a year of a check, and is never changed', async () => {
      const { row } = await made();
      const version = await h.budgetFor(unit, { total: 1_000_000, year: 2028 });
      await insert('request_budget_check_years', year(row.id, { year: 2028, version_id: version.id }), years);

      expect(
        await insert('request_budget_check_years', year(row.id, { year: 2028, version_id: version.id }), years),
      ).toBe(UNIQUE);
      expect(await sqlState(`UPDATE request_budget_check_years SET cost_minor = 1 WHERE check_id = $1`, [row.id])).toBe(
        RESTRICT,
      );
      expect(await sqlState(`DELETE FROM request_budget_check_years WHERE check_id = $1`, [row.id])).toBe(RESTRICT);
    });
  });

  describe('how a review ended (US-06-13 AC-3)', () => {
    const reviewRow = async (outcome: string, over: Record<string, unknown> = {}) => {
      const { requestId, row } = await made({ route: 'FINANCE_REVIEW', plan_line_overdue: true });
      const step = await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO access_request_steps (id, request_id, kind, sequence, state, assignee_employee_id, routing_row, sla_working_days, assigned_at, decided_at)
         VALUES (gen_random_uuid(), $1, 'FINANCE_REVIEW', 5, 'COMPLETED', $2, 9, 2, now(), now()) RETURNING id`,
        [requestId, h.finance.employeeId],
      );

      return {
        requestId,
        row: {
          step_id: step.rows[0].id,
          request_id: requestId,
          check_id: row.id,
          outcome,
          decided_by_employee_id: h.finance.employeeId,
          decided_at: new Date(),
          ...over,
        },
      };
    };
    const casts = { outcome: 'FinanceReviewOutcome', direction: 'FinanceDirection' };

    it('takes an opinion with its direction, and the other outcomes with their reason', async () => {
      const opinion = await reviewRow('ASSESSED', { opinion: 'Fine', direction: 'RECOMMEND_APPROVE' });
      const given = await reviewRow('RETURNED_TO_HEAD', { reason: 'Reduce it' });
      const budget = await reviewRow('BUDGET_REVISION_NEEDED', { reason: 'Make one' });
      const moved = await reviewRow('LINE_UPDATED', { reason: 'Moved' });

      for (const { row } of [opinion, given, budget, moved]) {
        expect(await insert('request_finance_reviews', row, casts)).toBeNull();
      }
    });

    it.each([
      ['an opinion with no text', 'ASSESSED', { direction: 'RECOMMEND_APPROVE' }],
      ['an opinion with a blank text', 'ASSESSED', { opinion: '  ', direction: 'RECOMMEND_APPROVE' }],
      ['an opinion with no direction', 'ASSESSED', { opinion: 'Fine' }],
      ['an opinion with a reason', 'ASSESSED', { opinion: 'Fine', direction: 'RECOMMEND_APPROVE', reason: 'x' }],
      ['a give-back with no reason', 'RETURNED_TO_HEAD', {}],
      ['a give-back with a blank reason', 'RETURNED_TO_HEAD', { reason: ' ' }],
      ['a give-back that advises', 'RETURNED_TO_HEAD', { reason: 'x', direction: 'RECOMMEND_REJECT' }],
      ['a budget asked for with no reason', 'BUDGET_REVISION_NEEDED', {}],
      ['a line moved with an opinion', 'LINE_UPDATED', { reason: 'x', opinion: 'Fine' }],
    ])('refuses %s', async (_name, outcome, over) => {
      const { row } = await reviewRow(outcome, over);

      expect(await insert('request_finance_reviews', row, casts)).toBe(CHECK);
    });

    it('is kept once for a step and never changed', async () => {
      const { row } = await reviewRow('RETURNED_TO_HEAD', { reason: 'Reduce it' });
      await insert('request_finance_reviews', row, casts);

      expect(await insert('request_finance_reviews', row, casts)).toBe(UNIQUE);
      expect(await sqlState(`UPDATE request_finance_reviews SET reason = 'x' WHERE step_id = $1`, [row.step_id])).toBe(
        RESTRICT,
      );
      expect(await sqlState(`DELETE FROM request_finance_reviews WHERE step_id = $1`, [row.step_id])).toBe(RESTRICT);
      expect(await sqlState(`TRUNCATE request_finance_reviews`)).toBe(RESTRICT);
    });
  });

  describe('the steps of a request that costs money', () => {
    const step = async (requestId: string, kind: string, state: string, over: Record<string, unknown> = {}) => {
      const row = {
        id: randomUUID(),
        request_id: requestId,
        kind,
        sequence: 10 + Math.floor(Math.random() * 100000),
        state,
        routing_row: 9,
        sla_working_days: 2,
        ...over,
      };

      return insert('access_request_steps', row, { kind: 'AccessRequestStepKind', state: 'AccessRequestStepState' });
    };
    const held = (over: Record<string, unknown> = {}) => ({
      assignee_employee_id: h.finance.employeeId,
      assigned_at: new Date(),
      decided_at: new Date(),
      ...over,
    });

    it('takes a completed step that somebody held, and a closed one that nobody did', async () => {
      const id = await request();

      expect(await step(id, 'FINANCE_REVIEW', 'COMPLETED', held())).toBeNull();
      expect(await step(id, 'SPEND_APPROVAL', 'CLOSED', { decided_at: new Date() })).toBeNull();
    });

    it.each([
      ['a completed step that nobody held', 'COMPLETED', { decided_at: new Date() }],
      ['a completed step with no time of ending', 'COMPLETED', { assignee_employee_id: null, assigned_at: null }],
      [
        'a closed step that has a holder and no time of being given',
        'CLOSED',
        { assignee_employee_id: '$finance', decided_at: new Date() },
      ],
      ['a closed step with no time of ending', 'CLOSED', {}],
    ])('refuses %s', async (_name, state, over) => {
      const id = await request();
      const values = Object.fromEntries(
        Object.entries(over).map(([key, value]) => [key, value === '$finance' ? h.finance.employeeId : value]),
      );

      expect(await step(id, 'FINANCE_REVIEW', state, values)).toBe(CHECK);
    });

    it('takes one review and one spend step open for a request, and as many as it needs once they are ended', async () => {
      const id = await request();
      const open = (kind: string) => step(id, kind, 'WAITING', { waiting_reason: 'NO_FINANCE_REVIEWER' });

      expect(await open('FINANCE_REVIEW')).toBeNull();
      expect(await open('FINANCE_REVIEW')).toBe(UNIQUE);
      expect(await open('SPEND_APPROVAL')).toBeNull();
      expect(await open('SPEND_APPROVAL')).toBe(UNIQUE);
      expect(await step(id, 'FINANCE_REVIEW', 'COMPLETED', held())).toBeNull();
      expect(await step(id, 'SPEND_APPROVAL', 'CLOSED', { decided_at: new Date() })).toBeNull();
    });
  });

  describe('the line a request is attached to (US-05-04 AC-12, AC-13)', () => {
    const update = async (set: string, values: unknown[] = []) => {
      const id = await request();

      return sqlState(`UPDATE access_requests SET ${set} WHERE id = $1`, [id, ...values]);
    };

    it('takes a line with its position, a line confirmed, and a request outside the plan', async () => {
      expect(await update('plan_line_version_id = $2, plan_line_position = 1', [randomUUID()])).toBeNull();
      expect(
        await update('plan_line_version_id = $2, plan_line_position = 3, plan_line_confirmed = true', [randomUUID()]),
      ).toBeNull();
      expect(await update('off_plan = true')).toBeNull();
    });

    it.each([
      ['a version with no position', 'plan_line_version_id = $2', [randomUUID()]],
      ['a position with no version', 'plan_line_position = 1', []],
      ['a position of nothing', 'plan_line_version_id = $2, plan_line_position = 0', [randomUUID()]],
      [
        'a request outside the plan that is attached to a line',
        'off_plan = true, plan_line_version_id = $2, plan_line_position = 1',
        [randomUUID()],
      ],
      ['a line confirmed that is not there', 'plan_line_confirmed = true', []],
    ])('refuses %s', async (_name, set, values) => {
      expect(await update(set, values)).toBe(CHECK);
    });
  });

  describe('the threshold of a version (US-06-12 AC-3)', () => {
    it('takes none or an amount, and refuses an amount of nothing', async () => {
      const version = await h.budgetFor(unit, { total: 1_000_000, year: 2029 });

      expect(
        await sqlState(`UPDATE budget_versions SET high_value_amount_minor = NULL WHERE id = $1`, [version.id]),
      ).toBeNull();
      expect(
        await sqlState(`UPDATE budget_versions SET high_value_amount_minor = 1 WHERE id = $1`, [version.id]),
      ).toBeNull();
      expect(await sqlState(`UPDATE budget_versions SET high_value_amount_minor = 0 WHERE id = $1`, [version.id])).toBe(
        CHECK,
      );
    });
  });
});
