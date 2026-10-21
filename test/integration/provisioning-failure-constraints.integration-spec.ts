import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(sql: Client, text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('failed provisioning tasks and failed assignments (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;
  let planId: string;
  let paidPlanId: string;
  let counter = 0;
  const person = () => randomUUID();

  const newEmployee = async (): Promise<string> => {
    const id = randomUUID();
    counter += 1;
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       VALUES ($1, $2, $3, $3, 'STAFF', '2026-01-01', now())`,
      [id, organizationId, `E-${counter}`],
    );

    return id;
  };
  const newAssignment = async (
    input: { plan?: string; subscriptionId?: string | null; employeeId?: string; validFrom?: string } = {},
  ): Promise<string> => {
    const id = randomUUID();
    counter += 1;
    await sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
       VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, $4, $5, $6, $6, $7, 'ACTUAL', $8)`,
      [
        id,
        organizationId,
        input.plan ?? planId,
        input.subscriptionId ?? null,
        input.employeeId ?? (await newEmployee()),
        `user${counter}@congty.vn`,
        input.validFrom ?? '2026-10-20',
        person(),
      ],
    );

    return id;
  };
  const newTask = async (channel: 'MANUAL' | 'CONNECTOR' = 'CONNECTOR', assignmentId?: string): Promise<string> => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, request_id, max_attempts, created_by_app_user_id)
       VALUES ($1, $2, $3, 'GRANT', $4::"ProvisioningChannel", $5, 4, $6)`,
      [id, organizationId, assignmentId ?? (await newAssignment()), channel, randomUUID(), person()],
    );

    return id;
  };
  const update = (id: string, set: string, values: unknown[] = []) =>
    sqlState(sql, `UPDATE provisioning_tasks SET ${set} WHERE id = $1`, [id, ...values]);
  const failedTask = async (channel: 'MANUAL' | 'CONNECTOR' = 'CONNECTOR'): Promise<string> => {
    const id = await newTask(channel);
    if (channel === 'MANUAL') {
      await update(id, `status = 'IN_PROGRESS', claimed_by_app_user_id = $2, claimed_at = now()`, [person()]);
      await update(
        id,
        `status = 'FAILED', failed_by_app_user_id = $2, failed_at = now(), failure_reason = 'could not', failure_kind = 'NOT_DONE'`,
        [person()],
      );
    } else {
      await update(id, `status = 'FAILED', failed_at = now(), failure_reason = 'refused', failure_kind = 'PERMANENT'`);
    }

    return id;
  };

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    organizationId = randomUUID();
    await sql.query(
      `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
      [organizationId],
    );
    const owner = await newEmployee();
    const vendorId = randomUUID();
    await sql.query(`INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, 'v', 'v')`, [
      vendorId,
      organizationId,
    ]);
    const application = async (kind: 'INTERNAL' | 'SAAS'): Promise<string> => {
      const id = randomUUID();
      await sql.query(
        `INSERT INTO applications (id, organization_id, kind, vendor_id, name, normalized_name, business_owner_employee_id,
           data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
         VALUES ($1, $2, $3::"ApplicationKind", $4, $5, $5, $6, 'LOW', false, false, false, false)`,
        [id, organizationId, kind, kind === 'INTERNAL' ? null : vendorId, `app ${kind}`, owner],
      );

      return id;
    };
    const plan = async (applicationId: string, type: string, paid: boolean): Promise<string> => {
      const id = randomUUID();
      await sql.query(
        `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model,
           control_level)
         VALUES ($1, $2, $3, $4, $4, $5::"ProvisioningType", $6::"PricingModel", $7::"ControlLevel")`,
        [id, organizationId, applicationId, `plan ${type}`, type, paid ? 'PER_SEAT' : null, paid ? 'FULL' : null],
      );

      return id;
    };
    planId = await plan(await application('INTERNAL'), 'K5', false);
    paidPlanId = await plan(await application('SAAS'), 'K2', true);
  }, 90000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  describe('a task waiting for its next try (US-07-04 AC-1)', () => {
    it('is a temporary failure with the tries made, the error and the next time, and nothing else', async () => {
      const id = await newTask();
      const wait = (set: string) => update(id, `status = 'RETRY_SCHEDULED', ${set}`);

      expect(await wait(`failure_kind = 'TRANSIENT', attempts = 0, last_error = 'slow', next_retry_at = now()`)).toBe(
        '23514',
      );
      expect(await wait(`failure_kind = 'TRANSIENT', attempts = 1, last_error = 'slow'`)).toBe('23514');
      expect(await wait(`failure_kind = 'TRANSIENT', attempts = 1, next_retry_at = now()`)).toBe('23514');
      expect(await wait(`failure_kind = 'PERMANENT', attempts = 1, last_error = 'x', next_retry_at = now()`)).toBe(
        '23514',
      );
      expect(
        await wait(
          `failure_kind = 'TRANSIENT', attempts = 1, last_error = 'slow', next_retry_at = now(), failure_reason = 'x'`,
        ),
      ).toBe('23514');
      expect(
        await wait(`failure_kind = 'TRANSIENT', attempts = 1, last_error = 'slow', next_retry_at = now()`),
      ).toBeNull();
    });

    it('cannot keep a time for the next try once queued, taken or failed', async () => {
      const id = await newTask();

      expect(await update(id, `next_retry_at = now()`)).toBe('23514');
      expect(await update(id, `attempts = -1`)).toBe('23514');
    });
  });

  describe('a failed task (US-07-04 AC-2)', () => {
    it('needs the kind, the time and the reason, and of a task by hand also who took it and who failed it', async () => {
      const connector = await newTask('CONNECTOR');
      const manual = await newTask('MANUAL');

      expect(await update(connector, `status = 'FAILED', failed_at = now(), failure_reason = 'x'`)).toBe('23514');
      expect(
        await update(
          connector,
          `status = 'FAILED', failed_at = now(), failure_reason = ' ', failure_kind = 'PERMANENT'`,
        ),
      ).toBe('23514');
      expect(
        await update(
          connector,
          `status = 'FAILED', failed_at = now(), failure_reason = 'x', failure_kind = 'PERMANENT'`,
        ),
      ).toBeNull();
      expect(
        await update(manual, `status = 'FAILED', failed_at = now(), failure_reason = 'x', failure_kind = 'NOT_DONE'`),
      ).toBe('23514');
    });

    it('does not start from nothing: a task that is queued cannot carry a failure', async () => {
      const id = await newTask();

      expect(await update(id, `failure_kind = 'PERMANENT'`)).toBe('23514');
    });
  });

  describe('the end of a failed task (US-07-04 AC-6, AC-10)', () => {
    it('is closed by a person, at a time, with a reason that is not blank, and keeps the failure it closes', async () => {
      const id = await failedTask();
      const close = (set: string) => update(id, `status = 'CLOSED_FAILED', ${set}`);

      expect(await close(`closed_at = now(), close_reason = 'xong'`)).toBe('23514');
      expect(await close(`closed_by_app_user_id = '${person()}', close_reason = 'xong'`)).toBe('23514');
      expect(await close(`closed_by_app_user_id = '${person()}', closed_at = now(), close_reason = ' '`)).toBe('23514');
      expect(await close(`closed_by_app_user_id = '${person()}', closed_at = now()`)).toBe('23514');
      expect(await close(`closed_by_app_user_id = '${person()}', closed_at = now(), close_reason = 'xong'`)).toBeNull();
    });

    it('cannot be closed when it never failed: a queued task is not on the line to being closed', async () => {
      const id = await newTask();

      expect(
        await update(
          id,
          `status = 'CLOSED_FAILED', closed_by_app_user_id = $2, closed_at = now(), close_reason = 'x'`,
          [person()],
        ),
      ).toBe('55000');
    });

    it('never changes again, and is never deleted', async () => {
      const id = await failedTask();
      await update(id, `status = 'CLOSED_FAILED', closed_by_app_user_id = $2, closed_at = now(), close_reason = 'x'`, [
        person(),
      ]);

      expect(await update(id, `close_reason = 'khác'`)).toBe('55000');
      expect(await update(id, `status = 'QUEUED'`)).toBe('55000');
      expect(await sqlState(sql, `DELETE FROM provisioning_tasks WHERE id = $1`, [id])).toBe('55000');
    });

    it('lets a failed task be decided on: it goes back to the queue and carries no failure', async () => {
      const id = await failedTask();
      const clear = `status = 'QUEUED', claimed_by_app_user_id = NULL, claimed_at = NULL, failed_by_app_user_id = NULL,
        failed_at = NULL, failure_reason = NULL, failure_kind = NULL, last_error = NULL, next_retry_at = NULL, attempts = 0`;

      expect(await update(id, `status = 'QUEUED'`)).toBe('23514');
      expect(await update(id, clear)).toBeNull();
    });
  });

  describe('a hand-off to a person (US-07-04 AC-9)', () => {
    it('keeps who, when and the evidence together, and the evidence is not blank', async () => {
      const id = await newTask();

      expect(await update(id, `handed_off_by_app_user_id = $2`, [person()])).toBe('23514');
      expect(await update(id, `handed_off_at = now(), hand_off_evidence = 'x'`)).toBe('23514');
      expect(
        await update(id, `handed_off_by_app_user_id = $2, handed_off_at = now(), hand_off_evidence = '  '`, [person()]),
      ).toBe('23514');
      expect(
        await update(id, `handed_off_by_app_user_id = $2, handed_off_at = now(), hand_off_evidence = 'làm tay'`, [
          person(),
        ]),
      ).toBeNull();
    });
  });

  describe('an assignment that failed (US-07-04 AC-6)', () => {
    const fail = (id: string) =>
      sqlState(sql, `UPDATE license_assignments SET failed_at = now(), valid_until = valid_from WHERE id = $1`, [id]);

    it('has an empty period: failing without ending the day it started, or ending so without failing, is refused', async () => {
      const id = await newAssignment();

      expect(await sqlState(sql, `UPDATE license_assignments SET failed_at = now() WHERE id = $1`, [id])).toBe('23514');
      expect(await sqlState(sql, `UPDATE license_assignments SET valid_until = valid_from WHERE id = $1`, [id])).toBe(
        '23514',
      );
      expect(await fail(id)).toBeNull();
    });

    it('can fail once, only while open, and never changes again', async () => {
      const ended = await newAssignment({ validFrom: '2026-09-01' });
      await sql.query(`UPDATE license_assignments SET valid_until = '2026-10-01' WHERE id = $1`, [ended]);
      const id = await newAssignment();
      await fail(id);

      expect(await fail(ended)).toBe('55000');
      expect(
        await sqlState(sql, `UPDATE license_assignments SET failed_at = NULL, valid_until = NULL WHERE id = $1`, [id]),
      ).toBe('55000');
      expect(
        await sqlState(sql, `UPDATE license_assignments SET expected_end_date = '2027-01-01' WHERE id = $1`, [id]),
      ).toBe('55000');
      expect(await sqlState(sql, `DELETE FROM license_assignments WHERE id = $1`, [id])).toBe('55000');
    });

    it('takes no seat on any day: the seat can be given to another person, and to the same one again', async () => {
      const subscriptionId = randomUUID();
      await sql.query(
        `INSERT INTO subscriptions (id, organization_id, plan_id, kind, status, purchased_quantity)
         VALUES ($1, $2, $3, 'TERM', 'DRAFT', 1)`,
        [subscriptionId, organizationId, paidPlanId],
      );
      const employee = await newEmployee();
      const first = await newAssignment({ plan: paidPlanId, subscriptionId, employeeId: employee });

      await expect(newAssignment({ plan: paidPlanId, subscriptionId })).rejects.toThrow(/seats of the subscription/);
      await fail(first);

      await expect(newAssignment({ plan: paidPlanId, subscriptionId })).resolves.toEqual(expect.any(String));
      await expect(newAssignment({ plan: paidPlanId, subscriptionId, employeeId: employee })).rejects.toThrow(
        /seats of the subscription/,
      );
    });

    it('does not make the same person overlap themselves: after failing, they can hold a seat on that day again', async () => {
      const subscriptionId = randomUUID();
      await sql.query(
        `INSERT INTO subscriptions (id, organization_id, plan_id, kind, status, purchased_quantity)
         VALUES ($1, $2, $3, 'TERM', 'DRAFT', 5)`,
        [subscriptionId, organizationId, paidPlanId],
      );
      const employee = await newEmployee();
      const first = await newAssignment({ plan: paidPlanId, subscriptionId, employeeId: employee });

      await expect(newAssignment({ plan: paidPlanId, subscriptionId, employeeId: employee })).rejects.toThrow();
      await fail(first);

      await expect(newAssignment({ plan: paidPlanId, subscriptionId, employeeId: employee })).resolves.toEqual(
        expect.any(String),
      );
    });
  });

  describe('the lines a task may follow, whoever writes it (the state machine of the task)', () => {
    const NO_FAILURE = `failed_by_app_user_id = NULL, failed_at = NULL, failure_reason = NULL, failure_kind = NULL`;
    const COMPLETE = `status = 'COMPLETED', completed_by_app_user_id = $2, completed_at = now(), evidence = 'done'`;
    const CLOSE = `status = 'CLOSED_FAILED', closed_by_app_user_id = $2, closed_at = now(), close_reason = 'given up'`;
    const FAILURE = `failed_at = now(), failure_reason = 'refused', failure_kind = 'PERMANENT'`;
    const taken = async (): Promise<string> => {
      const id = await newTask('MANUAL');
      await update(id, `status = 'IN_PROGRESS', claimed_by_app_user_id = $2, claimed_at = now()`, [person()]);

      return id;
    };
    const waiting = async (): Promise<string> => {
      const id = await newTask('CONNECTOR');
      await update(
        id,
        `status = 'RETRY_SCHEDULED', failure_kind = 'TRANSIENT', attempts = 1, last_error = 'timeout', next_retry_at = now()`,
      );

      return id;
    };

    it.each([
      [
        'a queued task cannot be completed without being taken',
        async () => newTask('MANUAL'),
        `${COMPLETE}, claimed_by_app_user_id = $2, claimed_at = now()`,
      ],
      [
        'a failed task cannot be completed: a decision comes first',
        async () => failedTask('MANUAL'),
        `${COMPLETE}, ${NO_FAILURE}`,
      ],
      [
        'a queued task cannot be closed as failed: it never failed',
        async () => newTask('CONNECTOR'),
        `${CLOSE}, ${FAILURE}`,
      ],
      ['a task in progress cannot be closed as failed: it must fail first', taken, `${CLOSE}, ${FAILURE}`],
      [
        'a task in progress cannot be put back in the queue',
        taken,
        `status = 'QUEUED', claimed_by_app_user_id = NULL, claimed_at = NULL`,
      ],
      [
        'a task waiting for its retry cannot be taken by hand',
        waiting,
        `status = 'IN_PROGRESS', claimed_at = now(), failure_kind = NULL, next_retry_at = NULL`,
      ],
    ])('refuses it: %s', async (_label, prepare, set) => {
      const id = await prepare();

      expect(await update(id, set, set.includes('$2') ? [person()] : [])).toBe('55000');
    });

    it('lets a task follow every line the application takes: taken, completed, failed, retried, handed off, closed', async () => {
      const claimed = await taken();
      expect(await update(claimed, `${COMPLETE}`, [person()])).toBeNull();

      const failed = await failedTask('MANUAL');
      expect(
        await update(
          failed,
          `status = 'QUEUED', channel = 'MANUAL', claimed_by_app_user_id = NULL, claimed_at = NULL, ${NO_FAILURE}`,
        ),
      ).toBeNull();

      const connector = await failedTask('CONNECTOR');
      expect(await update(connector, `${CLOSE}`, [person()])).toBeNull();

      const retrying = await waiting();
      expect(await update(retrying, `status = 'FAILED', ${FAILURE}, next_retry_at = NULL`)).toBeNull();
    });
  });
});
