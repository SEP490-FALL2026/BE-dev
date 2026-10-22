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

describe('subscription cost allocations (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;
  let ownerId: string;
  let flatPlan: string;
  let costCenters: string[];

  const newSubscription = async (): Promise<string> => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO subscriptions (id, organization_id, plan_id, kind, status) VALUES ($1, $2, $3, 'TERM', 'DRAFT')`,
      [id, organizationId, flatPlan],
    );

    return id;
  };
  const head = async (subscriptionId: string): Promise<void> => {
    await sql.query(
      `INSERT INTO subscription_cost_allocations (subscription_id, organization_id, current_version) VALUES ($1, $2, 0)`,
      [subscriptionId, organizationId],
    );
  };
  /**
   * Records a version with its lines in one transaction, as the application does, and answers the SQLSTATE of the
   * first statement that failed, or of the commit: the sum of a version is checked when it commits. Null when stored.
   */
  const record = async (
    subscriptionId: string,
    number: number,
    lines: Array<{ costCenterId: string; ratioBp: number; position?: number }>,
  ): Promise<{ state: string | null; versionId: string }> => {
    const versionId = randomUUID();
    await sql.query('BEGIN');
    const statements: Array<[string, unknown[]]> = [
      [
        `INSERT INTO subscription_cost_allocation_versions (id, subscription_id, version, declared_by_app_user_id)
         VALUES ($1, $2, $3, $4)`,
        [versionId, subscriptionId, number, randomUUID()],
      ],
      ...lines.map((line, index): [string, unknown[]] => [
        `INSERT INTO subscription_cost_allocation_lines (version_id, position, cost_center_id, ratio_bp)
         VALUES ($1, $2, $3, $4)`,
        [versionId, line.position ?? index + 1, line.costCenterId, line.ratioBp],
      ]),
    ];
    for (const [text, values] of statements) {
      const state = await sqlState(sql, text, values);
      if (state) {
        await sql.query('ROLLBACK');

        return { state, versionId };
      }
    }
    const state = await sqlState(sql, 'COMMIT');
    if (state) await sql.query('ROLLBACK');

    return { state, versionId };
  };
  const split = (...ratios: number[]) =>
    ratios.map((ratioBp, index) => ({ costCenterId: costCenters[index], ratioBp }));

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
    ownerId = randomUUID();
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       VALUES ($1, $2, 'E-1', 'Owner One', 'STAFF', '2026-01-01', now())`,
      [ownerId, organizationId],
    );
    const vendorId = randomUUID();
    await sql.query(
      `INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, 'Atlassian', 'atlassian')`,
      [vendorId, organizationId],
    );
    const applicationId = randomUUID();
    await sql.query(
      `INSERT INTO applications (id, organization_id, kind, vendor_id, name, normalized_name, business_owner_employee_id,
         data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
       VALUES ($1, $2, 'SAAS', $3, 'Confluence', 'confluence', $4, 'LOW', false, false, false, false)`,
      [applicationId, organizationId, vendorId, ownerId],
    );
    flatPlan = randomUUID();
    await sql.query(
      `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level)
       VALUES ($1, $2, $3, 'Standard', 'standard', 'K1', 'FLAT_RATE', 'PARTIAL')`,
      [flatPlan, organizationId, applicationId],
    );
    costCenters = [];
    for (const [code, kind] of [
      ['CC-A', 'UNIT'],
      ['CC-B', 'UNIT'],
      ['CC-C', 'COMPANY'],
    ]) {
      const id = randomUUID();
      await sql.query(
        `INSERT INTO cost_centers (id, organization_id, code, name, kind) VALUES ($1, $2, $3, $3, $4::"CostCenterKind")`,
        [id, organizationId, code, kind],
      );
      costCenters.push(id);
    }
  }, 60000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  it('has one head per subscription and refuses a subscription that does not exist (foreign key)', async () => {
    const subscriptionId = await newSubscription();
    const insert = (forSubscription: string) =>
      sqlState(sql, `INSERT INTO subscription_cost_allocations (subscription_id, organization_id) VALUES ($1, $2)`, [
        forSubscription,
        organizationId,
      ]);

    expect(await insert(subscriptionId)).toBeNull();
    expect(await insert(subscriptionId)).toBe('23505');
    expect(await insert(randomUUID())).toBe('23503');
  });

  it('stores a version whose lines add up to exactly 100 percent (10 000 hundredths of a percent)', async () => {
    const subscriptionId = await newSubscription();
    await head(subscriptionId);

    expect((await record(subscriptionId, 1, split(6000, 4000))).state).toBeNull();
    expect((await record(subscriptionId, 2, split(3333, 3333, 3334))).state).toBeNull();
    expect((await record(subscriptionId, 3, split(10000))).state).toBeNull();
  });

  it('refuses a version that does not add up to 100 percent when it commits (INV-03)', async () => {
    const subscriptionId = await newSubscription();
    await head(subscriptionId);

    expect((await record(subscriptionId, 1, split(6000, 3000))).state).toBe('23514');
    expect((await record(subscriptionId, 1, split(6000, 5000))).state).toBe('23514');
    expect((await record(subscriptionId, 1, split(3333, 3333, 3333))).state).toBe('23514');
    expect((await record(subscriptionId, 1, [])).state).toBe('23514');

    const stored = await sql.query(`SELECT 1 FROM subscription_cost_allocation_versions WHERE subscription_id = $1`, [
      subscriptionId,
    ]);
    expect(stored.rows).toEqual([]);
  });

  it('keeps the version number positive and unique for a subscription', async () => {
    const subscriptionId = await newSubscription();
    await head(subscriptionId);

    expect((await record(subscriptionId, 1, split(10000))).state).toBeNull();
    expect((await record(subscriptionId, 1, split(10000))).state).toBe('23505');
    expect((await record(subscriptionId, 0, split(10000))).state).toBe('23514');
  });

  it('refuses a version for a subscription that has no head (foreign key)', async () => {
    const unheaded = await newSubscription();

    expect((await record(unheaded, 1, split(10000))).state).toBe('23503');
  });

  it('keeps a ratio from 1 to 10 000, a position from 1 to 20, and a Cost Center that exists', async () => {
    const subscriptionId = await newSubscription();
    await head(subscriptionId);

    expect((await record(subscriptionId, 1, split(10000, 0))).state).toBe('23514');
    expect((await record(subscriptionId, 1, split(10001))).state).toBe('23514');
    expect((await record(subscriptionId, 1, split(-1, 10001))).state).toBe('23514');
    expect(
      (await record(subscriptionId, 1, [{ costCenterId: costCenters[0], ratioBp: 10000, position: 0 }])).state,
    ).toBe('23514');
    expect(
      (await record(subscriptionId, 1, [{ costCenterId: costCenters[0], ratioBp: 10000, position: 21 }])).state,
    ).toBe('23514');
    expect((await record(subscriptionId, 1, [{ costCenterId: randomUUID(), ratioBp: 10000 }])).state).toBe('23503');
  });

  it('refuses a Cost Center twice in one version and a position used twice', async () => {
    const subscriptionId = await newSubscription();
    await head(subscriptionId);

    expect(
      (
        await record(subscriptionId, 1, [
          { costCenterId: costCenters[0], ratioBp: 6000 },
          { costCenterId: costCenters[0], ratioBp: 4000 },
        ])
      ).state,
    ).toBe('23505');
    expect(
      (
        await record(subscriptionId, 1, [
          { costCenterId: costCenters[0], ratioBp: 6000, position: 1 },
          { costCenterId: costCenters[1], ratioBp: 4000, position: 1 },
        ])
      ).state,
    ).toBe('23505');
    expect((await record(subscriptionId, 1, split(6000, 4000))).state).toBeNull();
    expect((await record(subscriptionId, 2, split(6000, 4000))).state).toBeNull();
  });

  it('never changes or deletes a recorded version or its lines, whoever writes it: the history stays whole', async () => {
    const subscriptionId = await newSubscription();
    await head(subscriptionId);
    const { versionId } = await record(subscriptionId, 1, split(6000, 4000));

    expect(
      await sqlState(sql, `UPDATE subscription_cost_allocation_versions SET version = 9 WHERE id = $1`, [versionId]),
    ).toBe('55000');
    expect(await sqlState(sql, `DELETE FROM subscription_cost_allocation_versions WHERE id = $1`, [versionId])).toBe(
      '55000',
    );
    expect(
      await sqlState(sql, `UPDATE subscription_cost_allocation_lines SET ratio_bp = 5000 WHERE version_id = $1`, [
        versionId,
      ]),
    ).toBe('55000');
    expect(
      await sqlState(sql, `DELETE FROM subscription_cost_allocation_lines WHERE version_id = $1`, [versionId]),
    ).toBe('55000');

    const stored = await sql.query<{ ratio_bp: number }>(
      `SELECT ratio_bp FROM subscription_cost_allocation_lines WHERE version_id = $1 ORDER BY position`,
      [versionId],
    );
    expect(stored.rows).toEqual([{ ratio_bp: 6000 }, { ratio_bp: 4000 }]);
  });

  it('lets the head move to the next version, and holds no money: a ratio only', async () => {
    const subscriptionId = await newSubscription();
    await head(subscriptionId);

    expect(
      await sqlState(sql, `UPDATE subscription_cost_allocations SET current_version = 1 WHERE subscription_id = $1`, [
        subscriptionId,
      ]),
    ).toBeNull();
    expect(
      await sqlState(sql, `UPDATE subscription_cost_allocations SET current_version = -1 WHERE subscription_id = $1`, [
        subscriptionId,
      ]),
    ).toBe('23514');

    const columns = await sql.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name IN ('subscription_cost_allocations', 'subscription_cost_allocation_versions', 'subscription_cost_allocation_lines')
          AND (column_name ILIKE '%amount%' OR column_name ILIKE '%minor%' OR column_name ILIKE '%currency%')`,
    );
    expect(columns.rows).toEqual([]);
  });
});
