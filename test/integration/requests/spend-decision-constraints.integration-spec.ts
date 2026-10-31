import { randomUUID } from 'node:crypto';
import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const CHECK = '23514';
const UNIQUE = '23505';
const FOREIGN_KEY = '23503';
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

describe('the decision of the spending approver (integration, PostgreSQL constraints)', () => {
  let unit: Unit;
  let plan: string;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    unit = await h.departmentWithHead('P-DC');
    await h.budgetFor(unit, { total: 1_000_000_000 });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A request waiting for the approver, with the step and the snapshot a decision is written against. */
  const waiting = async () => {
    const id = await h.waitingForApprover(unit, plan, { amount: 1_000_000 });
    const step = await h.ctx.sql.query<{ id: string }>(
      `SELECT id FROM access_request_steps WHERE request_id = $1 AND kind = 'SPEND_APPROVAL'`,
      [id],
    );
    const check = await h.ctx.sql.query<{ id: string }>(
      `SELECT id FROM request_budget_checks WHERE request_id = $1 ORDER BY number DESC LIMIT 1`,
      [id],
    );

    return { id, stepId: step.rows[0].id, checkId: check.rows[0].id };
  };
  const decision = async (over: Record<string, unknown> = {}) => {
    const { id, stepId, checkId } = await waiting();
    const row = {
      step_id: stepId,
      request_id: id,
      check_id: checkId,
      decision: 'APPROVED',
      override_reason: null,
      override_years: [],
      decided_by_employee_id: h.boss.employeeId,
      decided_at: new Date(),
      ...over,
    };
    const columns = Object.keys(row);
    const state = await sqlState(
      `INSERT INTO spend_decisions (${columns.join(', ')})
       VALUES (${columns.map((column, index) => `$${index + 1}${column === 'decision' ? '::"ApprovalDecision"' : column === 'override_years' ? '::integer[]' : ''}`).join(', ')})`,
      columns.map((column) => (row as Record<string, unknown>)[column]),
    );

    return { state, stepId, requestId: id };
  };

  it('takes an approval with its snapshot, one with an override, and a refusal', async () => {
    expect((await decision()).state).toBeNull();
    expect((await decision({ override_reason: 'Accepted', override_years: [2026, 2027] })).state).toBeNull();
    expect((await decision({ decision: 'REJECTED', check_id: null })).state).toBeNull();
  });

  it.each([
    ['an approval with no snapshot', { check_id: null }],
    ['a refusal that accepts an exception', { decision: 'REJECTED', override_reason: 'Why', override_years: [2026] }],
    ['an override with years and no reason', { override_years: [2026] }],
    ['an override with a reason and no years', { override_reason: 'Why' }],
    ['an override with a blank reason', { override_reason: ' ', override_years: [2026] }],
  ])('refuses %s', async (_name, over) => {
    expect((await decision(over)).state).toBe(CHECK);
  });

  it('is kept once for a step and never changed or deleted', async () => {
    const { state, stepId, requestId } = await decision();
    expect(state).toBeNull();

    expect(
      await sqlState(
        `INSERT INTO spend_decisions (step_id, request_id, decision, decided_by_employee_id, decided_at) VALUES ($1, $2, 'REJECTED', $3, now())`,
        [stepId, requestId, h.boss.employeeId],
      ),
    ).toBe(UNIQUE);
    expect(await sqlState(`UPDATE spend_decisions SET override_reason = 'x' WHERE step_id = $1`, [stepId])).toBe(
      RESTRICT,
    );
    expect(await sqlState(`DELETE FROM spend_decisions WHERE step_id = $1`, [stepId])).toBe(RESTRICT);
    expect(await sqlState(`TRUNCATE spend_decisions`)).toBe(RESTRICT);
  });

  describe('what the others that wait cost, on the year of a check', () => {
    const year = async (over: Record<string, unknown>) => {
      const { checkId } = await waiting();
      const row = {
        check_id: checkId,
        year: 2040,
        cost_minor: 1,
        code: null,
        version_id: null,
        budget_minor: null,
        held_minor: null,
        spent_minor: null,
        remaining_minor: null,
        share_basis_points: null,
        pending_minor: null,
        ...over,
      };
      const columns = Object.keys(row);

      return sqlState(
        `INSERT INTO request_budget_check_years (${columns.join(', ')})
         VALUES (${columns.map((column, index) => `$${index + 1}${column === 'code' ? '::"BudgetYearCode"' : ''}`).join(', ')})`,
        columns.map((column) => (row as Record<string, unknown>)[column]),
      );
    };

    it('takes a number for a year that is judged, and none for a year that has ended', async () => {
      expect(await year({ code: 'NO_ACTIVE_BUDGET', pending_minor: 5 })).toBeNull();
      expect(await year({})).toBeNull();
    });

    it('refuses a number for a year that has ended, and a number below nothing', async () => {
      expect(await year({ pending_minor: 5 })).toBe(CHECK);
      expect(await year({ code: 'NO_ACTIVE_BUDGET', pending_minor: -1 })).toBe(CHECK);
    });
  });

  describe('who decided a version of the budget (US-06-08 AC-11)', () => {
    const insert = (role: string) =>
      sqlState(
        `INSERT INTO budget_version_decisions (id, organization_id, version_id, decision, decided_by_employee_id, decider_role, total_minor, currency, decided_at)
         VALUES (gen_random_uuid(), $1, $2, 'APPROVED'::"BudgetDecision", $3, $4, 100, 'VND', now())`,
        [h.seed.organizationId, randomUUID(), h.boss.employeeId, role],
      );

    it('is the approver or the substitute, and nobody else', async () => {
      // A version that does not exist is refused by the key, after the role was found good.
      expect(await insert('SPENDING_APPROVER')).toBe(FOREIGN_KEY);
      expect(await insert('CONFLICT_SUBSTITUTE')).toBe(FOREIGN_KEY);
      expect(await insert('FINANCE')).toBe(CHECK);
    });
  });
});
