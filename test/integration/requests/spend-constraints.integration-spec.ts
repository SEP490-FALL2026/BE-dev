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

describe('the check and the confirmation of the reserve (integration, PostgreSQL constraints)', () => {
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

  /** A request that waits in the queue, attached to nothing. */
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

  /** A check as the three outcomes write it: within the base, with nothing blocking it. */
  const checkRow = (requestId: string, over: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    organization_id: h.seed.organizationId,
    request_id: requestId,
    number: 1,
    trigger: 'SUBMISSION',
    route: 'SPEND_APPROVAL',
    outcome: 'WITHIN_BASE',
    stale_cost_evidence: false,
    plan_line_overdue: false,
    period_closed: false,
    off_plan: false,
    currency: 'VND',
    binding_total_minor: 100,
    ...over,
  });
  const checkCasts = { trigger: 'BudgetCheckTrigger', route: 'BudgetCheckRoute', outcome: 'BudgetCheckOutcome' };
  const made = async (over: Record<string, unknown> = {}) => {
    const requestId = await request();
    const row = checkRow(requestId, over);

    return { requestId, row, state: await insert('request_budget_checks', row, checkCasts) };
  };

  describe('a check (US-06-12, BR-MF1-06g)', () => {
    it('BR-MF1-06g: takes a check for each outcome when what it says fits it', async () => {
      expect((await made()).state).toBeNull();
      expect((await made({ outcome: 'USES_RESERVE', over_base_by_minor: 5 })).state).toBeNull();
      expect(
        (await made({ trigger: 'RESERVE_CONFIRMATION', outcome: 'USES_RESERVE', over_base_by_minor: 1 })).state,
      ).toBeNull();
      expect((await made({ trigger: 'SPEND_DECISION' })).state).toBeNull();
      expect(
        (await made({ route: 'BLOCKED', outcome: 'BLOCKED', block_reasons: ['NO_APPROVED_BUDGET'] })).state,
      ).toBeNull();
      expect(
        (
          await made({
            route: 'BLOCKED',
            outcome: 'BLOCKED',
            block_reasons: ['OVER_RESERVE', 'PRICE_EXPIRED'],
            over_by_minor: 3,
            over_base_by_minor: 8,
            stale_cost_evidence: true,
          })
        ).state,
      ).toBeNull();
    });

    it.each([
      ['no outcome (a new check always has one)', { outcome: null }],
      ['a check that goes to Finance', { route: 'FINANCE_REVIEW' }],
      ['a blocked outcome that goes to the approver', { outcome: 'BLOCKED', block_reasons: ['NO_APPROVED_BUDGET'] }],
      ['a blocked outcome with no reason', { route: 'BLOCKED', outcome: 'BLOCKED' }],
      ['a request within the base with a reason', { block_reasons: ['OVER_RESERVE'], over_by_minor: 1 }],
      ['OVER_RESERVE without how far over', { route: 'BLOCKED', outcome: 'BLOCKED', block_reasons: ['OVER_RESERVE'] }],
      ['how far over the reserve without OVER_RESERVE', { over_by_minor: 1 }],
      [
        'PRICE_EXPIRED without the flag of the stale quote',
        { route: 'BLOCKED', outcome: 'BLOCKED', block_reasons: ['PRICE_EXPIRED'] },
      ],
      ['a reason that is not one', { route: 'BLOCKED', outcome: 'BLOCKED', block_reasons: ['NO_MONEY'] }],
      ['a year that has ended', { period_closed: true }],
      ['a plan line that is overdue', { plan_line_overdue: true }],
      ['a request outside the plan', { off_plan: true }],
      ['a trigger that is retired', { trigger: 'PLAN_LINE_MOVED' }],
      ['a distance over the base of nothing', { over_base_by_minor: 0 }],
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

  describe('the year of a check (US-06-12 AC-5, BR-MF1-06e)', () => {
    const year = (checkId: string, over: Record<string, unknown> = {}) => ({
      check_id: checkId,
      year: 2026,
      cost_minor: 100,
      code: 'BUDGET_OK',
      version_id: randomUUID(),
      budget_minor: 1000,
      base_minor: 900,
      reserve_minor: 100,
      held_minor: 0,
      spent_minor: 0,
      remaining_minor: 1000,
      remaining_base_minor: 900,
      remaining_with_reserve_minor: 1000,
      share_basis_points: 1000,
      ...over,
    });
    const nothing = {
      version_id: null,
      budget_minor: null,
      base_minor: null,
      reserve_minor: null,
      held_minor: null,
      spent_minor: null,
      remaining_minor: null,
      remaining_base_minor: null,
      remaining_with_reserve_minor: null,
      share_basis_points: null,
    };
    const years = { code: 'BudgetYearCode' };

    it('takes a year with an approved version and both levels of what is left, and a year with none', async () => {
      const { row } = await made();
      const version = await h.budgetFor(unit, { total: 1_000_000, year: 2026 });

      expect(await insert('request_budget_check_years', year(row.id, { version_id: version.id }), years)).toBeNull();
      expect(
        await insert(
          'request_budget_check_years',
          year(row.id, { year: 2027, code: 'NO_ACTIVE_BUDGET', ...nothing }),
          years,
        ),
      ).toBeNull();
    });

    it.each([
      ['a year with a code and no budget figures', { remaining_minor: null }],
      ['a year with no budget that carries a budget', { code: 'NO_ACTIVE_BUDGET' }],
      [
        'a year judged now with no base',
        { base_minor: null, reserve_minor: null, remaining_base_minor: null, remaining_with_reserve_minor: null },
      ],
      ['a year with a base and no reserve', { reserve_minor: null }],
      ['a year with a base and no level of what is left', { remaining_base_minor: null }],
      // Not tested: a year with no code at all (a year that has ended). The CHECK `judged` of 20261109140000 passes it, since a NULL code makes
      // the whole condition NULL, which a CHECK accepts; the application never writes it (finding for the migration: add `code IS NOT NULL AND`).
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

  describe('the steps of a request that costs money: Finance has none (QĐ-97c)', () => {
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

    it('QĐ-97c: refuses a new review step of Finance, and takes a closed spend step that nobody held', async () => {
      const id = await request();

      expect(
        await step(id, 'FINANCE_REVIEW', 'COMPLETED', {
          assignee_employee_id: h.finance.employeeId,
          assigned_at: new Date(),
          decided_at: new Date(),
        }),
      ).toBe(CHECK);
      expect(await step(id, 'SPEND_APPROVAL', 'CLOSED', { decided_at: new Date() })).toBeNull();
    });

    it.each([
      ['a completed step that nobody held', 'COMPLETED', { decided_at: new Date() }],
      ['a completed step with no time of ending', 'COMPLETED', { assignee_employee_id: null, assigned_at: null }],
      ['a closed step with no time of ending', 'CLOSED', {}],
    ])('refuses %s', async (_name, state, over) => {
      const id = await request();

      expect(await step(id, 'SPEND_APPROVAL', state, over)).toBe(CHECK);
    });

    it('takes one spend step open for a request, and as many as it needs once they are ended', async () => {
      const id = await request();
      const open = () => step(id, 'SPEND_APPROVAL', 'WAITING', { waiting_reason: 'NO_SPENDING_APPROVER' });

      expect(await open()).toBeNull();
      expect(await open()).toBe(UNIQUE);
      expect(await step(id, 'SPEND_APPROVAL', 'CLOSED', { decided_at: new Date() })).toBeNull();
    });
  });

  describe('what is retired takes nothing new (20261109141000)', () => {
    it('QĐ-97c: refuses a new review of Finance, a new question to Finance and a new state of waiting for Finance', async () => {
      const { requestId, row } = await made();
      const step = await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO access_request_steps (id, request_id, kind, sequence, state, assignee_employee_id, routing_row, sla_working_days, assigned_at, decided_at)
         VALUES (gen_random_uuid(), $1, 'SPEND_APPROVAL', 5, 'COMPLETED', $2, 9, 2, now(), now()) RETURNING id`,
        [requestId, h.boss.employeeId],
      );

      expect(
        await insert(
          'request_finance_reviews',
          {
            step_id: step.rows[0].id,
            request_id: requestId,
            check_id: row.id,
            outcome: 'RETURNED_TO_HEAD',
            reason: 'Reduce it',
            decided_by_employee_id: h.finance.employeeId,
            decided_at: new Date(),
          },
          { outcome: 'FinanceReviewOutcome' },
        ),
      ).toBe(CHECK);
      expect(
        await insert('budget_information_requests', {
          id: randomUUID(),
          request_id: requestId,
          step_id: step.rows[0].id,
          asked_by_employee_id: h.boss.employeeId,
          question: 'Is there room?',
          asked_at: new Date(),
        }),
      ).toBe(CHECK);
      expect(
        await sqlState(`UPDATE access_requests SET state = 'AWAITING_FINANCE_REVIEW' WHERE id = $1`, [requestId]),
      ).toBe(CHECK);
      expect(await sqlState(`UPDATE access_requests SET state = 'AWAITING_BUDGET' WHERE id = $1`, [requestId])).toBe(
        CHECK,
      );
    });

    it('L2-23: refuses an override in a decision, and takes the decision without one', async () => {
      const { requestId, row } = await made();
      const decided = async (over: Record<string, unknown>) => {
        const step = await h.ctx.sql.query<{ id: string }>(
          `INSERT INTO access_request_steps (id, request_id, kind, sequence, state, assignee_employee_id, routing_row, sla_working_days, assigned_at, decided_at)
           VALUES (gen_random_uuid(), $1, 'SPEND_APPROVAL', $2, 'APPROVED', $3, 9, 2, now(), now()) RETURNING id`,
          [requestId, 20 + Math.floor(Math.random() * 100000), h.boss.employeeId],
        );

        return insert(
          'spend_decisions',
          {
            step_id: step.rows[0].id,
            request_id: requestId,
            check_id: row.id,
            decision: 'APPROVED',
            decided_by_employee_id: h.boss.employeeId,
            decided_at: new Date(),
            ...over,
          },
          { decision: 'ApprovalDecision' },
        );
      };

      expect(await decided({})).toBeNull();
      expect(await decided({ override_reason: 'Urgent', override_years: [2026] })).toBe(CHECK);
    });

    it('QĐ-97c: the item of a batch takes the new outcome and the new reasons of a stop, and a stop says why', async () => {
      const batch = await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO spend_batches (id, organization_id, department_id, submitted_by_employee_id)
         VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id`,
        [h.seed.organizationId, unit.department.id, unit.head.employeeId],
      );
      const item = async (position: number, outcome: string, stop: string | null) =>
        sqlState(
          `INSERT INTO spend_batch_items (batch_id, request_id, position, outcome, stop_reason)
           VALUES ($1, $2, $3, $4::"SpendBatchItemOutcome", $5)`,
          [batch.rows[0].id, await request(), position, outcome, stop],
        );

      expect(await item(1, 'AWAITING_RESERVE_CONFIRMATION', null)).toBeNull();
      expect(await item(2, 'AWAITING_RESERVE_CONFIRMATION', 'OVER_RESERVE')).toBe(CHECK);
      expect(await item(3, 'STOPPED', 'OVER_RESERVE')).toBeNull();
      expect(await item(4, 'STOPPED', 'NO_APPROVED_BUDGET')).toBeNull();
      expect(await item(5, 'STOPPED', null)).toBe(CHECK);
    });
  });

  describe('the confirmation of the reserve (BR-MF1-06h, 20261109140000)', () => {
    /** A request with a check that uses the reserve and the spend step it opened. */
    const confirmable = async () => {
      const { requestId, row } = await made({ outcome: 'USES_RESERVE', over_base_by_minor: 5 });
      const step = await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO access_request_steps (id, request_id, kind, sequence, state, assignee_employee_id, routing_row, sla_working_days, assigned_at)
         VALUES (gen_random_uuid(), $1, 'SPEND_APPROVAL', 7, 'PENDING', $2, 9, 2, now()) RETURNING id`,
        [requestId, h.boss.employeeId],
      );

      return { requestId, checkId: row.id, stepId: step.rows[0].id };
    };
    const confirmation = (
      parts: { requestId: string; checkId: string; stepId: string },
      over: Record<string, unknown> = {},
    ) => ({
      id: randomUUID(),
      organization_id: h.seed.organizationId,
      request_id: parts.requestId,
      check_id: parts.checkId,
      spend_step_id: parts.stepId,
      reason: 'Cần cho đợt phát hành',
      confirmed_by_employee_id: unit.head.employeeId,
      ...over,
    });

    it('takes one line of reason of 1 to 500 characters, for one check and one step', async () => {
      const parts = await confirmable();

      expect(await insert('request_reserve_confirmations', confirmation(parts))).toBeNull();
      expect(
        (await h.ctx.sql.query(`SELECT 1 FROM request_reserve_confirmations WHERE spend_step_id = $1`, [parts.stepId]))
          .rowCount,
      ).toBe(1);
    });

    it.each([
      ['an empty reason', ''],
      ['a blank reason', '   '],
      ['a reason of 501 characters', 'x'.repeat(501)],
      ['a reason on two lines', 'one\ntwo'],
      ['a reason with a carriage return', 'one\rtwo'],
    ])('refuses %s', async (_name, reason) => {
      const parts = await confirmable();

      expect(await insert('request_reserve_confirmations', confirmation(parts, { reason }))).toBe(CHECK);
    });

    it('takes a reason of exactly 500 characters', async () => {
      const parts = await confirmable();

      expect(
        await insert('request_reserve_confirmations', confirmation(parts, { reason: 'x'.repeat(500) })),
      ).toBeNull();
    });

    it('is kept once for a check and once for a step', async () => {
      const parts = await confirmable();
      await insert('request_reserve_confirmations', confirmation(parts));
      const other = await confirmable();

      expect(await insert('request_reserve_confirmations', confirmation(parts))).toBe(UNIQUE);
      expect(await insert('request_reserve_confirmations', confirmation({ ...other, checkId: parts.checkId }))).toBe(
        UNIQUE,
      );
      expect(await insert('request_reserve_confirmations', confirmation({ ...other, stepId: parts.stepId }))).toBe(
        UNIQUE,
      );
      expect(await insert('request_reserve_confirmations', confirmation(other))).toBeNull();
    });

    it('is never changed or deleted, by update, delete or truncate (INV-05)', async () => {
      const parts = await confirmable();
      const row = confirmation(parts);
      await insert('request_reserve_confirmations', row);

      expect(await sqlState(`UPDATE request_reserve_confirmations SET reason = 'x' WHERE id = $1`, [row.id])).toBe(
        RESTRICT,
      );
      expect(await sqlState(`DELETE FROM request_reserve_confirmations WHERE id = $1`, [row.id])).toBe(RESTRICT);
      expect(await sqlState(`TRUNCATE request_reserve_confirmations`)).toBe(RESTRICT);
    });
  });

  describe('the line a request is attached to (US-05-04 AC-12, AC-13): the columns stay, nothing writes them', () => {
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

  describe('the threshold of a version (G5-03, RV-15: retired with the high-value lines)', () => {
    it('keeps none, and refuses any amount written again', async () => {
      const version = await h.budgetFor(unit, { total: 1_000_000, year: 2029 });

      expect(
        await sqlState(`UPDATE budget_versions SET high_value_amount_minor = NULL WHERE id = $1`, [version.id]),
      ).toBeNull();
      expect(await sqlState(`UPDATE budget_versions SET high_value_amount_minor = 1 WHERE id = $1`, [version.id])).toBe(
        CHECK,
      );
      expect(await sqlState(`UPDATE budget_versions SET high_value_amount_minor = 0 WHERE id = $1`, [version.id])).toBe(
        CHECK,
      );
    });
  });
});
