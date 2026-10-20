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

describe('plans and workspace profiles (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;
  let ownerId: string;
  let saasId: string;
  let internalId: string;

  interface PlanInput {
    applicationId?: string;
    name?: string;
    type?: string;
    pricing?: string | null;
    control?: string | null;
    note?: string | null;
    dataLoss?: boolean;
  }
  const insertPlan = (input: PlanInput) => {
    const type = input.type ?? 'K2';
    const name = input.name ?? `Plan ${randomUUID()}`;

    return sqlState(
      sql,
      `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model,
         control_level, revocation_note, data_loss_on_removal)
       VALUES ($1, $2, $3, $4, $5, $6::"ProvisioningType", $7::"PricingModel", $8::"ControlLevel", $9, $10)`,
      [
        randomUUID(),
        organizationId,
        input.applicationId ?? saasId,
        name,
        name.toLowerCase(),
        type,
        input.pricing === undefined ? (type === 'K5' ? null : 'PER_SEAT') : input.pricing,
        input.control === undefined ? (type === 'K5' ? null : 'FULL') : input.control,
        input.note ?? null,
        input.dataLoss ?? false,
      ],
    );
  };
  const insertApplication = async (kind: string, vendorId: string | null, name: string): Promise<string> => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO applications (id, organization_id, kind, vendor_id, name, normalized_name, business_owner_employee_id,
         data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
       VALUES ($1, $2, $3::"ApplicationKind", $4, $5, $6, $7, 'LOW', false, false, false, false)`,
      [id, organizationId, kind, vendorId, name, name.toLowerCase(), ownerId],
    );

    return id;
  };
  const planWithType = async (type: string): Promise<string> => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level)
       VALUES ($1, $2, $3, $4, $4, $5::"ProvisioningType", 'PER_SEAT'::"PricingModel", 'FULL'::"ControlLevel")`,
      [id, organizationId, saasId, `wp ${randomUUID()}`, type],
    );

    return id;
  };
  const insertProfile = (
    planId: string,
    emergency: Array<string | boolean | null>,
    limits: [number | null, number | null] = [null, null],
  ) =>
    sqlState(
      sql,
      `INSERT INTO plan_workspace_profiles (plan_id, primary_owner_employee_id, owner_limit, admin_limit,
         emergency_identity, emergency_occupies_seat, emergency_holder_employee_id, emergency_last_reviewed_on)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [planId, ownerId, limits[0], limits[1], ...emergency],
    );

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
    await sql.query(`INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, 'V', 'v')`, [
      vendorId,
      organizationId,
    ]);
    saasId = await insertApplication('SAAS', vendorId, 'Figma');
    internalId = await insertApplication('INTERNAL', null, 'Portal');
  }, 60000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  describe('plans', () => {
    it('ties the pricing model to the kind: K1, K2, K4 have one, K3 and K5 have none', async () => {
      expect(await insertPlan({ type: 'K1', pricing: 'FLAT_RATE' })).toBeNull();
      expect(await insertPlan({ type: 'K2', pricing: 'PER_SEAT' })).toBeNull();
      expect(await insertPlan({ type: 'K4', pricing: 'PER_HOST' })).toBeNull();
      expect(await insertPlan({ type: 'K1', pricing: null })).toBe('23514');
      expect(await insertPlan({ type: 'K5', applicationId: internalId, pricing: 'PER_SEAT' })).toBe('23514');
      expect(await insertPlan({ type: 'K3', pricing: 'PER_SEAT' })).toBe('23514');
    });

    it('needs a control level for every kind but K5', async () => {
      expect(await insertPlan({ type: 'K1', control: null })).toBe('23514');
      expect(
        await insertPlan({ type: 'K5', applicationId: internalId, name: 'Internal plan', control: null }),
      ).toBeNull();
    });

    it('lets the data-loss flag stand only with a note saying what is lost', async () => {
      expect(await insertPlan({ dataLoss: true, note: null })).toBe('23514');
      expect(await insertPlan({ dataLoss: true, note: 'Chats of a removed member cannot be moved' })).toBeNull();
      expect(await insertPlan({ dataLoss: false, note: 'A note without the flag' })).toBeNull();
    });

    it('refuses a second plan of the same normalized name in an application, allows it in another', async () => {
      expect(await insertPlan({ name: 'Organization' })).toBeNull();
      expect(await insertPlan({ name: 'ORGANIZATION' })).toBe('23505');
      expect(await insertPlan({ name: 'Organization', applicationId: internalId, type: 'K5' })).toBeNull();
    });

    it('allows only K5 for an internal application and never K5 for another (trigger)', async () => {
      expect(await insertPlan({ applicationId: internalId, type: 'K5', name: 'Internal K5' })).toBeNull();
      expect(await insertPlan({ applicationId: internalId, type: 'K1' })).toBe('23514');
      expect(await insertPlan({ applicationId: internalId, type: 'K2' })).toBe('23514');
      expect(await insertPlan({ applicationId: saasId, type: 'K5', pricing: null, control: null })).toBe('23514');
    });

    it('refuses moving a plan to the other kind by UPDATE (trigger)', async () => {
      const id = await planWithType('K1');

      expect(
        await sqlState(sql, `UPDATE plans SET provisioning_type = 'K5', pricing_model = NULL WHERE id = $1`, [id]),
      ).toBe('23514');
      expect(await sqlState(sql, `UPDATE plans SET application_id = $2 WHERE id = $1`, [id, internalId])).toBe('23514');
    });

    it('refuses an unknown application (foreign key)', async () => {
      expect(await insertPlan({ applicationId: randomUUID() })).toBe('23503');
    });
  });

  describe('workspace profiles', () => {
    it('exists only for a K2 or K3 plan (trigger)', async () => {
      const k2 = await planWithType('K2');
      const k1 = await planWithType('K1');
      const k4 = await planWithType('K4');

      expect(await insertProfile(k2, [null, null, null, null])).toBeNull();
      expect(await insertProfile(k1, [null, null, null, null])).toBe('23514');
      expect(await insertProfile(k4, [null, null, null, null])).toBe('23514');
    });

    it('holds the four emergency account fields together or none of them', async () => {
      const complete = ['figma-breakglass', true, ownerId, '2026-10-01'];
      const missing = (index: number) => complete.map((value, position) => (position === index ? null : value));

      expect(await insertProfile(await planWithType('K2'), complete)).toBeNull();
      for (let index = 0; index < 4; index += 1) {
        expect(await insertProfile(await planWithType('K2'), missing(index))).toBe('23514');
      }
    });

    it('needs a limit of at least one when there is a limit', async () => {
      expect(await insertProfile(await planWithType('K2'), [null, null, null, null], [1, 2])).toBeNull();
      expect(await insertProfile(await planWithType('K2'), [null, null, null, null], [0, null])).toBe('23514');
      expect(await insertProfile(await planWithType('K2'), [null, null, null, null], [null, 0])).toBe('23514');
    });

    it('keeps one profile per plan and one row per person in it, and has no column for a password', async () => {
      const plan = await planWithType('K2');
      await insertProfile(plan, [null, null, null, null]);
      const member = (employee: string, role: string) =>
        sqlState(
          sql,
          `INSERT INTO plan_workspace_admins (plan_id, employee_id, role) VALUES ($1, $2, $3::"WorkspaceRole")`,
          [plan, employee, role],
        );

      expect(await insertProfile(plan, [null, null, null, null])).toBe('23505');
      expect(await member(ownerId, 'OWNER')).toBeNull();
      expect(await member(ownerId, 'ADMIN')).toBe('23505');
      expect(await member(randomUUID(), 'ADMIN')).toBe('23503');

      const columns = await sql.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name IN ('plan_workspace_profiles', 'plan_workspace_admins')
            AND (column_name ILIKE '%password%' OR column_name ILIKE '%secret%' OR column_name ILIKE '%credential%')`,
      );
      expect(columns.rows).toEqual([]);
    });
  });
});
