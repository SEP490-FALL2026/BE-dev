import { randomUUID } from 'node:crypto';
import { Department, Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();

interface SqlFailure {
  code: string;
  constraint?: string;
}

async function runSql(text: string, values: unknown[] = []): Promise<SqlFailure | null> {
  try {
    await h.ctx.sql.query(text, values);
    return null;
  } catch (error) {
    const pgError = error as { code?: string; constraint?: string };
    return { code: pgError.code ?? 'unknown', constraint: pgError.constraint };
  }
}

const CHECK = '23514';
const RESTRICT = '23001';

describe('access_request_replies (integration, PostgreSQL constraints)', () => {
  let department: Department;
  let person: Person;
  let paidPlanId: string;
  let requestId: string;
  let stepId: string;

  beforeAll(async () => {
    await h.start();
    department = await h.departmentWithUnit('P-RPL');
    person = await h.staff(department, 'RPL-E1');
    paidPlanId = await h.plan('K2');

    requestId = randomUUID();
    const requestFail = await runSql(
      `INSERT INTO access_requests (
         id, organization_id, type, branch, state, plan_id,
         requester_employee_id, department_id, cost_center_id,
         business_reason, term_months, pricing_status, price_kind,
         billing_cycle, amount_minor, amount_currency, unit_price_minor,
         monthly_price_minor, budget_year, policy, created_by_app_user_id
       ) VALUES (
         $1, $2, 'GRANT', 'PAID_IN_CATALOG', 'AWAITING_REQUESTER_REVISION', $3,
         $4, $5, $6, 'Reply schema check', 6, 'PRICED', 'RECURRING',
         'MONTHLY', 6000, 'VND', 1000, 1000, 2026, $7::jsonb, $8
       )`,
      [
        requestId,
        h.seed.organizationId,
        paidPlanId,
        person.employeeId,
        department.id,
        department.unitId,
        JSON.stringify({ version: 1 }),
        randomUUID(),
      ],
    );
    expect(requestFail).toBeNull();

    stepId = randomUUID();
    const stepFail = await runSql(
      `INSERT INTO access_request_steps (
         id, request_id, kind, sequence, state, assignee_employee_id,
         routing_row, sla_working_days, assigned_at, decided_at
       ) VALUES ($1, $2, 'NEED', 1, 'CLOSED', $3, 1, 2, now(), now())`,
      [stepId, requestId, person.employeeId],
    );
    expect(stepFail).toBeNull();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const insertReply = async (
    over: Record<string, unknown> = {},
  ): Promise<{ id: string; failure: SqlFailure | null }> => {
    const id = randomUUID();
    const row: Record<string, unknown> = {
      organization_id: h.seed.organizationId,
      request_id: requestId,
      kind: 'REQUESTER_RESUBMISSION',
      returned_step_id: stepId,
      note: 'Added project justification',
      author_employee_id: person.employeeId,
      ...over,
    };
    const columns = Object.keys(row);
    const failure = await runSql(
      `INSERT INTO access_request_replies (id, ${columns.join(', ')})
       VALUES ($1, ${columns.map((column, index) => `$${index + 2}${column === 'kind' ? '::"AccessRequestReplyKind"' : ''}`).join(', ')})`,
      [id, ...columns.map((column) => row[column])],
    );
    return { id, failure };
  };

  it('rejects blank note and note longer than 1000 characters (23514)', async () => {
    expect(await insertReply({ note: '   ' })).toMatchObject({
      failure: { code: CHECK, constraint: 'access_request_replies_note_check' },
    });
    expect(await insertReply({ note: 'a'.repeat(1001) })).toMatchObject({
      failure: { code: CHECK, constraint: 'access_request_replies_note_check' },
    });
    expect((await insertReply({ note: 'a'.repeat(1000) })).failure).toBeNull();
  });

  it('accepts returned_step_id = null for voluntary notes', async () => {
    expect((await insertReply({ returned_step_id: null, note: 'Clarified scope' })).failure).toBeNull();
  });

  it('allows multiple replies referencing the same returned_step_id (no unique constraint)', async () => {
    expect((await insertReply({ kind: 'REQUESTER_RESUBMISSION', note: 'First reply' })).failure).toBeNull();
    expect((await insertReply({ kind: 'HEAD_RESUBMISSION', note: 'Second reply' })).failure).toBeNull();
  });

  it('rejects UPDATE and DELETE on access_request_replies via append-only trigger', async () => {
    const inserted = await insertReply({ note: 'Immutable note' });
    expect(inserted.failure).toBeNull();

    expect(
      await runSql(`UPDATE access_request_replies SET note = 'Edited' WHERE id = $1`, [inserted.id]),
    ).toMatchObject({ code: RESTRICT });
    expect(await runSql(`DELETE FROM access_request_replies WHERE id = $1`, [inserted.id])).toMatchObject({
      code: RESTRICT,
    });
  });
});
