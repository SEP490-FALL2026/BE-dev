import { randomUUID } from 'node:crypto';
import { ReassignmentHarness } from '../../support/reassignment-harness';
import type { Unit } from '../../support/spend-harness';

const h = new ReassignmentHarness();
const CHECK = '23514';
const UNIQUE = '23505';
const APPEND_ONLY = '23001';

let lastConstraint: string | undefined;

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await h.ctx.sql.query(text, values);

    return null;
  } catch (error) {
    lastConstraint = (error as { constraint?: string }).constraint;

    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('what the database refuses about waiting steps and their alerts (US-05-11, US-05-12)', () => {
  let unit: Unit;
  let plan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    unit = await h.departmentWithHead('P-CN');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A request whose need step is held by the head of the department. */
  const held = async () => {
    counter += 1;
    const member = await h.staff(unit.department, `CN-E${counter}`);

    return h.sent(member, plan);
  };
  const stepRow = async (requestId: string) => h.stepOf(requestId, 'NEED');

  describe('the moment a step began to wait', () => {
    it('is set when a held step starts to wait, kept while it waits, and cleared when somebody holds it again', async () => {
      const { id } = await held();
      expect((await stepRow(id)).waiting_since).toBeNull();

      await h.ctx.sql.query(
        `UPDATE access_request_steps SET state = 'WAITING', assignee_employee_id = NULL, assigned_at = NULL,
                waiting_reason = 'NO_FALLBACK_APPROVER' WHERE request_id = $1 AND kind = 'NEED'`,
        [id],
      );
      const first = (await stepRow(id)).waiting_since;
      expect(first).toBeInstanceOf(Date);

      await h.ctx.sql.query(
        `UPDATE access_request_steps SET waiting_reason = 'FALLBACK_IS_REQUESTER' WHERE request_id = $1 AND kind = 'NEED'`,
        [id],
      );
      expect((await stepRow(id)).waiting_since).toEqual(first);

      await h.ctx.sql.query(
        `UPDATE access_request_steps SET state = 'PENDING', assignee_employee_id = $2, assigned_at = now(),
                waiting_reason = NULL WHERE request_id = $1 AND kind = 'NEED'`,
        [id, unit.head.employeeId],
      );
      expect((await stepRow(id)).waiting_since).toBeNull();
    });

    it('starts again when the step waits for a second time: each stretch has its own beginning', async () => {
      const { id } = await held();
      const wait = `UPDATE access_request_steps SET state = 'WAITING', assignee_employee_id = NULL, assigned_at = NULL,
                waiting_reason = 'NO_FALLBACK_APPROVER' WHERE request_id = $1 AND kind = 'NEED'`;
      await h.ctx.sql.query(wait, [id]);
      const first = (await stepRow(id)).waiting_since as Date;
      await h.ctx.sql.query(
        `UPDATE access_request_steps SET state = 'PENDING', assignee_employee_id = $2, assigned_at = now(),
                waiting_reason = NULL WHERE request_id = $1 AND kind = 'NEED'`,
        [id, unit.head.employeeId],
      );
      await h.ctx.sql.query(`SELECT pg_sleep(0.05)`);
      await h.ctx.sql.query(wait, [id]);

      expect(((await stepRow(id)).waiting_since as Date).getTime()).toBeGreaterThan(first.getTime());
    });

    it('is the creation time of a step made waiting, so the stretch begins when the step was made', async () => {
      const { id } = await held();
      const { rows } = await h.ctx.sql.query<{ waiting_since: Date; created_at: Date }>(
        `INSERT INTO access_request_steps (id, request_id, kind, sequence, state, routing_row, waiting_reason, sla_working_days, created_at)
         VALUES (gen_random_uuid(), $1, 'IT_ASSESSMENT', 7, 'WAITING', 9, 'NO_IT_ADMIN_IN_CHARGE', 3, now() - interval '2 days')
         RETURNING waiting_since, created_at`,
        [id],
      );

      expect(rows[0].waiting_since).toEqual(rows[0].created_at);
    });

    it('is refused when it disagrees with the state, if something writes around the trigger (23514)', async () => {
      const { id } = await held();
      const row = await stepRow(id);
      await h.ctx.sql.query(`ALTER TABLE access_request_steps DISABLE TRIGGER access_request_steps_waiting_since`);
      try {
        expect(await sqlState(`UPDATE access_request_steps SET waiting_since = now() WHERE id = $1`, [row.id])).toBe(
          CHECK,
        );
        expect(lastConstraint).toBe('access_request_steps_waiting_since_check');
        expect(
          await sqlState(
            `UPDATE access_request_steps SET state = 'WAITING', assignee_employee_id = NULL, assigned_at = NULL,
                    waiting_reason = 'NO_FALLBACK_APPROVER' WHERE id = $1`,
            [row.id],
          ),
        ).toBe(CHECK);
        expect(lastConstraint).toBe('access_request_steps_waiting_since_check');
      } finally {
        await h.ctx.sql.query(`ALTER TABLE access_request_steps ENABLE TRIGGER access_request_steps_waiting_since`);
      }
    });

    it('keeps the rule that a held step has its person and a waiting step has its reason (23514)', async () => {
      const { id } = await held();
      const row = await stepRow(id);

      expect(
        await sqlState(
          `UPDATE access_request_steps SET state = 'WAITING', assignee_employee_id = NULL, assigned_at = NULL WHERE id = $1`,
          [row.id],
        ),
      ).toBe(CHECK);
      expect(lastConstraint).toBe('access_request_steps_holder_check');
      expect(
        await sqlState(`UPDATE access_request_steps SET assignee_employee_id = NULL WHERE id = $1`, [row.id]),
      ).toBe(CHECK);
    });
  });

  describe('the alert of a stretch of waiting', () => {
    const alertFor = async (requestId: string, waitingSince: Date) => {
      const row = await stepRow(requestId);

      return [
        randomUUID(),
        h.seed.organizationId,
        requestId,
        row.id,
        'NEED',
        'NO_FALLBACK_APPROVER',
        waitingSince.toISOString(),
      ];
    };
    const insertAlert = `INSERT INTO controlled_wait_alerts (id, organization_id, request_id, step_id, step_kind, waiting_reason, waiting_since)
       VALUES ($1, $2, $3, $4, $5::"AccessRequestStepKind", $6, $7)`;

    it('is one for each stretch: a second for the same step and the same beginning is refused (23505), a new stretch is not', async () => {
      const { id } = await held();
      const since = new Date('2026-10-01T03:00:00.000Z');

      expect(await sqlState(insertAlert, await alertFor(id, since))).toBeNull();
      expect(await sqlState(insertAlert, await alertFor(id, since))).toBe(UNIQUE);
      expect(await sqlState(insertAlert, await alertFor(id, new Date('2026-10-02T03:00:00.000Z')))).toBeNull();
    });

    it('is refused without a reason (23514)', async () => {
      const { id } = await held();
      const values = await alertFor(id, new Date('2026-10-03T03:00:00.000Z'));
      values[5] = '  ';

      expect(await sqlState(insertAlert, values)).toBe(CHECK);
    });

    it('is kept as it was raised: nothing edits, deletes or truncates it (23001)', async () => {
      const { id } = await held();
      await h.ctx.sql.query(insertAlert, await alertFor(id, new Date('2026-10-04T03:00:00.000Z')));

      expect(
        await sqlState(`UPDATE controlled_wait_alerts SET waiting_reason = 'OTHER' WHERE request_id = $1`, [id]),
      ).toBe(APPEND_ONLY);
      expect(await sqlState(`DELETE FROM controlled_wait_alerts WHERE request_id = $1`, [id])).toBe(APPEND_ONLY);
      expect(await sqlState(`TRUNCATE controlled_wait_alerts`)).toBe(APPEND_ONLY);
    });
  });
});
