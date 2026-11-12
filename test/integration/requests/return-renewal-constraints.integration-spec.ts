import { randomUUID } from 'node:crypto';
import { ReturnHarness } from '../../support/return-harness';

const h = new ReturnHarness();
const CHECK = '23514';
const FINAL = '55000';
const UNIQUE = '23505';

/** The constraint the last rejected statement named: the rule that said no, not only the kind of refusal. */
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

/** Runs the statements in one transaction and returns the SQLSTATE of the commit, which is where a deferred rule speaks. */
async function committed(statements: Array<[string, unknown[]]>): Promise<string | null> {
  await h.ctx.sql.query('BEGIN');
  try {
    for (const [text, values] of statements) await h.ctx.sql.query(text, values);
    await h.ctx.sql.query('COMMIT');

    return null;
  } catch (error) {
    await h.ctx.sql.query('ROLLBACK');

    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('what the database refuses about a return and a renewal (US-05-13, US-05-14)', () => {
  let lossy: { subscriptionId: string; planId: string };
  let plain: { subscriptionId: string; planId: string };
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    for (const dataLoss of [true, false]) {
      const subscriptionId = await h.subscription(10, 'K2');
      const planId = await h.planOf(subscriptionId);
      await h.describeRemoval(planId, dataLoss ? 'Export first' : null, dataLoss);
      if (dataLoss) lossy = { subscriptionId, planId };
      else plain = { subscriptionId, planId };
    }
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A change the database accepts only as a repair: the trigger that guards what was said is set aside for the statement. */
  const unguarded = async (text: string, values: unknown[]): Promise<string | null> => {
    await h.ctx.sql.query(`ALTER TABLE return_requests DISABLE TRIGGER return_requests_immutable`);
    try {
      return await sqlState(text, values);
    } finally {
      await h.ctx.sql.query(`ALTER TABLE return_requests ENABLE TRIGGER return_requests_immutable`);
    }
  };
  /**
   * A return as it is sent today asks for no handover (QĐ-110g). `legacy` makes it the row an older version wrote for a plan that
   * loses data (a handover required, due three days after the return), which the columns and the rules of the table still hold
   * until they are dropped.
   */
  const returnOf = async (target: { subscriptionId: string }, legacy = false) => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-CN${counter}`);
    const assignmentId = await h.seatOf(unit.member, target);
    const wire = await h.returned(unit.member.account, { assignmentId, reason: 'The project is over' });
    if (legacy) {
      expect(
        await unguarded(
          `UPDATE return_requests SET handover_required = true, handover_due_on = requested_on + 3 WHERE id = $1`,
          [wire.id],
        ),
      ).toBeNull();
    }

    return { unit, assignmentId, id: wire.id, taskId: (await h.returnRow(wire.id)).revocation_task_id };
  };

  describe('the return of a seat', () => {
    it('keeps the state and the columns that say it in step, and the handover with the plan that asks for it', async () => {
      const asked = await returnOf(lossy, true);
      const free = await returnOf(plain);

      expect(await sqlState(`UPDATE return_requests SET state = 'COMPLETED' WHERE id = $1`, [asked.id])).toBe(CHECK);
      expect(lastConstraint).toBe('return_requests_state_check');
      expect(
        await sqlState(`UPDATE return_requests SET state = 'FAILED', failed_at = now() WHERE id = $1`, [asked.id]),
      ).toBe(CHECK);
      expect(
        await sqlState(
          `UPDATE return_requests SET state = 'COMPLETED', completed_at = now(), failure_reason = 'x' WHERE id = $1`,
          [asked.id],
        ),
      ).toBe(CHECK);
      // A handover is confirmed by a person at a time, never one without the other; a flag is for a return completed without it.
      expect(
        await sqlState(
          `UPDATE return_requests SET handover_confirmed_by_employee_id = requested_by_employee_id WHERE id = $1`,
          [asked.id],
        ),
      ).toBe(CHECK);
      expect(await sqlState(`UPDATE return_requests SET handover_flagged = true WHERE id = $1`, [asked.id])).toBe(
        CHECK,
      );
      expect(lastConstraint).toBe('return_requests_flag_check');
      // A plan that asks for no handover has no confirmation, no flag and no deadline.
      expect(
        await sqlState(
          `UPDATE return_requests SET handover_confirmed_at = now(), handover_confirmed_by_employee_id = requested_by_employee_id WHERE id = $1`,
          [free.id],
        ),
      ).toBe(CHECK);
      expect(lastConstraint).toBe('return_requests_handover_check');
      expect(await sqlState(`UPDATE return_requests SET handover_flagged = true WHERE id = $1`, [free.id])).toBe(CHECK);
      expect(lastConstraint).toBe('return_requests_flag_check');
      expect((await h.returnRow(asked.id)).state).toBe('AWAITING_REVOCATION');
    });

    it('holds the source to who sent it, the reason to a text and the confirmer to the sender', async () => {
      const asked = await returnOf(lossy, true);

      expect(await unguarded(`UPDATE return_requests SET source = 'HEAD_CONFIRMATION' WHERE id = $1`, [asked.id])).toBe(
        CHECK,
      );
      expect(lastConstraint).toBe('return_requests_source_check');
      expect(await unguarded(`UPDATE return_requests SET reason = '  ' WHERE id = $1`, [asked.id])).toBe(CHECK);
      expect(lastConstraint).toBe('return_requests_text_check');
      expect(await unguarded(`UPDATE return_requests SET revocation_note = ' ' WHERE id = $1`, [asked.id])).toBe(CHECK);
      // Whoever confirms the handover is the person who sent the return: when the head sent it, the holder cannot confirm it.
      const byHead = await returnOf(lossy, true);
      expect(
        await unguarded(
          `UPDATE return_requests SET handover_confirmed_at = now(), handover_confirmed_by_employee_id = holder_employee_id,
                  requested_by_employee_id = $2, source = 'HEAD_CONFIRMATION' WHERE id = $1`,
          [byHead.id, byHead.unit.head.employeeId],
        ),
      ).toBe(CHECK);
      expect(lastConstraint).toBe('return_requests_handover_confirmer_check');
    });

    it('never deletes a return, never changes what it said when it was sent and writes the confirmation once', async () => {
      const asked = await returnOf(lossy, true);

      expect(await sqlState(`DELETE FROM return_requests WHERE id = $1`, [asked.id])).toBe(FINAL);
      for (const set of [
        `reason = 'Another reason'`,
        `source = 'HEAD_CONFIRMATION'`,
        `handover_due_on = handover_due_on + 3`,
        `requested_on = requested_on - 1`,
        `assignment_id = gen_random_uuid()`,
        `revocation_note = 'Another note'`,
        `origin_request_id = gen_random_uuid()`,
      ]) {
        expect(await sqlState(`UPDATE return_requests SET ${set} WHERE id = $1`, [asked.id])).toBe(FINAL);
      }

      expect(
        await sqlState(
          `UPDATE return_requests SET handover_confirmed_at = now(), handover_confirmed_by_employee_id = requested_by_employee_id WHERE id = $1`,
          [asked.id],
        ),
      ).toBeNull();
      expect(await sqlState(`UPDATE return_requests SET handover_confirmed_at = now() WHERE id = $1`, [asked.id])).toBe(
        FINAL,
      );
      expect(
        await sqlState(
          `UPDATE return_requests SET handover_confirmed_at = NULL, handover_confirmed_by_employee_id = NULL WHERE id = $1`,
          [asked.id],
        ),
      ).toBe(FINAL);
    });

    it('never changes a return that has ended', async () => {
      const done = await returnOf(plain);
      await h.claim(done.taskId).expect(200);
      await h.revoked(done.taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'Removed' }).expect(200);

      expect((await h.returnRow(done.id)).state).toBe('COMPLETED');
      expect(
        await sqlState(`UPDATE return_requests SET state = 'AWAITING_REVOCATION', completed_at = NULL WHERE id = $1`, [
          done.id,
        ]),
      ).toBe(FINAL);
      expect(await sqlState(`UPDATE return_requests SET completed_at = now() WHERE id = $1`, [done.id])).toBe(FINAL);
      expect(await sqlState(`DELETE FROM return_requests WHERE id = $1`, [done.id])).toBe(FINAL);
    });

    it('leaves one return waiting for the revocation of a seat, and one return for a task', async () => {
      const asked = await returnOf(plain);
      const copy = (task: string) =>
        sqlState(
          `INSERT INTO return_requests (id, organization_id, assignment_id, plan_id, revocation_task_id, requested_by_employee_id,
             holder_employee_id, department_id, source, reason, requested_on, revocation_note, handover_required, handover_due_on,
             created_by_app_user_id)
           SELECT gen_random_uuid(), organization_id, assignment_id, plan_id, $2, requested_by_employee_id, holder_employee_id,
             department_id, source, reason, requested_on, revocation_note, handover_required, handover_due_on, created_by_app_user_id
             FROM return_requests WHERE id = $1`,
          [asked.id, task],
        );

      // The same task: the task has one return.
      expect(await copy(asked.taskId)).toBe(UNIQUE);
      // Another task of the same seat is made by hand, and the seat still has one return waiting: the partial index says so.
      const other = randomUUID();
      await h.ctx.sql.query(
        `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, status, max_attempts, revocation_source,
           created_by_app_user_id, closed_by_app_user_id, closed_at, close_reason, failed_at, failure_kind, failure_reason)
         VALUES ($1, $2, $3, 'REVOKE', 'MANUAL', 'CLOSED_FAILED', 3, 'RETURN', $4, $4, now(), 'closed', now(), 'NOT_DONE', 'failed')`,
        [other, h.seed.organizationId, asked.assignmentId, randomUUID()],
      );
      expect(await copy(other)).toBe(UNIQUE);
      expect(lastConstraint).toBe('return_requests_one_awaiting_per_assignment');
      const indexes = await h.ctx.sql.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes WHERE indexname = 'return_requests_one_awaiting_per_assignment'`,
      );
      expect(indexes.rows[0].indexdef).toContain("state = 'AWAITING_REVOCATION'");
    });
  });

  describe('the renewal of a right', () => {
    const renewalOf = async () => {
      counter += 1;
      const unit = await h.departmentWithHead(`P-CN${counter}`);
      const internal = await h.plan('K5');
      const assignmentId = await h.seatOf(unit.member, { planId: internal }, { expectedEndDate: h.inDays(5) });
      const { request } = await h.renewed(unit.member.account, {
        assignmentId,
        extensionMonths: 3,
        businessReason: 'The work goes on',
      });

      return { unit, assignmentId, requestId: request.id };
    };

    it('asks for a later end, for months, and for a record that is named with the time it was made', async () => {
      const made = await renewalOf();

      expect(
        await sqlState(
          `UPDATE access_request_renewals SET successor_assignment_id = assignment_id WHERE request_id = $1`,
          [made.requestId],
        ),
      ).toBe(CHECK);
      expect(
        await sqlState(`UPDATE access_request_renewals SET applied_at = now() WHERE request_id = $1`, [made.requestId]),
      ).toBe(CHECK);
      const insert = (set: string) =>
        sqlState(
          `INSERT INTO access_request_renewals (request_id, assignment_id, previous_expected_end_date, new_expected_end_date, consecutive_months)
           SELECT gen_random_uuid(), assignment_id, ${set} FROM access_request_renewals WHERE request_id = $1`,
          [made.requestId],
        );
      // An end that is not later, and no months: refused whatever else is true of the row.
      expect(await insert(`previous_expected_end_date, previous_expected_end_date, consecutive_months`)).toBe(CHECK);
      expect(lastConstraint).toBe('access_request_renewals_end_order');
      expect(await insert(`previous_expected_end_date, new_expected_end_date, 0`)).toBe(CHECK);
      expect(lastConstraint).toBe('access_request_renewals_months_check');
    });

    it('never changes what was asked for, never deletes the detail and writes the record once', async () => {
      const made = await renewalOf();

      expect(await sqlState(`DELETE FROM access_request_renewals WHERE request_id = $1`, [made.requestId])).toBe(FINAL);
      for (const set of [
        `new_expected_end_date = new_expected_end_date + 1`,
        `previous_expected_end_date = previous_expected_end_date - 1`,
        `consecutive_months = consecutive_months + 1`,
        `assignment_id = gen_random_uuid()`,
      ]) {
        expect(
          await sqlState(`UPDATE access_request_renewals SET ${set} WHERE request_id = $1`, [made.requestId]),
        ).toBe(FINAL);
      }

      await h.decide(made.requestId, { decision: 'APPROVE' }, made.unit.head.account).expect(200);
      // BR-MF1-08d: the record is written when the IT Admin completes the task EXTEND that approval opened.
      const [extension] = (
        await h.ctx.sql.query<{ id: string }>(
          `SELECT id FROM provisioning_tasks WHERE request_id = $1 AND kind = 'EXTEND'`,
          [made.requestId],
        )
      ).rows;
      await h.claim(extension.id).expect(200);
      await h.complete(extension.id, { evidence: 'Extended with the vendor' }).expect(200);
      const detail = await h.renewalOf(made.requestId);
      expect(detail.successor_assignment_id).not.toBeNull();
      expect(
        await sqlState(
          `UPDATE access_request_renewals SET successor_assignment_id = assignment_id, applied_at = now() WHERE request_id = $1`,
          [made.requestId],
        ),
      ).toBe(FINAL);
    });

    it('requires the detail of a request of this kind at the commit, and gives none to any other', async () => {
      const made = await renewalOf();
      const ordinary = await h.sent((await h.departmentWithHead(`P-CN${(counter += 1)}`)).member, await h.plan('K5'));
      const columns = `organization_id, type, branch, state, plan_id, requester_employee_id, department_id, cost_center_id, business_reason, term_months, policy, created_by_app_user_id`;
      const columnsFrom = `organization_id, $2::"AccessRequestType", branch, state, plan_id, requester_employee_id, department_id, cost_center_id, business_reason, term_months, policy, created_by_app_user_id`;

      expect(
        await committed([
          [
            `INSERT INTO access_requests (id, ${columns}) SELECT gen_random_uuid(), ${columnsFrom} FROM access_requests WHERE id = $1`,
            [ordinary.id, 'RENEWAL'],
          ],
        ]),
      ).toBe(CHECK);
      expect(await committed([[`UPDATE access_requests SET type = 'RENEWAL' WHERE id = $1`, [ordinary.id]]])).toBe(
        CHECK,
      );
      expect(
        await committed([
          [
            `INSERT INTO access_request_renewals (request_id, assignment_id, previous_expected_end_date, new_expected_end_date, consecutive_months)
             SELECT $2, assignment_id, previous_expected_end_date, new_expected_end_date, consecutive_months
               FROM access_request_renewals WHERE request_id = $1`,
            [made.requestId, ordinary.id],
          ],
        ]),
      ).toBe(CHECK);
      expect(
        (await h.ctx.sql.query(`SELECT 1 FROM access_requests WHERE id = $1 AND type = 'GRANT'`, [ordinary.id]))
          .rowCount,
      ).toBe(1);
    });
  });

  describe('the assignments a renewal follows (AC-2)', () => {
    /** A seat of a person with an end, as a request granted it. */
    const seat = async (endsOn: string | null) => {
      counter += 1;
      const unit = await h.departmentWithHead(`P-CN${counter}`);
      const assignmentId = await h.seatOf(
        unit.member,
        { subscriptionId: plain.subscriptionId },
        endsOn ? { expectedEndDate: endsOn } : {},
      );

      return { unit, assignmentId };
    };

    it('does not edit the end a right has once it has one, and still lets one be set where there was none', async () => {
      const ending = await seat(h.inDays(10));
      const open = await seat(null);

      expect(
        await sqlState(`UPDATE license_assignments SET expected_end_date = $2 WHERE id = $1`, [
          ending.assignmentId,
          h.inDays(100),
        ]),
      ).toBe(FINAL);
      expect(
        await sqlState(`UPDATE license_assignments SET expected_end_date = NULL WHERE id = $1`, [ending.assignmentId]),
      ).toBe(FINAL);
      expect(
        await sqlState(`UPDATE license_assignments SET expected_end_date = $2 WHERE id = $1`, [
          open.assignmentId,
          h.inDays(100),
        ]),
      ).toBeNull();
      expect(
        await sqlState(`UPDATE license_assignments SET expected_end_date = $2 WHERE id = $1`, [
          open.assignmentId,
          h.inDays(200),
        ]),
      ).toBe(FINAL);
      expect((await h.seatRow(ending.assignmentId)).expected_end_date).toBe(h.inDays(10));
      expect(
        await sqlState(`UPDATE license_assignments SET valid_until = $2 WHERE id = $1`, [
          ending.assignmentId,
          h.inDays(10),
        ]),
      ).toBeNull();
    });

    it('lets a record made by a request name the record it renews, and keeps naming it for a handover only', async () => {
      const first = await seat(h.inDays(10));
      await h.ctx.sql.query(`UPDATE license_assignments SET valid_until = $2 WHERE id = $1`, [
        first.assignmentId,
        h.inDays(10),
      ]);
      const following = (source: string, predecessor: string | null) =>
        sqlState(
          `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
             normalized_account_identifier, valid_from, valid_from_basis, expected_end_date, predecessor_id, baseline_import_id,
             created_by_app_user_id)
           SELECT gen_random_uuid(), organization_id, kind, $2::"AssignmentSource", plan_id, subscription_id, employee_id,
             account_identifier, normalized_account_identifier, valid_until, 'ACTUAL', valid_until + 90, $3, baseline_import_id,
             created_by_app_user_id
             FROM license_assignments WHERE id = $1`,
          [first.assignmentId, source, predecessor],
        );

      expect(await following('HANDOVER', null)).toBe(CHECK);
      expect(lastConstraint).toBe('license_assignments_handover_names_predecessor');
      expect(await following('BASELINE', first.assignmentId)).toBe(CHECK);
      expect(lastConstraint).toBe('license_assignments_handover_names_predecessor');
      expect(await following('REQUEST', first.assignmentId)).toBeNull();
    });
  });
});
