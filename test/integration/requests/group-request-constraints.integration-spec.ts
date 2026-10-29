import { randomUUID } from 'node:crypto';
import { Department, Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await h.ctx.sql.query(text, values);

    return null;
  } catch (error) {
    await h.ctx.sql.query('ROLLBACK').catch(() => undefined);

    return (error as { code?: string }).code ?? 'unknown';
  }
}

const CHECK = '23514';
const RESTRICT = '23001';
const OBJECT_STATE = '55000';

describe('what the database refuses for the lines of a group request (g5-group-requests)', () => {
  let department: Department;
  let head: Person;
  let people: Person[];
  let paidPlanId: string;
  let freePlanId: string;
  let currency: string;

  beforeAll(async () => {
    await h.start();
    department = await h.departmentWithUnit('P-GRC');
    head = await h.staff(department, 'GRC-H1');
    people = [];
    for (let index = 1; index <= 3; index += 1) people.push(await h.staff(department, `GRC-E${index}`));
    paidPlanId = await h.planOf(await h.subscription(10));
    freePlanId = await h.plan('K5');
    currency = (await h.ctx.sql.query<{ code: string }>(`SELECT code FROM currencies ORDER BY code LIMIT 1`)).rows[0]
      .code;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  interface Made {
    requestId: string;
    stepId: string;
  }

  /** A request of the type with its need step and one beneficiary per person, written in one transaction (not committed). */
  const makeRequest = async (
    over: { type?: string; branch?: string; planId?: string | null; people?: Person[] } = {},
  ): Promise<Made> => {
    const requestId = randomUUID();
    const stepId = randomUUID();
    const branch = over.branch ?? 'PAID_IN_CATALOG';
    const paid = branch !== 'INTERNAL_FREE';
    await h.ctx.sql.query(
      `INSERT INTO access_requests
         (id, organization_id, type, branch, state, plan_id, requester_employee_id, department_id, cost_center_id,
          business_reason, term_months, policy, created_by_app_user_id, pricing_status, price_missing_reason,
          expected_spend_on, budget_year)
       VALUES ($1, $2, $3::"AccessRequestType", $4::"AccessRequestBranch", 'PENDING', $5, $6, $7, $8, 'Design', 6,
               '{"version":1}'::jsonb, $9, $10::"AccessRequestPricingStatus", $11, $12, $13)`,
      [
        requestId,
        h.seed.organizationId,
        over.type ?? 'GROUP_GRANT',
        branch,
        over.planId === undefined ? paidPlanId : over.planId,
        head.employeeId,
        department.id,
        department.unitId,
        randomUUID(),
        paid ? 'MISSING' : 'NOT_APPLICABLE',
        paid ? 'NO_PRICED_SUBSCRIPTION' : null,
        paid ? '2026-10-24' : null,
        paid ? 2026 : null,
      ],
    );
    await h.ctx.sql.query(
      `INSERT INTO access_request_steps (id, request_id, kind, sequence, state, assignee_employee_id, routing_row, sla_working_days, assigned_at)
       VALUES ($1, $2, 'NEED', 1, 'PENDING', $3, 9, 2, now())`,
      [stepId, requestId, head.employeeId],
    );
    for (const [index, person] of (over.people ?? people).entries()) {
      await h.ctx.sql.query(
        `INSERT INTO access_request_beneficiaries (request_id, employee_id, position) VALUES ($1, $2, $3)`,
        [requestId, person.employeeId, index + 1],
      );
    }

    return { requestId, stepId };
  };

  const insertLine = (made: Made, person: Person, state = 'AWAITING_NEED') =>
    sqlState(
      `INSERT INTO access_request_lines (request_id, employee_id, state, need_step_id) VALUES ($1, $2, $3::"AccessRequestLineState", $4)`,
      [made.requestId, person.employeeId, state, made.stepId],
    );

  /** A committed group request with a line for each person, each in the state given. */
  const committed = async (state = 'AWAITING_NEED', count = 2): Promise<Made> => {
    await h.ctx.sql.query('BEGIN');
    const made = await makeRequest({ people: people.slice(0, count) });
    for (const person of people.slice(0, count)) expect(await insertLine(made, person, state)).toBeNull();
    await h.ctx.sql.query('COMMIT');

    return made;
  };

  const setLine = (made: Made, person: Person, set: string, values: unknown[] = []) =>
    sqlState(`UPDATE access_request_lines SET ${set} WHERE request_id = $1 AND employee_id = $2`, [
      made.requestId,
      person.employeeId,
      ...values,
    ]);
  const advance = (made: Made, person: Person, state: string, extra = '') =>
    setLine(made, person, `state = '${state}'::"AccessRequestLineState"${extra}`);
  const ended = ", ended_at = now(), ended_by_employee_id = (SELECT id FROM employees WHERE employee_code = 'GRC-H1')";

  describe('which request has lines', () => {
    it('takes lines for a request of the type GROUP_GRANT, one for each person, committed together', async () => {
      await committed();
    });

    it('refuses a line of a request of another type', async () => {
      await h.ctx.sql.query('BEGIN');
      const made = await makeRequest({ type: 'GRANT', people: people.slice(0, 1) });

      expect(await insertLine(made, people[0])).toBe(CHECK);
    });

    it.each([
      ['internal software, which has no spend step', { branch: 'INTERNAL_FREE', planId: freePlanId }],
      ['a plan not in the catalog yet', { branch: 'NEW_SOFTWARE', planId: null }],
    ])('refuses a request for a group for %s', async (_name, over) => {
      await h.ctx.sql.query('ROLLBACK').catch(() => undefined);
      await h.ctx.sql.query('BEGIN');
      let state: string | null = null;
      try {
        await makeRequest({ ...over, people: people.slice(0, 1) });
      } catch (error) {
        state = (error as { code?: string }).code ?? 'unknown';
      }
      await h.ctx.sql.query('ROLLBACK');

      expect(state).toBe(CHECK);
    });

    it('refuses a person of a request for a group who has no line when the transaction commits', async () => {
      await h.ctx.sql.query('ROLLBACK').catch(() => undefined);
      await h.ctx.sql.query('BEGIN');
      const made = await makeRequest({ people: people.slice(0, 2) });
      expect(await insertLine(made, people[0])).toBeNull();

      expect(await sqlState('COMMIT')).toBe(CHECK);
    });

    it.each(['AWAITING_IT_CLOSE', 'APPROVED', 'WITHDRAWN'])('refuses a line that begins as %s', async (state) => {
      await h.ctx.sql.query('ROLLBACK').catch(() => undefined);
      await h.ctx.sql.query('BEGIN');
      const made = await makeRequest({ people: people.slice(0, 1) });

      expect(await insertLine(made, people[0], state)).toBe(CHECK);
      await h.ctx.sql.query('ROLLBACK');
    });
  });

  describe('how a line moves', () => {
    it('goes the whole way of a person who is granted', async () => {
      const made = await committed('NEED_CONFIRMED', 1);

      expect(await advance(made, people[0], 'APPROVED')).toBeNull();
      expect(await advance(made, people[0], 'EXECUTING')).toBeNull();
      expect(await advance(made, people[0], 'COMPLETED', ', ended_at = now()')).toBeNull();
    });

    it.each([
      ['awaiting its need to approved', 'AWAITING_NEED', 'APPROVED'],
      ['awaiting its need to executing', 'AWAITING_NEED', 'EXECUTING'],
      ['confirmed to executing', 'NEED_CONFIRMED', 'EXECUTING'],
      ['confirmed back to awaiting its need', 'NEED_CONFIRMED', 'AWAITING_NEED'],
    ])('refuses %s', async (_name, from, to) => {
      const made = await committed(from, 1);

      expect(await advance(made, people[0], to)).toBe(OBJECT_STATE);
    });

    it.each([
      ['rejected as need', 'AWAITING_NEED', 'NEED_REJECTED', "'refused'"],
      ['withdrawn', 'NEED_CONFIRMED', 'WITHDRAWN', 'NULL'],
    ])('never changes a line that ended: %s', async (_name, from, to, reason) => {
      const made = await committed(from, 1);
      const extra = `${ended}, end_reason = ${reason}${to === 'WITHDRAWN' ? ', withdrawal_requested_at = now()' : ''}`;
      expect(await advance(made, people[0], to, extra)).toBeNull();

      expect(await advance(made, people[0], 'NEED_CONFIRMED')).toBe(OBJECT_STATE);
      expect(await setLine(made, people[0], 'end_reason = $3', ['changed'])).toBe(OBJECT_STATE);
    });

    it('never changes who a line is for or the step that holds it, and never deletes it', async () => {
      const made = await committed('AWAITING_NEED', 1);

      expect(await setLine(made, people[0], 'need_step_id = $3', [randomUUID()])).toBe(OBJECT_STATE);
      expect(await setLine(made, people[0], "created_at = now() - interval '1 day'")).toBe(OBJECT_STATE);
      expect(await sqlState(`DELETE FROM access_request_lines WHERE request_id = $1`, [made.requestId])).toBe(
        OBJECT_STATE,
      );
    });
  });

  describe('what a line says of its ending', () => {
    it.each([
      ['an ended state without the moment it ended', "state = 'WITHDRAWN', withdrawal_requested_at = now()"],
      ['a moment of ending on a line that goes on', 'ended_at = now()'],
      ['a blank reason', `end_reason = '  '`],
    ])('refuses %s', async (_name, set) => {
      const made = await committed('NEED_CONFIRMED', 1);

      expect(await setLine(made, people[0], set)).toBe(CHECK);
    });

    it('refuses a refusal without its reason and a withdrawal that names nobody', async () => {
      const made = await committed('AWAITING_NEED', 2);

      expect(await advance(made, people[0], 'NEED_REJECTED', ', ended_at = now(), ended_by_employee_id = NULL')).toBe(
        CHECK,
      );
      expect(await advance(made, people[1], 'NEED_REJECTED', `${ended}, end_reason = NULL`)).toBe(CHECK);
      expect(await advance(made, people[1], 'WITHDRAWN', `${ended}, withdrawal_requested_at = NULL`)).toBe(CHECK);
    });

    it('says when the withdrawal was asked on a line that waits for the IT Admin and on nobody else', async () => {
      const made = await committed('NEED_CONFIRMED', 1);
      await advance(made, people[0], 'APPROVED');
      await advance(made, people[0], 'EXECUTING');

      const asked = ", ended_by_employee_id = (SELECT id FROM employees WHERE employee_code = 'GRC-H1')";

      expect(await advance(made, people[0], 'AWAITING_IT_CLOSE')).toBe(CHECK);
      expect(await advance(made, people[0], 'AWAITING_IT_CLOSE', ', withdrawal_requested_at = now()')).toBe(CHECK);
      expect(
        await advance(made, people[0], 'AWAITING_IT_CLOSE', `, withdrawal_requested_at = now()${asked}`),
      ).toBeNull();
    });
  });

  describe('what was decided for a person', () => {
    const decide = (made: Made, person: Person, stage: string, decision: string, reason: string | null) =>
      sqlState(
        `INSERT INTO access_request_line_decisions
           (request_id, employee_id, stage, step_id, decision, reason, decided_by_employee_id, decider_role, decided_at)
         VALUES ($1, $2, $3::"LineDecisionStage", $4, $5::"ApprovalDecision", $6, $7, 'MANAGER', now())`,
        [made.requestId, person.employeeId, stage, made.stepId, decision, reason, head.employeeId],
      );

    it('takes one decision for a person at each stage, and refuses a second', async () => {
      const made = await committed('AWAITING_NEED', 1);

      expect(await decide(made, people[0], 'NEED', 'APPROVED', null)).toBeNull();
      expect(await decide(made, people[0], 'SPEND', 'APPROVED', null)).toBeNull();
      expect(await decide(made, people[0], 'NEED', 'REJECTED', 'again')).toBe('23505');
    });

    it('refuses a refusal without its reason and a blank reason', async () => {
      const made = await committed('AWAITING_NEED', 1);

      expect(await decide(made, people[0], 'NEED', 'REJECTED', null)).toBe(CHECK);
      expect(await decide(made, people[0], 'NEED', 'REJECTED', '  ')).toBe(CHECK);
    });

    it('never changes or deletes a decision', async () => {
      const made = await committed('AWAITING_NEED', 1);
      await decide(made, people[0], 'NEED', 'APPROVED', null);

      expect(
        await sqlState(`UPDATE access_request_line_decisions SET reason = 'x' WHERE request_id = $1`, [made.requestId]),
      ).toBe(RESTRICT);
      expect(await sqlState(`DELETE FROM access_request_line_decisions WHERE request_id = $1`, [made.requestId])).toBe(
        RESTRICT,
      );
      expect(await sqlState(`TRUNCATE access_request_line_decisions`)).toBe(RESTRICT);
    });
  });

  describe('the share of a person in a commitment', () => {
    const share = (made: Made, person: Person, year: number, amount: number) =>
      sqlState(
        `INSERT INTO access_request_line_amounts (request_id, employee_id, budget_year, amount_minor, currency)
         VALUES ($1, $2, $3, $4, $5)`,
        [made.requestId, person.employeeId, year, amount, currency],
      );

    it('takes a share for each year, and never one of nothing or less', async () => {
      const made = await committed('AWAITING_NEED', 1);

      expect(await share(made, people[0], 2026, 1500)).toBeNull();
      expect(await share(made, people[0], 2027, 1500)).toBeNull();
      expect(await share(made, people[0], 2026, 1500)).toBe('23505');
      expect(await share(made, people[0], 2028, 0)).toBe(CHECK);
      expect(await share(made, people[0], 2028, -5)).toBe(CHECK);
    });

    it('refuses the share of a person who is not a line of the request', async () => {
      const made = await committed('AWAITING_NEED', 1);

      expect(await share(made, people[2], 2026, 1500)).toBe('23503');
    });

    it('is given back once, and is never changed or deleted', async () => {
      const made = await committed('AWAITING_NEED', 1);
      await share(made, people[0], 2026, 1500);
      const update = (set: string) =>
        sqlState(`UPDATE access_request_line_amounts SET ${set} WHERE request_id = $1`, [made.requestId]);

      expect(await update('amount_minor = 1')).toBe(OBJECT_STATE);
      expect(await update('budget_year = 2030')).toBe(OBJECT_STATE);
      expect(await update('released_at = now()')).toBeNull();
      expect(await update("released_at = now() + interval '1 hour'")).toBe(OBJECT_STATE);
      expect(await update('released_at = NULL')).toBe(OBJECT_STATE);
      expect(await sqlState(`DELETE FROM access_request_line_amounts WHERE request_id = $1`, [made.requestId])).toBe(
        OBJECT_STATE,
      );
      expect(await sqlState(`TRUNCATE access_request_line_amounts`)).toBe(RESTRICT);
    });
  });

  describe('the supplementary file that leaves people out', () => {
    const supplement = async (made: Made, number: number, over: Record<string, unknown> = {}) => {
      const row = {
        before_expected_spend_on: '2026-11-01',
        after_expected_spend_on: '2026-11-01',
        before_amount_minor: 4500,
        after_amount_minor: 3600,
        ...over,
      };

      return sqlState(
        `INSERT INTO request_supplements
           (id, organization_id, request_id, number, reason, changed_by_employee_id, before_expected_spend_on, after_expected_spend_on,
            before_budget_year, after_budget_year, before_amount_minor, after_amount_minor, currency)
         VALUES (gen_random_uuid(), $1, $2, $3, 'One person left out', $4, $5, $6, 2026, 2026, $7, $8, $9)`,
        [
          h.seed.organizationId,
          made.requestId,
          number,
          head.employeeId,
          row.before_expected_spend_on,
          row.after_expected_spend_on,
          row.before_amount_minor,
          row.after_amount_minor,
          currency,
        ],
      );
    };

    it('takes a file that changes the amount with the same day, and one that changes the day with the same amount', async () => {
      const made = await committed('NEED_CONFIRMED', 2);

      expect(await supplement(made, 1)).toBeNull();
      expect(await supplement(made, 2, { after_expected_spend_on: '2026-12-01', after_amount_minor: 4500 })).toBeNull();
    });

    it('refuses a file that changes neither the day nor the amount', async () => {
      const made = await committed('NEED_CONFIRMED', 2);

      expect(await supplement(made, 1, { after_amount_minor: 4500 })).toBe(CHECK);
    });

    it('keeps who was left out, for ever', async () => {
      const made = await committed('NEED_CONFIRMED', 2);
      expect(await supplement(made, 1)).toBeNull();
      const drop = (number: number, person: Person) =>
        sqlState(`INSERT INTO request_supplement_drops (request_id, number, employee_id) VALUES ($1, $2, $3)`, [
          made.requestId,
          number,
          person.employeeId,
        ]);

      expect(await drop(1, people[1])).toBeNull();
      expect(await drop(1, people[1])).toBe('23505');
      expect(await drop(2, people[0])).toBe('23503');
      expect(await sqlState(`UPDATE request_supplement_drops SET employee_id = $1`, [people[0].employeeId])).toBe(
        RESTRICT,
      );
      expect(await sqlState(`DELETE FROM request_supplement_drops WHERE request_id = $1`, [made.requestId])).toBe(
        RESTRICT,
      );
      expect(await sqlState(`TRUNCATE request_supplement_drops`)).toBe(RESTRICT);
    });
  });
});
