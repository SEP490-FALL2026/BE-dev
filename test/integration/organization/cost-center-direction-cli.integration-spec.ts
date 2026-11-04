import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  CLI_COLD_START_MS,
  CLI_LONG_LOCK_WAIT,
  CliResult,
  cliWorkingDirectory,
  runCli,
  stopCliProcesses,
} from '../../support/cli-process';
import { lastCompatibilityMigration } from '../../support/compat-release';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';
import { expansionWorld, ExpansionWorld } from '../../support/expansion-world';
import { waitForLockWaiters } from '../../support/lock-wait';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
} from '../../support/migration-history';

/**
 * `g0-g6-final-business-baseline-remediation`, Task 1.1a (F01, F68, spec L.11): `pnpm ops:cost-center-direction`. `activate`
 * records once that the installation runs the compatibility release; `link` gives ONE Cost Center that has no department its
 * department on the basis Finance approved. One record per run, in one transaction with its Audit Trail event; nothing
 * inferred, nothing printed but ids and the outcome. Every Cost Center here is written the way `7c28e75` writes one — no
 * department — by plain SQL. The procedure belongs to the compatibility window, so the database is the schema of the compatibility
 * release (the history **through** its last migration): from the final migration on a Cost Center cannot exist without its department.
 */
const LINK_MIGRATION = migrationEndingWith('_cost_center_department_link');
const EVIDENCE = 'deploy 2026-10-28 run 7, image sha256:abc123';
const BASIS = 'FIN-2026-017 (Finance board minute 12)';
const APPROVER = 'finance-lead@acme.example';
const OPERATOR = 'ops-lead@acme.example';

describe('ops:cost-center-direction (integration, real CLI and PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let world: ExpansionWorld;
  let counter = 0;
  let retiredDepartmentCode: string;

  const run = (args: string[], target: DisposableDatabase = database): Promise<CliResult> =>
    runCli('cost-center-direction', args, {
      cwd: cliWorkingDirectory('slm-cc-direction'),
      environment: { NODE_ENV: 'production', DATABASE_URL: target.url, ...CLI_LONG_LOCK_WAIT },
    });
  const linkArguments = (
    costCenter: string,
    department: string,
    overrides: { basis?: string; environment?: string; approvedBy?: string; operator?: string } = {},
  ) => [
    'link',
    '--cost-center',
    costCenter,
    '--department',
    department,
    '--basis',
    overrides.basis ?? BASIS,
    '--approved-by',
    overrides.approvedBy ?? APPROVER,
    '--operator',
    overrides.operator ?? OPERATOR,
    '--environment',
    overrides.environment ?? 'SHARED',
  ];
  const activateArguments = (overrides: { evidence?: string; environment?: string; approvedBy?: string } = {}) => [
    'activate',
    '--release-evidence',
    overrides.evidence ?? EVIDENCE,
    '--approved-by',
    overrides.approvedBy ?? 'release-owner@acme.example',
    '--operator',
    OPERATOR,
    '--environment',
    overrides.environment ?? 'SHARED',
  ];
  const link = (costCenter: string, department: string, target: DisposableDatabase = database) =>
    run(linkArguments(costCenter, department), target);
  const counts = async () => ({
    links: Number((await sql.query<{ n: string }>(`SELECT count(*) AS n FROM cost_center_department_links`)).rows[0].n),
    activations: Number(
      (await sql.query<{ n: string }>(`SELECT count(*) AS n FROM cost_center_direction_activations`)).rows[0].n,
    ),
    audit: Number((await sql.query<{ n: string }>(`SELECT count(*) AS n FROM audit_events`)).rows[0].n),
    unlinked: Number(
      (await sql.query<{ n: string }>(`SELECT count(*) AS n FROM cost_centers WHERE department_id IS NULL`)).rows[0].n,
    ),
  });

  /** A Cost Center as `7c28e75` writes one: no department, no link. */
  const freeCostCenter = async (
    options: { status?: 'ACTIVE' | 'INACTIVE'; createdAt?: string; deactivatedAt?: string } = {},
  ): Promise<string> => {
    const id = randomUUID();
    counter += 1;
    await sql.query(
      `INSERT INTO cost_centers (id, organization_id, code, name, kind, status, created_at, deactivated_at)
       VALUES ($1, $2, $3, 'Free', 'UNIT', $4::"CostCenterStatus", COALESCE($5::timestamptz, now()), $6::timestamptz)`,
      [
        id,
        world.organizationId,
        `CC-F${counter}`,
        options.status ?? 'ACTIVE',
        options.createdAt ?? null,
        options.status === 'INACTIVE' ? (options.deactivatedAt ?? new Date().toISOString()) : null,
      ],
    );

    return id;
  };
  /** A department with no Cost Center: the start `QĐ-87d(1)` allows. */
  const bareDepartment = async (createdAt?: string): Promise<{ id: string; code: string }> => {
    const id = randomUUID();
    counter += 1;
    const code = `BARE${counter}`;
    await sql.query(
      `INSERT INTO departments (id, organization_id, code, name, created_at, updated_at)
       VALUES ($1, $2, $3, 'Bare', COALESCE($4::timestamptz, now()), now())`,
      [id, world.organizationId, code, createdAt ?? null],
    );

    return { id, code };
  };

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    const deploy = await deployMigrations(database, { through: lastCompatibilityMigration() });
    if (deploy.code !== 0) throw new Error(`Deploying the compatibility release failed: ${deploy.stdout}`);
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    world = await expansionWorld(sql);
    retiredDepartmentCode = 'GONE';
    await sql.query(
      `INSERT INTO departments (id, organization_id, code, name, status, deactivated_at, updated_at)
       VALUES ($1, $2, $3, 'Gone', 'INACTIVE', now(), now())`,
      [randomUUID(), world.organizationId, retiredDepartmentCode],
    );
  }, DEPLOY_TIMEOUT_MS);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
    stopCliProcesses();
  });

  it(
    'prints the usage and exits 0 for --help, with nothing configured',
    async () => {
      const result = await runCli('cost-center-direction', ['--help'], {
        cwd: cliWorkingDirectory('slm-cc-direction'),
        environment: { NODE_ENV: 'production' },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('ops:cost-center-direction');
    },
    CLI_COLD_START_MS,
  );

  it(
    'refuses no mode, a missing option, a flag it does not know, a bulk or inferring option and a secret in an option, and changes nothing',
    async () => {
      const before = await counts();
      const id = await freeCostCenter();
      const results = await Promise.all([
        run([]),
        run(['link', '--cost-center', id, '--department', 'BARE1']),
        run([...linkArguments(id, 'BARE1'), '--all']),
        run([...linkArguments(id, 'BARE1'), '--by-name']),
        run([...linkArguments(id, 'BARE1'), '--password', 'x']),
        run([...activateArguments(), '--cost-center', id]),
      ]);

      for (const result of results) expect(result.code).toBe(1);
      expect(results[1].stderr).toContain('--approved-by is required');
      expect(results[4].stderr).toContain('no password, token or code');
      expect(await counts()).toEqual({ ...before, unlinked: before.unlinked + 1 });
    },
    CLI_COLD_START_MS * 2,
  );

  describe('link', () => {
    it(
      'links one Cost Center in use to a department with none: the record of the basis, the link, an OPERATOR audit event, and an output of two ids and the outcome only',
      async () => {
        const costCenter = await freeCostCenter();
        const department = await bareDepartment();

        const result = await link(costCenter, department.code);

        expect(result).toMatchObject({ code: 0 });
        expect(result.stdout).toContain(`cost-center:  ${costCenter}`);
        expect(result.stdout).toContain(`department:   ${department.id}`);
        expect(result.stdout).toContain('outcome:      LINKED');
        // Nothing the operator typed comes back: no basis, approver, operator or department code.
        for (const secret of [BASIS, APPROVER, OPERATOR, department.code]) {
          expect(result.stdout + result.stderr).not.toContain(secret);
        }

        const record = await sql.query(
          `SELECT department_id, basis_reference, approver_ref, operator_ref, environment
             FROM cost_center_department_links WHERE cost_center_id = $1`,
          [costCenter],
        );
        expect(record.rows).toEqual([
          {
            department_id: department.id,
            basis_reference: BASIS,
            approver_ref: APPROVER,
            operator_ref: OPERATOR,
            environment: 'SHARED',
          },
        ]);
        // The link is the Cost Center's from now on, never before either record existed (F68), and the previous release,
        // which reads the department's own column, now reads this Cost Center as the department's.
        const row = (
          await sql.query<{ department_id: string; not_before: boolean; not_future: boolean; old_column: string }>(
            `SELECT c.department_id, (c.linked_at >= c.created_at AND c.linked_at >= d.created_at) AS not_before,
                    (c.linked_at <= now()) AS not_future, d.cost_center_id::text AS old_column
               FROM cost_centers c JOIN departments d ON d.id = c.department_id WHERE c.id = $1`,
            [costCenter],
          )
        ).rows[0];
        expect(row).toEqual({
          department_id: department.id,
          not_before: true,
          not_future: true,
          old_column: costCenter,
        });
        const audit = await sql.query<{
          actor_kind: string;
          actor_app_user_id: string | null;
          action: string;
          resource_type: string;
          operator_reference: string;
          before: unknown;
          after: Record<string, unknown>;
        }>(
          `SELECT actor_kind, actor_app_user_id, action, resource_type, operator_reference, before, after
             FROM audit_events WHERE resource_id = $1`,
          [costCenter],
        );
        expect(audit.rows).toHaveLength(1);
        expect(audit.rows[0]).toMatchObject({
          actor_kind: 'OPERATOR',
          actor_app_user_id: null,
          action: 'COST_CENTER.DEPARTMENT_LINKED_BY_PROCEDURE',
          resource_type: 'CostCenter',
          operator_reference: BASIS,
          before: { departmentId: null, linkedAt: null },
        });
        expect(audit.rows[0].after).toMatchObject({
          departmentId: department.id,
          basis: BASIS,
          approver: APPROVER,
          operator: OPERATOR,
          environment: 'SHARED',
        });
      },
      CLI_COLD_START_MS,
    );

    it(
      'run again for the same Cost Center and department: exit 2, nothing is written a second time',
      async () => {
        const costCenter = await freeCostCenter();
        const department = await bareDepartment();
        expect((await link(costCenter, department.code)).code).toBe(0);
        const before = await counts();

        const again = await link(costCenter, department.code);

        expect(again.code).toBe(2);
        expect(again.stdout).toContain('outcome:      ALREADY_LINKED');
        expect(await counts()).toEqual(before);
      },
      CLI_COLD_START_MS * 2,
    );

    it(
      'links a retired Cost Center to any department of the organization as history, with an empty current interval (F68: never before the department)',
      async () => {
        // Retired on 1 January, but the department it is linked to was created on 1 February: the link cannot predate it.
        const costCenter = await freeCostCenter({
          status: 'INACTIVE',
          createdAt: '2025-12-01T00:00:00Z',
          deactivatedAt: '2026-01-01T00:00:00Z',
        });
        const department = await bareDepartment('2026-02-01T00:00:00Z');
        await sql.query(`UPDATE departments SET status = 'INACTIVE', deactivated_at = now() WHERE id = $1`, [
          department.id,
        ]);

        const result = await link(costCenter, department.code);

        expect(result.code).toBe(0);
        const row = (
          await sql.query<{ linked_at: Date; old_column: string | null }>(
            `SELECT c.linked_at, d.cost_center_id::text AS old_column
               FROM cost_centers c JOIN departments d ON d.id = c.department_id WHERE c.id = $1`,
            [costCenter],
          )
        ).rows[0];
        expect(row.linked_at.toISOString()).toBe('2026-02-01T00:00:00.000Z');
        // A retired Cost Center never becomes the department's column: the previous release keeps reading what it read.
        expect(row.old_column).toBeNull();
      },
      CLI_COLD_START_MS,
    );

    it.each([
      ['a Cost Center that does not exist', 'COST_CENTER_NOT_FOUND'],
      ['a department that does not exist', 'DEPARTMENT_NOT_FOUND'],
      ['a retired department for a Cost Center in use', 'DEPARTMENT_NOT_ACTIVE'],
      ['a department that already has a Cost Center in use', 'DEPARTMENT_ALREADY_HAS_ACTIVE_COST_CENTER'],
      ['a Cost Center that already belongs to another department', 'COST_CENTER_ALREADY_LINKED'],
      ['a basis of one character', 'BASIS_INVALID'],
      ['the same person approving and running it in SHARED', 'APPROVER_IS_OPERATOR'],
      ['a Cost Center with a budget already charged to it', 'COST_CENTER_REFERENCES_CONFLICT'],
    ])(
      'refuses %s with %s, exit 1, nothing changed',
      async (name, problem) => {
        let costCenter = await freeCostCenter();
        let department = (await bareDepartment()).code;
        let args: string[] | null = null;
        if (name.includes('Cost Center that does not exist')) costCenter = randomUUID();
        else if (name.includes('department that does not exist')) department = 'NOPE';
        else if (name.includes('retired department')) department = retiredDepartmentCode;
        else if (name.includes('already has a Cost Center in use')) department = 'ENG';
        else if (name.includes('already belongs')) {
          expect((await link(costCenter, department)).code).toBe(0);
          department = (await bareDepartment()).code;
        } else if (name.includes('one character')) args = linkArguments(costCenter, department, { basis: 'x' });
        else if (name.includes('same person')) {
          args = linkArguments(costCenter, department, { approvedBy: OPERATOR });
        } else {
          // Charged already: the Cost Center carries a budget proposal, which holds no department of its own.
          await sql.query(
            `INSERT INTO budget_proposals (id, organization_id, cost_center_id, year, state, total_minor, currency,
                                           submitted_by_employee_id, updated_at)
             VALUES ($1, $2, $3, 2026, 'SUBMITTED', 0, 'VND', $4, now())`,
            [randomUUID(), world.organizationId, costCenter, world.ownerEmployeeId],
          );
        }
        const before = await counts();

        const result = await run(args ?? linkArguments(costCenter, department));

        expect(result.code).toBe(1);
        expect(result.stderr).toContain(`Refused (${problem}). Nothing was changed.`);
        expect(await counts()).toEqual(before);
      },
      CLI_COLD_START_MS * 2,
    );

    it(
      'queues linking one Cost Center to two departments behind the Cost Center row (spec L.11): the first in line is linked, the second is refused',
      async () => {
        const costCenter = await freeCostCenter();
        const first = await bareDepartment();
        const second = await bareDepartment();
        const holder = new Client({ connectionString: database.url });
        await holder.connect();
        try {
          // The contended row is the Cost Center: each run takes its own department first, then waits for it here.
          await holder.query('BEGIN');
          await holder.query('SELECT id FROM cost_centers WHERE id = $1 FOR UPDATE', [costCenter]);
          const one = link(costCenter, first.code);
          await waitForLockWaiters(sql, 1, CLI_COLD_START_MS, [one]);
          const two = link(costCenter, second.code);
          await waitForLockWaiters(sql, 2, CLI_COLD_START_MS, [one, two]);
          await holder.query('COMMIT');

          const [a, b] = await Promise.all([one, two]);

          expect({ first: a.code, second: b.code }).toEqual({ first: 0, second: 1 });
          expect(
            (
              await sql.query<{ department_id: string }>(
                `SELECT department_id FROM cost_center_department_links WHERE cost_center_id = $1`,
                [costCenter],
              )
            ).rows,
          ).toEqual([{ department_id: first.id }]);
          expect(b.stderr).toContain('Refused (COST_CENTER_ALREADY_LINKED). Nothing was changed.');
        } finally {
          await holder.query('ROLLBACK').catch(() => undefined);
          await holder.end();
        }
      },
      CLI_COLD_START_MS * 3,
    );

    it(
      'queues linking a Cost Center in use to a department against the creation of one for that department: the creation first in line wins, the link is refused',
      async () => {
        const costCenter = await freeCostCenter();
        const department = await bareDepartment();
        // What Finance's creation does for the department: it takes the department row, then writes its Cost Center.
        const holder = new Client({ connectionString: database.url });
        await holder.connect();
        try {
          await holder.query('BEGIN');
          await holder.query('SELECT id FROM departments WHERE id = $1 FOR UPDATE', [department.id]);
          const linking = link(costCenter, department.code);
          await waitForLockWaiters(sql, 1, CLI_COLD_START_MS, [linking]);
          await holder.query(
            `INSERT INTO cost_centers (id, organization_id, code, name, kind, status, department_id, linked_at)
             VALUES (gen_random_uuid(), $1, $2, 'Created for it', 'UNIT', 'ACTIVE', $3, now())`,
            [world.organizationId, `CC-RACE${(counter += 1)}`, department.id],
          );
          await holder.query('COMMIT');

          const result = await linking;

          expect(result.code).toBe(1);
          expect(result.stderr).toContain('Refused (DEPARTMENT_ALREADY_HAS_ACTIVE_COST_CENTER). Nothing was changed.');
          expect(
            (
              await sql.query<{ department_id: string | null }>(
                `SELECT department_id FROM cost_centers WHERE id = $1`,
                [costCenter],
              )
            ).rows,
          ).toEqual([{ department_id: null }]);
        } finally {
          await holder.query('ROLLBACK').catch(() => undefined);
          await holder.end();
        }
      },
      CLI_COLD_START_MS * 2,
    );
  });

  describe('activate', () => {
    it(
      'refuses a short evidence and the same person approving and running it in SHARED, and changes nothing',
      async () => {
        const before = await counts();

        const short = await run(activateArguments({ evidence: 'x' }));
        const same = await run(activateArguments({ approvedBy: OPERATOR }));

        expect(short.code).toBe(1);
        expect(short.stderr).toContain('Refused (RELEASE_EVIDENCE_INVALID). Nothing was changed.');
        expect(same.code).toBe(1);
        expect(same.stderr).toContain('Refused (APPROVER_IS_OPERATOR). Nothing was changed.');
        expect(await counts()).toEqual(before);
      },
      CLI_COLD_START_MS * 2,
    );

    it(
      'records the activation once, with an OPERATOR audit event, and an output that names only the organization and the outcome; a second run is exit 2',
      async () => {
        const result = await run(activateArguments());

        expect(result.code).toBe(0);
        expect(result.stdout).toContain(`organization: ${world.organizationId}`);
        expect(result.stdout).toContain('outcome:      ACTIVATED');
        for (const secret of [EVIDENCE, 'release-owner@acme.example', OPERATOR]) {
          expect(result.stdout + result.stderr).not.toContain(secret);
        }
        expect(
          (
            await sql.query(
              `SELECT release_evidence, approver_ref, operator_ref, environment FROM cost_center_direction_activations`,
            )
          ).rows,
        ).toEqual([
          {
            release_evidence: EVIDENCE,
            approver_ref: 'release-owner@acme.example',
            operator_ref: OPERATOR,
            environment: 'SHARED',
          },
        ]);
        const audit = await sql.query<{ actor_kind: string; action: string; operator_reference: string }>(
          `SELECT actor_kind, action, operator_reference FROM audit_events WHERE action = 'COST_CENTER_DIRECTION.ACTIVATED'`,
        );
        expect(audit.rows).toEqual([
          { actor_kind: 'OPERATOR', action: 'COST_CENTER_DIRECTION.ACTIVATED', operator_reference: EVIDENCE },
        ]);

        const before = await counts();
        const again = await run(activateArguments());

        expect(again.code).toBe(2);
        expect(again.stdout).toContain('outcome:      ALREADY_ACTIVATED');
        expect(await counts()).toEqual(before);
      },
      CLI_COLD_START_MS * 2,
    );
  });

  it(
    'on a database before the compatibility migration there is nothing to write to: SCHEMA_NOT_READY for both modes, exit 1, no write',
    async () => {
      const old = await provisionDisposableDatabase();
      const oldSql = new Client({ connectionString: old.url });
      try {
        const deploy = await deployMigrations(old, { through: migrationBefore(LINK_MIGRATION) });
        if (deploy.code !== 0)
          throw new Error(`Deploying the history before the link migration failed: ${deploy.stdout}`);
        await oldSql.connect();
        await expansionWorld(oldSql);

        const linked = await link(randomUUID(), 'ENG', old);
        const activated = await run(activateArguments(), old);

        for (const result of [linked, activated]) {
          expect(result.code).toBe(1);
        }
        // The Cost Center is looked up only after the probe, so an unknown id cannot hide the answer for this one.
        expect(linked.stderr).toContain('Refused (SCHEMA_NOT_READY). Nothing was changed.');
        expect(activated.stderr).toContain('Refused (SCHEMA_NOT_READY). Nothing was changed.');
        expect(Number((await oldSql.query<{ n: string }>(`SELECT count(*) AS n FROM audit_events`)).rows[0].n)).toBe(0);
      } finally {
        await oldSql.end();
        await dropDisposableDatabase(old);
      }
    },
    DEPLOY_TIMEOUT_MS + CLI_COLD_START_MS * 3,
  );
});
