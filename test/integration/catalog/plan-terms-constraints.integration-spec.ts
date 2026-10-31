import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(sql: Client, text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('plan terms and opinions (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;
  let ownerId: string;

  const newPlan = async (
    appKind: string,
    type: string,
    pricing: string | null,
    control: string | null,
  ): Promise<string> => {
    const vendorId = randomUUID();
    await sql.query(`INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, $3, $3)`, [
      vendorId,
      organizationId,
      `vendor ${randomUUID()}`,
    ]);
    const applicationId = randomUUID();
    await sql.query(
      `INSERT INTO applications (id, organization_id, kind, vendor_id, name, normalized_name, business_owner_employee_id,
         data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
       VALUES ($1, $2, $3::"ApplicationKind", $4, $5, $5, $6, 'LOW', false, false, false, false)`,
      [
        applicationId,
        organizationId,
        appKind,
        appKind === 'INTERNAL' ? null : vendorId,
        `app ${randomUUID()}`,
        ownerId,
      ],
    );
    const planId = randomUUID();
    await sql.query(
      `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level)
       VALUES ($1, $2, $3, $4, $4, $5::"ProvisioningType", $6::"PricingModel", $7::"ControlLevel")`,
      [planId, organizationId, applicationId, `plan ${randomUUID()}`, type, pricing, control],
    );

    return planId;
  };
  const terms = (planId: string, columns: Record<string, unknown>) => {
    const names = ['plan_id', ...Object.keys(columns)];

    return sqlState(
      sql,
      `INSERT INTO plan_terms (${names.join(', ')}) VALUES (${names.map((_, index) => `$${index + 1}`).join(', ')})`,
      [planId, ...Object.values(columns)],
    );
  };
  const opinion = (planId: string, text: string, employeeId: string = ownerId) =>
    sqlState(
      sql,
      `INSERT INTO plan_term_opinions (id, plan_id, business_owner_employee_id, opinion, recorded_by_app_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), planId, employeeId, text, randomUUID()],
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
  }, 60000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  describe('plan_terms', () => {
    it('keeps one row per plan, and every point is optional: a half-filled checklist is stored (OQ-B-10)', async () => {
      const plan = await newPlan('SAAS', 'K2', 'PER_SEAT', 'FULL');

      expect(await terms(plan, {})).toBeNull();
      expect(await terms(plan, {})).toBe('23505');
      const another = await newPlan('SAAS', 'K2', 'PER_SEAT', 'FULL');
      expect(await terms(another, { terms_url: 'https://figma.com/legal', last_reviewed_on: '2026-10-01' })).toBeNull();
    });

    it('keeps every text of the six points and the link within 2000 characters', async () => {
      for (const column of [
        'terms_url',
        'ai_training_note',
        'storage_location_note',
        'install_limit_note',
        'commercial_use_note',
        'cancellation_refund_note',
      ]) {
        const plan = await newPlan('SAAS', 'K2', 'PER_SEAT', 'FULL');
        const other = await newPlan('SAAS', 'K2', 'PER_SEAT', 'FULL');

        expect(await terms(plan, { [column]: 'x'.repeat(2000) })).toBeNull();
        expect(await terms(other, { [column]: 'x'.repeat(2001) })).toBe('23514');
      }
    });

    it('keeps a numeric install limit at one device or more, and only for a K4 plan (trigger)', async () => {
      const k4 = await newPlan('LICENSED', 'K4', 'PER_SEAT', 'FULL');
      const k4Other = await newPlan('LICENSED', 'K4', 'PER_SEAT', 'FULL');
      const k2 = await newPlan('SAAS', 'K2', 'PER_SEAT', 'FULL');
      const k1 = await newPlan('SAAS', 'K1', 'FLAT_RATE', 'PARTIAL');

      expect(await terms(k4, { install_limit_max_devices: 1 })).toBeNull();
      expect(await terms(k4Other, { install_limit_max_devices: 0 })).toBe('23514');
      expect(await terms(k2, { install_limit_max_devices: 2 })).toBe('23514');
      expect(await terms(k1, { install_limit_max_devices: 2 })).toBe('23514');
      expect(await terms(k2, { install_limit_note: 'at most 2 devices per person' })).toBeNull();
    });

    it('gives a K5 plan of an internal application no terms (trigger)', async () => {
      const k5 = await newPlan('INTERNAL', 'K5', null, null);

      expect(await terms(k5, {})).toBe('23514');
    });

    it('refuses terms for a plan that does not exist (foreign key)', async () => {
      expect(await terms(randomUUID(), {})).toBe('23503');
    });

    it('moves the plan to a kind that cannot hold a numeric limit only after the limit is gone (trigger)', async () => {
      const k4 = await newPlan('LICENSED', 'K4', 'PER_SEAT', 'FULL');
      await terms(k4, { install_limit_max_devices: 1 });

      expect(await sqlState(sql, `UPDATE plans SET provisioning_type = 'K1' WHERE id = $1`, [k4])).toBe('23514');
    });
  });

  describe('plan_term_opinions', () => {
    it('stores an opinion of 1 to 2000 characters against a plan and an employee', async () => {
      const plan = await newPlan('SAAS', 'K2', 'PER_SEAT', 'FULL');

      expect(await opinion(plan, 'Nên rà điều khoản chia sẻ trước kỳ gia hạn')).toBeNull();
      expect(await opinion(plan, 'x'.repeat(2000))).toBeNull();
      expect(await opinion(plan, '')).toBe('23514');
      expect(await opinion(plan, 'x'.repeat(2001))).toBe('23514');
      expect(await opinion(plan, 'a note', randomUUID())).toBe('23503');
      expect(await opinion(randomUUID(), 'a note')).toBe('23503');
    });

    it('is only ever added to: no writer changes or deletes an opinion', async () => {
      const plan = await newPlan('SAAS', 'K2', 'PER_SEAT', 'FULL');
      await opinion(plan, 'first opinion');

      expect(await sqlState(sql, `UPDATE plan_term_opinions SET opinion = 'changed' WHERE plan_id = $1`, [plan])).toBe(
        '55000',
      );
      expect(await sqlState(sql, `DELETE FROM plan_term_opinions WHERE plan_id = $1`, [plan])).toBe('55000');
      const stored = await sql.query<{ opinion: string }>(`SELECT opinion FROM plan_term_opinions WHERE plan_id = $1`, [
        plan,
      ]);
      expect(stored.rows).toEqual([{ opinion: 'first opinion' }]);
    });
  });

  it('has no column that could hold a legal conclusion: the system keeps what IT read, nothing it concluded (AC-2)', async () => {
    const columns = await sql.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name IN ('plan_terms', 'plan_term_opinions')
          AND (column_name ILIKE '%legal%' OR column_name ILIKE '%complian%' OR column_name ILIKE '%violat%'
               OR column_name ILIKE '%lawful%' OR column_name ILIKE '%verdict%' OR column_name ILIKE '%conclusion%')`,
    );

    expect(columns.rows).toEqual([]);
  });
});
