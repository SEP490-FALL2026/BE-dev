import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { PROJECT_ROOT, stopCliProcesses } from '../../support/cli-process';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
} from '../../support/migration-history';

/**
 * `qd93-remove-fallback-substitute-approvers`, Task 13 (Phase B): `…_identity_drop_approval_role_holders` stops with `P0001` and lists
 * the rows while the data still needs what it drops (the spec's three blocking kinds), and otherwise drops the table, the trigger,
 * the function and the type and keeps the Super Admin / department head exclusion.
 *
 * The kinds are tried one by one on the guard block of the migration itself (the text of the committed file, run on the schema before
 * the migration inside a transaction that is rolled back): a deploy of the history costs about a minute, so only three cases are
 * deployed whole — a refusal that Prisma reports, a clean drop, and the drop with the data that must not stop it.
 */
const MIGRATION = migrationEndingWith('_identity_drop_approval_role_holders');
const CHECK_VIOLATION = '23514';
const RAISE_EXCEPTION = 'P0001';

/** The guard of the migration: from its first `DO $$` to the `END $$;` that closes it. */
function guardOfMigration(): string {
  const text = readFileSync(join(PROJECT_ROOT, 'prisma', 'migrations', MIGRATION, 'migration.sql'), 'utf8');
  const start = text.indexOf('DO $$');
  const end = text.indexOf('END $$;', start);
  if (start < 0 || end < 0) throw new Error('The guard of the migration was not found');

  return text.slice(start, end + 'END $$;'.length);
}

interface World {
  orgId: string;
  department: string;
  headedDepartment: string;
  costCenterId: string;
  planId: string;
  createdBy: string;
  /** The spending approver: a SPENDING_APPROVER grant that is in force. */
  approver: Person;
  /** Held a SPENDING_APPROVER grant once; it was revoked. */
  former: Person;
  /** Never held the grant: the substitute of the old rule. */
  substitute: Person;
  requester: Person;
  /** Has an account, no role, and heads nothing. */
  plain: Person;
  /** Heads a department. */
  head: Person;
}

interface Person {
  employeeId: string;
  code: string;
  appUserId: string;
}

describe('drop approval_role_holders migration (integration, PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  const opened: Array<{ database: DisposableDatabase; sql: Client }> = [];

  const open = async (): Promise<void> => {
    database = await provisionDisposableDatabase();
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    opened.push({ database, sql });
    const before = await deployMigrations(database, { through: migrationBefore(MIGRATION) });
    if (before.code !== 0) throw new Error(`Deploying the history before the migration failed: ${before.stdout}`);
  };

  async function person(orgId: string, department: string, code: string): Promise<Person> {
    const employeeId = randomUUID();
    const appUserId = randomUUID();
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, work_email, normalized_work_email, employment_type, hire_date, updated_at)
       VALUES ($1, $2, $3, $3, $4, $4, 'STAFF'::"EmploymentType", '2026-01-01', now())`,
      [employeeId, orgId, code, `${code.toLowerCase()}@acme.test`],
    );
    await sql.query(
      `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
       VALUES (gen_random_uuid(), $1, $2, $3, '2026-01-01')`,
      [orgId, employeeId, department],
    );
    await sql.query(
      `INSERT INTO app_users (id, organization_id, employee_id, login_email, normalized_login_email, status, activation_state,
                              email_verification_source, email_verified_at, updated_at)
       VALUES ($1, $2, $3, $4, $4, 'ACTIVE', 'ACTIVATED', 'INVITATION_REDEEMED', now(), now())`,
      [appUserId, orgId, employeeId, `${code.toLowerCase()}@acme.test`],
    );

    return { employeeId, code, appUserId };
  }

  const grant = (orgId: string, who: Person, role: string, revoked = false) =>
    sql.query(
      `INSERT INTO role_grants (id, organization_id, app_user_id, role, revoked_at)
       VALUES (gen_random_uuid(), $1, $2, $3::"AppRole", ${revoked ? 'now()' : 'NULL'})`,
      [orgId, who.appUserId, role],
    );

  /** The rows the release before wrote, as plain SQL on the schema before the migration. */
  async function seedWorld(): Promise<World> {
    const orgId = randomUUID();
    const department = randomUUID();
    const headedDepartment = randomUUID();
    const costCenterId = randomUUID();
    const appId = randomUUID();
    const planId = randomUUID();
    await sql.query(
      `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme Corp', 'Asia/Ho_Chi_Minh', 'VND')`,
      [orgId],
    );
    await sql.query(
      `INSERT INTO departments (id, organization_id, code, name, updated_at) VALUES ($1, $3, 'DEPT-A', 'Engineering', now()), ($2, $3, 'DEPT-B', 'Finance', now())`,
      [department, headedDepartment, orgId],
    );
    await sql.query(
      `INSERT INTO cost_centers (id, organization_id, code, name, kind, status, department_id, linked_at) VALUES ($1, $2, 'CC-01', 'Engineering CC', 'UNIT', 'ACTIVE', $3, now())`,
      [costCenterId, orgId, department],
    );
    const requester = await person(orgId, department, 'E-REQ');
    const approver = await person(orgId, headedDepartment, 'E-SPA');
    const former = await person(orgId, headedDepartment, 'E-FORMER');
    const substitute = await person(orgId, headedDepartment, 'E-SUB');
    const plain = await person(orgId, department, 'E-PLAIN');
    const head = await person(orgId, headedDepartment, 'E-HEAD');
    await sql.query(
      `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
       VALUES (gen_random_uuid(), $1, $2, $3, '2026-02-01')`,
      [orgId, headedDepartment, head.employeeId],
    );
    await grant(orgId, former, 'SPENDING_APPROVER', true);
    await grant(orgId, approver, 'SPENDING_APPROVER');
    await sql.query(
      `INSERT INTO applications (id, organization_id, kind, name, normalized_name, business_owner_employee_id, data_sensitivity,
                                 comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
       VALUES ($1, $2, 'INTERNAL', 'Internal App', 'internal app', $3, 'LOW', false, false, false, false)`,
      [appId, orgId, requester.employeeId],
    );
    await sql.query(
      `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type)
       VALUES ($1, $2, $3, 'Internal Plan', 'internal plan', 'K5')`,
      [planId, orgId, appId],
    );

    return {
      orgId,
      department,
      headedDepartment,
      costCenterId,
      planId,
      createdBy: requester.appUserId,
      approver,
      former,
      substitute,
      requester,
      plain,
      head,
    };
  }

  async function addRequest(world: World, requester: Person, state = 'PENDING'): Promise<string> {
    const id = randomUUID();
    // A draft is not submitted; a withdrawn Request carries who withdrew it and when (the checks of the table).
    await sql.query(
      `INSERT INTO access_requests (id, organization_id, branch, state, plan_id, requester_employee_id, department_id, cost_center_id,
                                    business_reason, term_months, policy, created_by_app_user_id, submitted_at,
                                    withdrawal_requested_at, withdrawn_by_employee_id, withdrawn_at)
       VALUES ($1, $2, 'INTERNAL_FREE', $3::"AccessRequestState", $4, $5, $6, $7, 'Testing', 6, '{"version": 1}'::jsonb, $8,
               CASE WHEN $3 = 'DRAFT' THEN NULL ELSE now() END,
               CASE WHEN $3 = 'WITHDRAWN' THEN now() END, CASE WHEN $3 = 'WITHDRAWN' THEN $5::uuid END,
               CASE WHEN $3 = 'WITHDRAWN' THEN now() END)`,
      [
        id,
        world.orgId,
        state,
        world.planId,
        requester.employeeId,
        world.department,
        world.costCenterId,
        world.createdBy,
      ],
    );

    return id;
  }

  async function addBeneficiary(requestId: string, who: Person): Promise<void> {
    await sql.query(`INSERT INTO access_request_beneficiaries (request_id, employee_id, position) VALUES ($1, $2, 1)`, [
      requestId,
      who.employeeId,
    ]);
  }

  async function addStep(
    requestId: string,
    step: { kind: string; state: 'PENDING' | 'WAITING'; routingRow: number; holder?: Person; reason?: string },
  ): Promise<void> {
    await sql.query(
      `INSERT INTO access_request_steps (id, kind, request_id, sequence, state, assignee_employee_id, assigned_at, routing_row,
                                         waiting_reason, sla_working_days)
       VALUES (gen_random_uuid(), $2::"AccessRequestStepKind", $1, 1, $3::"AccessRequestStepState", $4,
               CASE WHEN $4::uuid IS NULL THEN NULL ELSE now() END, $5, $6, 2)`,
      [requestId, step.kind, step.state, step.holder?.employeeId ?? null, step.routingRow, step.reason ?? null],
    );
  }

  /** Runs the guard of the migration inside a transaction that is rolled back; returns what it raised, or null. */
  async function guard(seed: () => Promise<void>): Promise<{ code: string; message: string } | null> {
    await sql.query('BEGIN');
    try {
      await seed();
      await sql.query(guardOfMigration());

      return null;
    } catch (error) {
      const failure = error as { code?: string; message: string };

      return { code: failure.code ?? '', message: failure.message };
    } finally {
      await sql.query('ROLLBACK');
    }
  }

  afterAll(async () => {
    for (const { database: owned, sql: client } of opened) {
      await client.end().catch(() => undefined);
      await dropDisposableDatabase(owned);
    }
    stopCliProcesses();
  });

  describe('the guard, kind by kind (on the schema before the migration)', () => {
    let world: World;

    beforeAll(async () => {
      await open();
      world = await seedWorld();
    }, DEPLOY_TIMEOUT_MS * 2);

    it('lets clean data through', async () => {
      expect(await guard(() => Promise.resolve())).toBeNull();
    });

    describe('(i) an open Request of which the spending approver is a party', () => {
      it('stops for a Request the spending approver sent, and names it', async () => {
        let requestId = '';
        const raised = await guard(async () => {
          requestId = await addRequest(world, world.approver);
        });

        expect(raised?.code).toBe(RAISE_EXCEPTION);
        expect(raised?.message).toContain('approval role drop blocked');
        expect(raised?.message).toContain(`SPENDING_APPROVER_IS_PARTY ${world.approver.code} request ${requestId}`);
      });

      it('stops for a Request that is for the spending approver', async () => {
        let requestId = '';
        const raised = await guard(async () => {
          requestId = await addRequest(world, world.requester);
          await addBeneficiary(requestId, world.approver);
        });

        expect(raised?.code).toBe(RAISE_EXCEPTION);
        expect(raised?.message).toContain(`SPENDING_APPROVER_IS_PARTY ${world.approver.code} request ${requestId}`);
      });

      it('stops for a Request for a service account the spending approver answers for', async () => {
        let requestId = '';
        const raised = await guard(async () => {
          requestId = await addRequest(world, world.requester);
          await sql.query(
            `INSERT INTO access_request_service_accounts (request_id, purpose, expected_identifier, responsible_employee_id)
             VALUES ($1, 'Nightly job', 'svc-nightly', $2)`,
            [requestId, world.approver.employeeId],
          );
        });

        expect(raised?.code).toBe(RAISE_EXCEPTION);
        expect(raised?.message).toContain(`SPENDING_APPROVER_IS_PARTY ${world.approver.code} request ${requestId}`);
      });

      it.each(['COMPLETED', 'REJECTED', 'WITHDRAWN', 'DRAFT'])(
        'lets a Request that is %s through, whoever sent it',
        async (state) => {
          expect(await guard(async () => void (await addRequest(world, world.approver, state)))).toBeNull();
        },
      );

      it('lets a Request through when the person is not the spending approver now', async () => {
        const raised = await guard(async () => {
          await addRequest(world, world.former);
          await addRequest(world, world.substitute);
        });

        expect(raised).toBeNull();
      });
    });

    describe('(ii) a step of the old routing', () => {
      it.each([3, 4])('stops for a pending need step on row %i', async (routingRow) => {
        let requestId = '';
        const raised = await guard(async () => {
          requestId = await addRequest(world, world.requester);
          await addStep(requestId, { kind: 'NEED', state: 'PENDING', routingRow, holder: world.plain });
        });

        expect(raised?.code).toBe(RAISE_EXCEPTION);
        expect(raised?.message).toContain(`LEGACY_NEED_ROW_${routingRow} request ${requestId}`);
      });

      it.each(['NO_FALLBACK_APPROVER', 'FALLBACK_IS_REQUESTER', 'NO_CONFLICT_SUBSTITUTE'])(
        'stops for a step that waits for %s',
        async (reason) => {
          let requestId = '';
          const raised = await guard(async () => {
            requestId = await addRequest(world, world.requester);
            await addStep(requestId, { kind: 'NEED', state: 'WAITING', routingRow: 8, reason });
          });

          expect(raised?.code).toBe(RAISE_EXCEPTION);
          expect(raised?.message).toContain(`LEGACY_WAITING_${reason} request ${requestId}`);
        },
      );

      it('does not stop for a need step that waits on row 4 for a department head (the row of a wait today)', async () => {
        const raised = await guard(async () => {
          const requestId = await addRequest(world, world.requester);
          await addStep(requestId, { kind: 'NEED', state: 'WAITING', routingRow: 4, reason: 'NO_DEPARTMENT_HEAD' });
        });

        expect(raised).toBeNull();
      });

      it.each(['NO_SPENDING_APPROVER', 'SPENDING_APPROVER_IS_PARTY', 'NO_FINANCE_REVIEWER', 'NO_IT_ADMIN_IN_CHARGE'])(
        'does not stop for a step that waits for %s, a reason of today (the spend routing still writes it)',
        async (reason) => {
          const raised = await guard(async () => {
            const requestId = await addRequest(world, world.requester);
            await addStep(requestId, { kind: 'SPEND_APPROVAL', state: 'WAITING', routingRow: 8, reason });
          });

          expect(raised).toBeNull();
        },
      );

      it.each([1, 2, 5, 9])('does not stop for a pending need step on row %i', async (routingRow) => {
        const raised = await guard(async () => {
          const requestId = await addRequest(world, world.requester);
          await addStep(requestId, { kind: 'NEED', state: 'PENDING', routingRow, holder: world.plain });
        });

        expect(raised).toBeNull();
      });
    });

    describe('(iii) a pending spend step held by somebody who never had the grant', () => {
      it('stops for the substitute of the old rule, and names the step holder and the Request', async () => {
        let requestId = '';
        const raised = await guard(async () => {
          requestId = await addRequest(world, world.requester);
          await addStep(requestId, {
            kind: 'SPEND_APPROVAL',
            state: 'PENDING',
            routingRow: 6,
            holder: world.substitute,
          });
        });

        expect(raised?.code).toBe(RAISE_EXCEPTION);
        expect(raised?.message).toContain(
          `SPEND_STEP_HELD_BY_NON_APPROVER ${world.substitute.code} request ${requestId}`,
        );
      });

      it('lists every blocking row, one per line, whatever the kind', async () => {
        let first = '';
        let second = '';
        const raised = await guard(async () => {
          first = await addRequest(world, world.requester);
          await addStep(first, { kind: 'SPEND_APPROVAL', state: 'PENDING', routingRow: 6, holder: world.substitute });
          second = await addRequest(world, world.requester);
          await addStep(second, { kind: 'NEED', state: 'PENDING', routingRow: 4, holder: world.plain });
        });

        expect(raised?.code).toBe(RAISE_EXCEPTION);
        const lines = (raised?.message ?? '').split('\n');
        expect(lines).toEqual(
          expect.arrayContaining([
            `LEGACY_NEED_ROW_4 request ${second}`,
            `SPEND_STEP_HELD_BY_NON_APPROVER ${world.substitute.code} request ${first}`,
          ]),
        );
      });

      it('does not stop for the spending approver, nor for one whose grant was revoked (an ordinary hand-over)', async () => {
        const raised = await guard(async () => {
          const first = await addRequest(world, world.requester);
          await addStep(first, { kind: 'SPEND_APPROVAL', state: 'PENDING', routingRow: 6, holder: world.approver });
          const second = await addRequest(world, world.requester);
          await addStep(second, { kind: 'SPEND_APPROVAL', state: 'PENDING', routingRow: 6, holder: world.former });
        });

        expect(raised).toBeNull();
      });
    });

    it('does not stop for rows of approval_role_holders: nothing in the application can write or close them any more', async () => {
      const raised = await guard(async () => {
        await sql.query(
          `INSERT INTO approval_role_holders (id, organization_id, role, employee_id, held_from)
           VALUES (gen_random_uuid(), $1, 'FALLBACK_APPROVER'::"ApprovalRole", $2, now() - interval '1 day'),
                  (gen_random_uuid(), $1, 'CONFLICT_SUBSTITUTE'::"ApprovalRole", $3, now() - interval '1 day')`,
          [world.orgId, world.plain.employeeId, world.substitute.employeeId],
        );
      });

      expect(raised).toBeNull();
    });
  });

  it(
    'refuses a deploy, reports P0001 and the row, and drops nothing, while a spend step is held by the substitute',
    async () => {
      await open();
      const world = await seedWorld();
      const requestId = await addRequest(world, world.requester);
      await addStep(requestId, { kind: 'SPEND_APPROVAL', state: 'PENDING', routingRow: 6, holder: world.substitute });

      const attempt = await deployMigrations(database, { through: MIGRATION });

      expect(attempt.code).not.toBe(0);
      const output = attempt.stderr + attempt.stdout;
      expect(output).toContain(RAISE_EXCEPTION);
      expect(output).toContain('approval role drop blocked');
      expect(output).toContain(`SPEND_STEP_HELD_BY_NON_APPROVER ${world.substitute.code} request ${requestId}`);
      const survivors = await sql.query<{ tbl: string | null; typ: string | null; fn: string | null }>(
        `SELECT to_regclass('public.approval_role_holders') AS tbl, to_regtype('public."ApprovalRole"') AS typ,
                to_regproc('approval_role_holders_distinct_approver_and_substitute') AS fn`,
      );
      expect(survivors.rows[0]).toEqual({
        tbl: 'approval_role_holders',
        typ: '"ApprovalRole"',
        fn: 'approval_role_holders_distinct_approver_and_substitute',
      });
    },
    DEPLOY_TIMEOUT_MS * 2,
  );

  it(
    'drops the table, the trigger, the function and the type on data that does not stop it, and the Super Admin rule stays',
    async () => {
      await open();
      const world = await seedWorld();
      // What must not stop it: a wait on row 4 for a head, a wait for the spending approver or for the party reason, a spend step of the
      // current and of a former spending approver, and rows of the table that nothing can close any more.
      const waiting = await addRequest(world, world.requester);
      await addStep(waiting, { kind: 'NEED', state: 'WAITING', routingRow: 4, reason: 'NO_DEPARTMENT_HEAD' });
      const spend = await addRequest(world, world.requester);
      await addStep(spend, {
        kind: 'SPEND_APPROVAL',
        state: 'WAITING',
        routingRow: 8,
        reason: 'SPENDING_APPROVER_IS_PARTY',
      });
      const held = await addRequest(world, world.requester);
      await addStep(held, { kind: 'SPEND_APPROVAL', state: 'PENDING', routingRow: 6, holder: world.former });
      await sql.query(
        `INSERT INTO approval_role_holders (id, organization_id, role, employee_id, held_from)
         VALUES (gen_random_uuid(), $1, 'FALLBACK_APPROVER'::"ApprovalRole", $2, now() - interval '1 day')`,
        [world.orgId, world.plain.employeeId],
      );

      const deploy = await deployMigrations(database, { through: MIGRATION });
      expect(deploy.code).toBe(0);

      const dropped = await sql.query<{ tbl: string | null; typ: string | null; fn: string | null; trg: number }>(
        `SELECT to_regclass('public.approval_role_holders') AS tbl, to_regtype('public."ApprovalRole"') AS typ,
                to_regproc('approval_role_holders_distinct_approver_and_substitute') AS fn,
                (SELECT count(*)::int FROM pg_trigger WHERE tgname = 'approval_role_holders_distinct') AS trg`,
      );
      expect(dropped.rows[0]).toEqual({ tbl: null, typ: null, fn: null, trg: 0 });

      // The function was rewritten and no longer reads the table: a Super Admin who heads nothing is granted (this fails with 42P01
      // when the function still names approval_role_holders), and one who heads a department is still refused.
      await grant(world.orgId, world.plain, 'SUPER_ADMIN');
      const granted = await sql.query(
        `SELECT 1 FROM role_grants WHERE app_user_id = $1 AND role = 'SUPER_ADMIN'::"AppRole" AND revoked_at IS NULL`,
        [world.plain.appUserId],
      );
      expect(granted.rowCount).toBe(1);
      await expect(grant(world.orgId, world.head, 'SUPER_ADMIN')).rejects.toMatchObject({ code: CHECK_VIOLATION });
    },
    DEPLOY_TIMEOUT_MS * 2,
  );
});
