import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { stopCliProcesses } from '../../support/cli-process';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';
import { sqlState } from '../../support/expansion-world';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
  schemaDrift,
} from '../../support/migration-history';

interface World {
  organizationId: string;
  ownerEmployeeId: string;
  planId: string;
  departmentId: string;
  costCenterId: string;
}

/** The rows around a commitment on the schema just before the migration: an organization, a person, a department with its Cost Center, a plan. */
async function worldOf(sql: Client): Promise<World> {
  const organizationId = randomUUID();
  await sql.query(
    `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
    [organizationId],
  );
  const ownerEmployeeId = randomUUID();
  await sql.query(
    `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
     VALUES ($1, $2, 'E-1', 'Owner One', 'STAFF', '2026-01-01', now())`,
    [ownerEmployeeId, organizationId],
  );
  const departmentId = randomUUID();
  await sql.query(
    `INSERT INTO departments (id, organization_id, code, name, updated_at) VALUES ($1, $2, 'ENG', 'Engineering', now())`,
    [departmentId, organizationId],
  );
  const costCenterId = randomUUID();
  await sql.query(
    `INSERT INTO cost_centers (id, organization_id, code, name, kind, status, department_id, linked_at)
     VALUES ($1, $2, 'CC-ENG', 'Engineering', 'UNIT', 'ACTIVE', $3, now())`,
    [costCenterId, organizationId, departmentId],
  );
  const vendorId = randomUUID();
  await sql.query(
    `INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, 'Figma', 'figma')`,
    [vendorId, organizationId],
  );
  const applicationId = randomUUID();
  await sql.query(
    `INSERT INTO applications (id, organization_id, kind, vendor_id, name, normalized_name, business_owner_employee_id,
       data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
     VALUES ($1, $2, 'SAAS', $3, 'Figma', 'figma', $4, 'LOW', false, false, false, false)`,
    [applicationId, organizationId, vendorId, ownerEmployeeId],
  );
  const planId = randomUUID();
  await sql.query(
    `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level)
     VALUES ($1, $2, $3, 'Figma plan', 'figma plan', 'K2', 'PER_SEAT', 'FULL')`,
    [planId, organizationId, applicationId],
  );

  return { organizationId, ownerEmployeeId, planId, departmentId, costCenterId };
}

/**
 * `finance-screens-api`, Task 3: the migration that lets Finance record an invoice against a commitment only adds. The history is
 * deployed up to the migration before it, commitments of every state are written as the application wrote them (a held one, a
 * released one and one that was marked an expense), and the migration is deployed over them: they are unchanged, nothing of them
 * became an expense, and the new rules are the ones the database keeps.
 */
const INVOICES = migrationEndingWith('_finance_invoices');
const RESTRICT = '23001';
const CHECK = '23514';
const UNIQUE = '23505';

describe('the migration of invoices over a database that holds commitments (integration, PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let world: World;
  const ids = { request: randomUUID(), held: randomUUID(), released: randomUUID(), expensed: randomUUID() };
  let vendorId = '';
  let before = '';

  const commitmentRows = async () =>
    (
      await sql.query<{
        id: string;
        state: string;
        amount_minor: string;
        released_minor: string;
        applied_minor?: string;
      }>(`SELECT * FROM budget_commitments ORDER BY year`)
    ).rows;

  async function invoice(over: Record<string, unknown> = {}): Promise<string | null> {
    const row = {
      id: randomUUID(),
      commitment: ids.held,
      number: 'INV-1',
      net: 1000,
      deductible: 100,
      nonDeductible: 50,
      cost: 1050,
      applied: 1000,
      note: null,
      ...over,
    };

    return sqlState(
      sql,
      `INSERT INTO invoices (id, organization_id, commitment_id, vendor_id, number, issued_on, currency, net_minor, deductible_tax_minor,
          non_deductible_tax_minor, actual_cost_minor, applied_minor, match_result, note, recorded_by_employee_id, recorded_at)
       VALUES ($1, $2, $3, $4, $5, '2026-11-01', 'VND', $6, $7, $8, $9, $10, 'MATCHED', $11, $12, now())`,
      [
        row.id,
        world.organizationId,
        row.commitment,
        vendorId,
        row.number,
        row.net,
        row.deductible,
        row.nonDeductible,
        row.cost,
        row.applied,
        row.note,
        world.ownerEmployeeId,
      ],
    );
  }

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    const first = await deployMigrations(database, { through: migrationBefore(INVOICES) });
    if (first.code !== 0) throw new Error(`Deploying the history failed: ${first.stdout}\n${first.stderr}`);
    world = await worldOf(sql);
    vendorId = (await sql.query<{ id: string }>(`SELECT id FROM vendors LIMIT 1`)).rows[0].id;
    await sql.query(
      `INSERT INTO access_requests (id, organization_id, branch, state, plan_id, requester_employee_id, department_id, cost_center_id, business_reason,
          term_months, policy, created_by_app_user_id, pricing_status, amount_minor, amount_currency, unit_price_minor, billing_cycle,
          payment_schedule, expected_spend_on, budget_year)
       VALUES ($1, $2, 'PAID_IN_CATALOG', 'COMPLETED', $3, $4, $5, $6, 'Design work', 12, '{}'::jsonb, $7, 'PRICED', 20000, 'VND', 20000,
          'ANNUAL', '[{"dueOn":"2026-06-15","amountMinor":20000,"budgetYear":2026}]'::jsonb, '2026-06-15', 2026)`,
      [
        ids.request,
        world.organizationId,
        world.planId,
        world.ownerEmployeeId,
        world.departmentId,
        world.costCenterId,
        randomUUID(),
      ],
    );
    const commitment = (id: string, year: number, state: string, released: number) =>
      sql.query(
        `INSERT INTO budget_commitments (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, state,
            released_minor, released_at, unattached_reason)
         VALUES ($1, $2, $3, $4, $5, 20000, 'VND', $6::"CommitmentState", $7, $8, 'NO_BUDGET')`,
        [
          id,
          world.organizationId,
          ids.request,
          world.costCenterId,
          year,
          state,
          released,
          state === 'RELEASED' ? '2026-10-01T00:00:00Z' : null,
        ],
      );
    await commitment(ids.held, 2026, 'HELD', 5000);
    await commitment(ids.released, 2027, 'RELEASED', 20000);
    await commitment(ids.expensed, 2028, 'EXPENSED', 0);
    before = JSON.stringify(await commitmentRows());

    const deploy = await deployMigrations(database);
    if (deploy.code !== 0) throw new Error(`Deploying the migration failed: ${deploy.stdout}\n${deploy.stderr}`);
  }, DEPLOY_TIMEOUT_MS * 3);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
    stopCliProcesses();
  });

  it('leaves the commitments as they were, with nothing of them an expense yet', async () => {
    const after = await commitmentRows();

    const withoutApplied = (row: Record<string, unknown>) => {
      const copy = { ...row };
      delete copy.applied_minor;

      return JSON.stringify(copy);
    };
    // Columns later migrations add to the commitments (they postdate this one) are not what it is about: the rows compare on the columns they had.
    const beforeRows = JSON.parse(before) as Record<string, unknown>[];
    const columns = Object.keys(beforeRows[0] ?? {});
    const asBefore = (row: Record<string, unknown>) =>
      Object.fromEntries(columns.map((column) => [column, row[column]]));
    expect(after.map((row) => withoutApplied(asBefore(row)))).toEqual(beforeRows.map(withoutApplied));
    expect(after.map((row) => row.applied_minor)).toEqual(['0', '0', '0']);
  });

  it('leaves the schema where the Prisma schema says it is', async () => {
    const drift = await schemaDrift(database);

    expect(drift.stdout).toContain('No difference detected');
    expect(drift.code).toBe(0);
  });

  it('keeps an invoice that fits: the price before tax, and the cost that is that price and the tax that cannot be deducted', async () => {
    expect(await invoice()).toBeNull();
    expect(await invoice({ number: 'INV-2', cost: 1000 })).toBe(CHECK);
    expect(await invoice({ number: 'INV-3', applied: 1001 })).toBe(CHECK);
    expect(await invoice({ number: 'INV-4', net: -1, cost: 49, applied: 0 })).toBe(CHECK);
    expect(await invoice({ number: '', applied: 0 })).toBe(CHECK);
    expect(await invoice({ number: ' padded ', applied: 0 })).toBe(CHECK);
    expect(await invoice({ number: 'x'.repeat(65), applied: 0 })).toBe(CHECK);
    expect(await invoice({ number: 'INV-5', note: 'x'.repeat(1001) })).toBe(CHECK);
  });

  it('records the number of a vendor once', async () => {
    expect(await invoice({ number: 'INV-ONCE' })).toBeNull();

    expect(await invoice({ number: 'INV-ONCE', commitment: ids.expensed })).toBe(UNIQUE);
  });

  it('never changes or deletes an invoice, nor empties the table', async () => {
    expect(await sqlState(sql, `UPDATE invoices SET note = 'changed'`)).toBe(RESTRICT);
    expect(await sqlState(sql, `DELETE FROM invoices`)).toBe(RESTRICT);
    expect(await sqlState(sql, `TRUNCATE invoices`)).toBe(RESTRICT);
  });

  it('refuses a commitment that spends more than it was made for, or that is released after something became an expense', async () => {
    const held = `UPDATE budget_commitments SET applied_minor = $1 WHERE id = $2`;

    // 20 000 less 5 000 released leaves 15 000 to apply; one more than that is refused, and applying all of it expenses the commitment.
    expect(await sqlState(sql, held, [15001, ids.held])).toBe(CHECK);
    expect(await sqlState(sql, `UPDATE budget_commitments SET applied_minor = 15000 WHERE id = $1`, [ids.held])).toBe(
      CHECK,
    );
    expect(
      await sqlState(sql, `UPDATE budget_commitments SET applied_minor = 15000, state = 'EXPENSED' WHERE id = $1`, [
        ids.held,
      ]),
    ).toBeNull();
    // What became an expense stays, and the commitment is final once it is no longer held.
    expect(await sqlState(sql, held, [10, ids.held])).toBe(RESTRICT);
  });

  it('does not let money that became an expense come back to a commitment that is still held', async () => {
    const other = randomUUID();
    await sql.query(
      `INSERT INTO budget_commitments (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, state, applied_minor, unattached_reason)
       VALUES ($1, $2, $3, $4, 2029, 20000, 'VND', 'HELD', 6000, 'NO_BUDGET')`,
      [other, world.organizationId, ids.request, world.costCenterId],
    );

    expect(await sqlState(sql, `UPDATE budget_commitments SET applied_minor = 5999 WHERE id = $1`, [other])).toBe(
      RESTRICT,
    );
    expect(await sqlState(sql, `UPDATE budget_commitments SET applied_minor = 6500 WHERE id = $1`, [other])).toBeNull();
  });

  it('does not call a commitment released when something of it became an expense', async () => {
    const other = randomUUID();

    const state = await sqlState(
      sql,
      `INSERT INTO budget_commitments (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, state,
          released_minor, applied_minor, released_at, unattached_reason)
       VALUES ($1, $2, $3, $4, 2030, 20000, 'VND', 'RELEASED', 15000, 5000, now(), 'NO_BUDGET')`,
      [other, world.organizationId, ids.request, world.costCenterId],
    );

    expect(state).toBe(CHECK);
  });
});
