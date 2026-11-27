import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { PROJECT_ROOT } from '../../support/cli-process';
import { dropDisposableDatabase, provisionDisposableDatabase } from '../../support/disposable-database';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
} from '../../support/migration-history';

const TARGET = migrationEndingWith('_w3_workspaces');
const sqlOf = (directory: string): string =>
  readFileSync(join(PROJECT_ROOT, 'prisma', 'migrations', directory, 'migration.sql'), 'utf8');

/** The world M4 part 1 meets: an organization, three IT Admins and a way to make a vendor, an application and a plan. */
async function world(sql: Client) {
  const organizationId = randomUUID();
  await sql.query(
    `INSERT INTO currencies (code, name, minor_unit) VALUES ('VND', 'Vietnamese Dong', 0) ON CONFLICT (code) DO NOTHING`,
  );
  await sql.query(
    `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
    [organizationId],
  );
  const functionalGroupId = randomUUID();
  await sql.query(
    `INSERT INTO functional_groups (id, organization_id, name, normalized_name) VALUES ($1, $2, 'General', 'general')`,
    [functionalGroupId, organizationId],
  );
  const person = async (code: string): Promise<string> => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       VALUES ($1, $2, $3, $3, 'STAFF', '2026-01-01', now())`,
      [id, organizationId, code],
    );

    return id;
  };
  const vendor = async (name: string | null): Promise<string | null> => {
    if (name === null) return null;
    const id = randomUUID();
    await sql.query(`INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, $3, lower($3))`, [
      id,
      organizationId,
      name,
    ]);

    return id;
  };
  const khoa = await person('KHOA');
  const nam = await person('NAM');
  const plan = async (vendorId: string | null, name: string, type: 'K2' | 'K3') => {
    const applicationId = randomUUID();
    await sql.query(
      `INSERT INTO applications (id, organization_id, kind, vendor_id, functional_group_id, name, normalized_name, responsible_it_admin_employee_id)
       VALUES ($1, $2, $3::"ApplicationKind", $4, $5, $6, lower($6), $7)`,
      [
        applicationId,
        organizationId,
        vendorId === null ? 'INTERNAL' : 'SAAS',
        vendorId,
        functionalGroupId,
        `${name} app`,
        khoa,
      ],
    );
    const planId = randomUUID();
    await sql.query(
      `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level)
       VALUES ($1, $2, $3, $4, lower($4), $5::"ProvisioningType", $6::"PricingModel", 'FULL'::"ControlLevel")`,
      [planId, organizationId, applicationId, name, type, type === 'K2' ? 'PER_SEAT' : null],
    );

    return planId;
  };
  const profile = async (
    planId: string,
    primaryOwner: string,
    createdAt: string,
    members: Array<[string, 'OWNER' | 'ADMIN']>,
    adminNote: string | null = null,
  ) => {
    await sql.query(
      `INSERT INTO plan_workspace_profiles (plan_id, primary_owner_employee_id, admin_note, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4)`,
      [planId, primaryOwner, adminNote, createdAt],
    );
    for (const [employeeId, role] of members) {
      await sql.query(
        `INSERT INTO plan_workspace_admins (plan_id, employee_id, role) VALUES ($1, $2, $3::"WorkspaceRole")`,
        [planId, employeeId, role],
      );
    }
  };
  const subscription = async (planId: string, responsible: string, createdAt: string) => {
    await sql.query(
      `INSERT INTO subscriptions (id, organization_id, plan_id, kind, status, purchased_quantity, billing_cycle, commitment_term_months,
         start_date, responsible_it_admin_employee_id, created_at, unit_price_minor, unit_price_currency, price_recorded_on, price_rate,
         price_rate_date, price_rate_source, price_reporting_minor, price_reporting_currency, monthly_unit_price_minor)
       VALUES ($1, $2, $3, 'TERM'::"SubscriptionKind", 'ACTIVE'::"SubscriptionStatus", 5, 'MONTHLY'::"BillingCycle", 1, '2026-10-01', $4, $5,
         375000, 'VND', '2026-10-01', '1.0000000000', '2026-10-01', 'SAME_CURRENCY'::"PriceRateSource", 375000, 'VND', 375000)`,
      [randomUUID(), organizationId, planId, responsible, createdAt],
    );
  };

  return { organizationId, khoa, nam, vendor, plan, profile, subscription };
}

/**
 * Redesign wave 3, W3-10 (M4 part 1, `20261202000000_w3_workspaces`): the profile of a plan becomes one workspace for each vendor, and a profile of a
 * plan whose application has no vendor stops the migration with the plan named.
 */
describe('M4 part 1 w3_workspaces migration (integration, real PostgreSQL)', () => {
  it(
    'joins the profiles of one vendor into one workspace: the owners win, the first note is kept, the people in charge of the first live subscription answers',
    async () => {
      const database = await provisionDisposableDatabase();
      const sql = new Client({ connectionString: database.url });
      await sql.connect();
      try {
        const before = await deployMigrations(database, { through: migrationBefore(TARGET) });
        if (before.code !== 0) throw new Error(`Deploying history failed: ${before.stdout}`);
        const w = await world(sql);
        const anthropic = (await w.vendor('Anthropic')) as string;
        const standard = await w.plan(anthropic, 'Claude Team Standard', 'K2');
        const premium = await w.plan(anthropic, 'Claude Team Premium', 'K2');
        await w.profile(
          standard,
          w.khoa,
          '2026-10-01T00:00:00Z',
          [
            [w.khoa, 'OWNER'],
            [w.nam, 'ADMIN'],
          ],
          'Standard note',
        );
        await w.profile(
          premium,
          w.nam,
          '2026-10-02T00:00:00Z',
          [
            [w.khoa, 'OWNER'],
            [w.nam, 'OWNER'],
          ],
          'Premium note',
        );
        await w.subscription(standard, w.khoa, '2026-10-01T00:00:00Z');
        await w.subscription(premium, w.nam, '2026-10-02T00:00:00Z');
        // A vendor that has a K2 subscription and no profile: a workspace with nobody named; another that has nothing: none.
        const atlassian = (await w.vendor('Atlassian')) as string;
        await w.subscription(await w.plan(atlassian, 'Jira', 'K2'), w.nam, '2026-10-03T00:00:00Z');
        await w.vendor('Unused Vendor');

        await sql.query(sqlOf(TARGET));

        const workspaces = (
          await sql.query<{
            id: string;
            name: string;
            primary_owner_employee_id: string | null;
            responsible_it_admin_employee_id: string | null;
            admin_note: string | null;
          }>(
            `SELECT id, name, primary_owner_employee_id, responsible_it_admin_employee_id, admin_note FROM workspaces ORDER BY name`,
          )
        ).rows;
        expect(workspaces.map((row) => row.name)).toEqual(['Anthropic', 'Atlassian']);
        const [claude, jira] = workspaces;
        expect(claude).toMatchObject({
          primary_owner_employee_id: w.khoa,
          responsible_it_admin_employee_id: w.khoa,
          admin_note: 'Standard note\nPremium note',
        });
        expect(jira).toMatchObject({
          primary_owner_employee_id: null,
          responsible_it_admin_employee_id: w.nam,
          admin_note: null,
        });
        const admins = (
          await sql.query<{ employee_id: string; role: string }>(
            `SELECT employee_id, role::text FROM workspace_admins WHERE workspace_id = $1 ORDER BY employee_id`,
            [claude.id],
          )
        ).rows;
        expect(admins).toEqual(
          [
            { employee_id: w.khoa, role: 'OWNER' },
            { employee_id: w.nam, role: 'OWNER' },
          ].sort((a, b) => a.employee_id.localeCompare(b.employee_id)),
        );
        expect((await sql.query(`SELECT 1 FROM workspace_admins WHERE workspace_id = $1`, [jira.id])).rowCount).toBe(0);
        // The old profiles stay as they were: old data, no longer the source.
        expect((await sql.query(`SELECT 1 FROM plan_workspace_profiles`)).rowCount).toBe(2);
        expect((await sql.query(`SELECT 1 FROM plan_workspace_admins`)).rowCount).toBe(4);
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
      }
    },
    DEPLOY_TIMEOUT_MS,
  );

  it(
    'stops, naming the plan, when a plan with a profile belongs to an application that has no vendor, and writes nothing',
    async () => {
      const database = await provisionDisposableDatabase();
      const sql = new Client({ connectionString: database.url });
      await sql.connect();
      try {
        const before = await deployMigrations(database, { through: migrationBefore(TARGET) });
        if (before.code !== 0) throw new Error(`Deploying history failed: ${before.stdout}`);
        const w = await world(sql);
        // The database refuses such a plan today (a K3 plan does not fit an internal application); old data could hold one.
        await sql.query(`ALTER TABLE plans DISABLE TRIGGER USER`);
        const noVendorPlan = await w.plan(null, 'Orphan K3', 'K3');
        await sql.query(`ALTER TABLE plans ENABLE TRIGGER USER`);
        await w.profile(noVendorPlan, w.khoa, '2026-10-01T00:00:00Z', [
          [w.khoa, 'OWNER'],
          [w.nam, 'ADMIN'],
        ]);

        const failure = await sql.query(sqlOf(TARGET)).then(
          () => null,
          (error: { code?: string; message: string }) => error,
        );

        expect(failure?.code).toBe('23514');
        expect(failure?.message).toContain(noVendorPlan);
        expect((await sql.query(`SELECT to_regclass('workspaces') AS t`)).rows[0]).toEqual({ t: null });
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
      }
    },
    DEPLOY_TIMEOUT_MS,
  );

  it(
    'keeps one workspace of a name for each vendor, ignoring case, and refuses a blank name',
    async () => {
      const database = await provisionDisposableDatabase();
      const sql = new Client({ connectionString: database.url });
      await sql.connect();
      try {
        const deployed = await deployMigrations(database);
        if (deployed.code !== 0) throw new Error(`Deploying history failed: ${deployed.stdout}`);
        const w = await world(sql);
        const vendor = (await w.vendor('Anthropic')) as string;
        const insert = (name: string, normalized: string) =>
          sql
            .query(
              `INSERT INTO workspaces (id, organization_id, vendor_id, name, normalized_name, updated_at)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, now())`,
              [w.organizationId, vendor, name, normalized],
            )
            .then(
              () => null,
              (error: { code?: string; constraint?: string }) => error.constraint ?? error.code ?? 'unknown',
            );

        expect(await insert('Anthropic', 'anthropic')).toBeNull();
        expect(await insert('ANTHROPIC', 'anthropic')).toBe('workspaces_organization_id_vendor_id_normalized_name_key');
        expect(await insert('   ', '')).toBe('workspaces_name_check');
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
      }
    },
    DEPLOY_TIMEOUT_MS,
  );
});
