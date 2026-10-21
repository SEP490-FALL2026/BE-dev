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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface AssignmentInput {
  kind?: 'PERSONAL' | 'SERVICE';
  source?: 'BASELINE' | 'HANDOVER' | 'REQUEST';
  planId?: string;
  subscriptionId?: string | null;
  employeeId?: string;
  identifier?: string;
  reason?: string | null;
  costCenterId?: string | null;
  validFrom?: string;
  basis?: 'ACTUAL' | 'RECORDED';
  validUntil?: string | null;
  expectedEnd?: string | null;
  predecessorId?: string | null;
  importId?: string | null;
  id?: string;
}

describe('license assignments (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;
  let importId: string;
  let staff: string;
  let intern: string;
  let contractor: string;
  let freelancer: string;
  let other: string;
  let flatPlan: string;
  let otherPlan: string;
  let internalPlan: string;
  let unitCenter: string;
  let companyCenter: string;
  let counter = 0;

  const newSubscription = async (planId: string, quantity: number | null): Promise<string> => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO subscriptions (id, organization_id, plan_id, kind, status, purchased_quantity)
       VALUES ($1, $2, $3, 'TERM', 'DRAFT', $4)`,
      [id, organizationId, planId, quantity],
    );

    return id;
  };
  const newEmployee = async (code: string, type: string): Promise<string> => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       VALUES ($1, $2, $3, $3, $4::"EmploymentType", '2026-01-01', now())`,
      [id, organizationId, code, type],
    );

    return id;
  };
  const newPlan = async (kind: 'SAAS' | 'INTERNAL', type: string, pricing: string | null): Promise<string> => {
    const vendorId = randomUUID();
    await sql.query(`INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, $3, $3)`, [
      vendorId,
      organizationId,
      `vendor ${(counter += 1)}`,
    ]);
    const applicationId = randomUUID();
    await sql.query(
      `INSERT INTO applications (id, organization_id, kind, vendor_id, name, normalized_name, business_owner_employee_id,
         data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
       VALUES ($1, $2, $3::"ApplicationKind", $4, $5, $5, $6, 'LOW', false, false, false, false)`,
      [applicationId, organizationId, kind, kind === 'INTERNAL' ? null : vendorId, `app ${counter}`, staff],
    );
    const planId = randomUUID();
    await sql.query(
      `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level)
       VALUES ($1, $2, $3, $4, $4, $5::"ProvisioningType", $6::"PricingModel", $7::"ControlLevel")`,
      [planId, organizationId, applicationId, `plan ${counter}`, type, pricing, type === 'K5' ? null : 'FULL'],
    );

    return planId;
  };
  const insert = (input: AssignmentInput, client: Client = sql) =>
    sqlState(
      client,
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, reason, cost_center_id, valid_from, valid_from_basis,
         valid_until, expected_end_date, predecessor_id, baseline_import_id, created_by_app_user_id)
       VALUES ($1, $2, $3::"AssignmentKind", $4::"AssignmentSource", $5, $6, $7, $8, $9, $10, $11, $12,
         $13::"AssignmentDateBasis", $14, $15, $16, $17, $18)`,
      [
        input.id ?? randomUUID(),
        organizationId,
        input.kind ?? 'PERSONAL',
        input.source ?? 'BASELINE',
        input.planId ?? flatPlan,
        input.subscriptionId === undefined ? null : input.subscriptionId,
        input.employeeId ?? staff,
        input.identifier ?? `user${(counter += 1)}@congty.vn`,
        (input.identifier ?? `user${counter}@congty.vn`).trim().toLowerCase(),
        input.reason === undefined ? null : input.reason,
        input.costCenterId === undefined ? null : input.costCenterId,
        input.validFrom ?? '2026-10-01',
        input.basis ?? 'RECORDED',
        input.validUntil === undefined ? null : input.validUntil,
        input.expectedEnd === undefined ? null : input.expectedEnd,
        input.predecessorId === undefined ? null : input.predecessorId,
        input.importId !== undefined ? input.importId : (input.source ?? 'BASELINE') === 'BASELINE' ? importId : null,
        randomUUID(),
      ],
    );
  const personal = (subscriptionId: string, extra: AssignmentInput = {}) =>
    insert({ planId: flatPlan, subscriptionId, ...extra });
  const fresh = async (quantity: number | null = 3): Promise<string> => newSubscription(flatPlan, quantity);

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
    staff = await newEmployee('E-STAFF', 'STAFF');
    other = await newEmployee('E-OTHER', 'STAFF');
    intern = await newEmployee('E-INTERN', 'INTERN');
    contractor = await newEmployee('E-CONTRACTOR', 'CONTRACTOR');
    freelancer = await newEmployee('E-FREELANCER', 'FREELANCER');
    flatPlan = await newPlan('SAAS', 'K2', 'FLAT_RATE');
    otherPlan = await newPlan('SAAS', 'K2', 'PER_SEAT');
    internalPlan = await newPlan('INTERNAL', 'K5', null);
    for (const [code, kind] of [
      ['CC-UNIT', 'UNIT'],
      ['CC-CORP', 'COMPANY'],
    ]) {
      const id = randomUUID();
      await sql.query(
        `INSERT INTO cost_centers (id, organization_id, code, name, kind) VALUES ($1, $2, $3, $3, $4::"CostCenterKind")`,
        [id, organizationId, code, kind],
      );
      if (kind === 'UNIT') unitCenter = id;
      else companyCenter = id;
    }
    importId = randomUUID();
    await sql.query(
      `INSERT INTO seat_baseline_imports (id, organization_id, uploaded_by, file_name, content_hash, plan_id, status,
         ignored_columns, summary, expires_at)
       VALUES ($1, $2, $3, 'baseline.csv', 'abc', $4, 'PREVIEW', '{}', '{}', now() + interval '1 day')`,
      [importId, organizationId, randomUUID(), flatPlan],
    );
  }, 90000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  it('stores a personal seat of a subscription, and a seat of an internal plan with no subscription', async () => {
    const subscriptionId = await fresh();

    expect(await personal(subscriptionId)).toBeNull();
    expect(await insert({ planId: internalPlan, subscriptionId: null })).toBeNull();
  });

  it('keeps a service account for a reason and a Company-style Cost Center, and a personal seat with none', async () => {
    const subscriptionId = await fresh();

    expect(
      await personal(subscriptionId, {
        kind: 'SERVICE',
        identifier: 'ci-bot',
        reason: 'CI pipeline',
        costCenterId: companyCenter,
      }),
    ).toBeNull();
    expect(
      await personal(subscriptionId, {
        kind: 'SERVICE',
        identifier: 'bot-a',
        reason: null,
        costCenterId: companyCenter,
      }),
    ).toBe('23514');
    expect(
      await personal(subscriptionId, { kind: 'SERVICE', identifier: 'bot-b', reason: 'x', costCenterId: null }),
    ).toBe('23514');
    expect(
      await personal(subscriptionId, {
        kind: 'SERVICE',
        identifier: 'bot-c',
        reason: '  ',
        costCenterId: companyCenter,
      }),
    ).toBe('23514');
    expect(await personal(subscriptionId, { kind: 'PERSONAL', employeeId: other, costCenterId: unitCenter })).toBe(
      '23514',
    );
  });

  it('keeps the period in order and the expected end no earlier than the start', async () => {
    const subscriptionId = await fresh(10);

    expect(
      await personal(subscriptionId, { employeeId: other, validFrom: '2026-10-01', validUntil: '2026-10-01' }),
    ).toBe('23514');
    expect(
      await personal(subscriptionId, { employeeId: other, validFrom: '2026-10-01', validUntil: '2026-09-30' }),
    ).toBe('23514');
    expect(
      await personal(subscriptionId, { employeeId: other, validFrom: '2026-10-01', expectedEnd: '2026-09-30' }),
    ).toBe('23514');
    expect(
      await personal(subscriptionId, { employeeId: other, validFrom: '2026-10-01', validUntil: '2026-10-02' }),
    ).toBeNull();
  });

  it('ties the source to its evidence: a baseline row names its import, a handover row its predecessor', async () => {
    const subscriptionId = await fresh(10);

    expect(await personal(subscriptionId, { employeeId: other, source: 'BASELINE', importId: null })).toBe('23514');
    expect(await personal(subscriptionId, { employeeId: other, source: 'REQUEST', importId: null })).toBeNull();
    expect(
      await personal(subscriptionId, {
        employeeId: intern,
        source: 'HANDOVER',
        importId: null,
        expectedEnd: '2027-01-01',
      }),
    ).toBe('23514');
  });

  it('refuses a subscription that belongs to another plan than the row names', async () => {
    const subscriptionId = await fresh();

    expect(await insert({ planId: otherPlan, subscriptionId })).toBe('23514');
  });

  describe('INV-02: the same person twice on one subscription', () => {
    it('refuses two personal seats of one person whose periods overlap, and allows consecutive ones', async () => {
      const subscriptionId = await fresh(10);

      expect(
        await personal(subscriptionId, { employeeId: staff, validFrom: '2026-01-01', validUntil: '2026-06-01' }),
      ).toBeNull();
      expect(await personal(subscriptionId, { employeeId: staff, validFrom: '2026-05-31' })).toBe('23P01');
      expect(await personal(subscriptionId, { employeeId: staff, validFrom: '2026-06-01' })).toBeNull();
      expect(await personal(subscriptionId, { employeeId: staff, validFrom: '2026-12-01' })).toBe('23P01');
    });

    it('refuses the same person twice on an internal plan, which has no subscription', async () => {
      const first = await insert({ planId: internalPlan, subscriptionId: null, employeeId: other });
      const second = await insert({ planId: internalPlan, subscriptionId: null, employeeId: other });

      expect(first).toBeNull();
      expect(second).toBe('23P01');
    });

    it('lets one person hold a personal seat and several service accounts on the same subscription (AC-9)', async () => {
      const subscriptionId = await fresh(10);

      expect(await personal(subscriptionId, { employeeId: staff, identifier: 'e2@congty.vn' })).toBeNull();
      expect(
        await personal(subscriptionId, {
          kind: 'SERVICE',
          employeeId: staff,
          identifier: 'ci-bot',
          reason: 'CI',
          costCenterId: companyCenter,
        }),
      ).toBeNull();
      expect(
        await personal(subscriptionId, {
          kind: 'SERVICE',
          employeeId: staff,
          identifier: 'release-bot',
          reason: 'Releases',
          costCenterId: companyCenter,
        }),
      ).toBeNull();
    });

    it('lets two people hold seats of two different subscriptions of the same plan at once', async () => {
      const first = await fresh(10);
      const second = await fresh(10);

      expect(await personal(first, { employeeId: staff })).toBeNull();
      expect(await personal(second, { employeeId: staff })).toBeNull();
    });
  });

  describe('AC-9: one account identifier on one subscription', () => {
    it('refuses an identifier that is in use in an overlapping period, whatever its case and spaces', async () => {
      const subscriptionId = await fresh(10);

      expect(
        await personal(subscriptionId, {
          employeeId: staff,
          identifier: 'ci-bot',
          kind: 'SERVICE',
          reason: 'CI',
          costCenterId: companyCenter,
        }),
      ).toBeNull();
      expect(
        await personal(subscriptionId, {
          employeeId: other,
          identifier: ' CI-Bot ',
          kind: 'SERVICE',
          reason: 'CI',
          costCenterId: companyCenter,
        }),
      ).toBe('23P01');
    });

    it('lets the identifier be used again once the earlier period has ended (a change of the responsible person)', async () => {
      const subscriptionId = await fresh(10);
      const service = { kind: 'SERVICE', reason: 'CI', costCenterId: companyCenter, identifier: 'ci-bot' } as const;

      expect(
        await personal(subscriptionId, {
          ...service,
          employeeId: staff,
          validFrom: '2026-10-01',
          validUntil: '2026-10-15',
        }),
      ).toBeNull();
      expect(await personal(subscriptionId, { ...service, employeeId: other, validFrom: '2026-10-15' })).toBeNull();
    });
  });

  describe('INV-07: time-limited staff need an expected end date', () => {
    it.each([
      ['an intern', () => intern],
      ['a contractor', () => contractor],
      ['a freelancer', () => freelancer],
    ])('refuses a seat of %s without one, and takes it with one', async (_name, who) => {
      const subscriptionId = await fresh(10);

      expect(await personal(subscriptionId, { employeeId: who(), expectedEnd: null })).toBe('23514');
      expect(await personal(subscriptionId, { employeeId: who(), expectedEnd: '2027-03-31' })).toBeNull();
    });

    it('does not ask permanent staff for one', async () => {
      const subscriptionId = await fresh(10);

      expect(await personal(subscriptionId, { employeeId: other, expectedEnd: null })).toBeNull();
    });
  });

  describe('INV-01: seats taken never exceed the seats bought', () => {
    it('refuses the seat after the last one, for one person at a time', async () => {
      const subscriptionId = await fresh(2);
      const people = [staff, other, intern];

      expect(await personal(subscriptionId, { employeeId: people[0] })).toBeNull();
      expect(await personal(subscriptionId, { employeeId: people[1] })).toBeNull();
      expect(await personal(subscriptionId, { employeeId: people[2], expectedEnd: '2027-01-01' })).toBe('23514');
    });

    it('refuses any seat of a subscription whose number of seats is not known', async () => {
      const subscriptionId = await fresh(null);

      expect(await personal(subscriptionId, { employeeId: staff })).toBe('23514');
    });

    it('does not count a seat that has ended or has not started when it checks the days of a new one', async () => {
      const subscriptionId = await fresh(1);

      expect(
        await personal(subscriptionId, { employeeId: staff, validFrom: '2026-01-01', validUntil: '2026-02-01' }),
      ).toBeNull();
      expect(
        await personal(subscriptionId, { employeeId: other, validFrom: '2026-02-01', validUntil: '2026-03-01' }),
      ).toBeNull();
      expect(
        await personal(subscriptionId, { employeeId: intern, validFrom: '2026-01-15', expectedEnd: '2027-01-01' }),
      ).toBe('23514');
    });

    it('checks the later days too: a seat that began earlier is refused when a seat that begins later would then overlap it', async () => {
      const subscriptionId = await fresh(1);

      expect(await personal(subscriptionId, { employeeId: staff, validFrom: '2026-11-01' })).toBeNull();
      expect(await personal(subscriptionId, { employeeId: other, validFrom: '2026-10-01' })).toBe('23514');
      expect(
        await personal(subscriptionId, { employeeId: other, validFrom: '2026-10-01', validUntil: '2026-11-01' }),
      ).toBeNull();
    });

    it('lets a handover keep the count at every day: the old seat ends the day the new one begins', async () => {
      const subscriptionId = await fresh(1);
      const service = { kind: 'SERVICE', reason: 'CI', costCenterId: companyCenter, identifier: 'ci-bot' } as const;
      const first = randomUUID();
      await personal(subscriptionId, { ...service, employeeId: staff, validFrom: '2026-10-01', id: first });

      await sql.query('BEGIN');
      await sql.query(`UPDATE license_assignments SET valid_until = '2026-10-15' WHERE id = $1`, [first]);
      const next = await personal(subscriptionId, {
        ...service,
        employeeId: other,
        validFrom: '2026-10-15',
        source: 'HANDOVER',
        importId: null,
        predecessorId: first,
      });
      await sql.query('COMMIT');

      expect(next).toBeNull();
    });

    it('lets only one of two writers take the last seat, however they interleave', async () => {
      const subscriptionId = await fresh(1);
      const second = new Client({ connectionString: database.url });
      await second.connect();
      try {
        await sql.query('BEGIN');
        expect(await personal(subscriptionId, { employeeId: staff })).toBeNull();
        const pending = insert({ planId: flatPlan, subscriptionId, employeeId: other }, second);
        await wait(400);
        await sql.query('COMMIT');

        expect(await pending).toBe('23514');
      } finally {
        await second.end();
      }
    });

    it('does not check a seat of an internal plan, which has no number of seats', async () => {
      const holders = [
        await newEmployee('E-I1', 'STAFF'),
        await newEmployee('E-I2', 'STAFF'),
        await newEmployee('E-I3', 'STAFF'),
      ];
      for (const holder of holders) {
        expect(await insert({ planId: internalPlan, subscriptionId: null, employeeId: holder })).toBeNull();
      }
    });
  });

  describe('the history of a seat', () => {
    it('never deletes an assignment, and changes nothing of it but when it ends and when it is expected to end', async () => {
      const subscriptionId = await fresh(10);
      const id = randomUUID();
      await personal(subscriptionId, { employeeId: staff, id });

      expect(await sqlState(sql, `DELETE FROM license_assignments WHERE id = $1`, [id])).toBe('55000');
      expect(await sqlState(sql, `UPDATE license_assignments SET employee_id = $2 WHERE id = $1`, [id, other])).toBe(
        '55000',
      );
      expect(await sqlState(sql, `UPDATE license_assignments SET account_identifier = 'x' WHERE id = $1`, [id])).toBe(
        '55000',
      );
      expect(await sqlState(sql, `UPDATE license_assignments SET valid_from = '2026-09-01' WHERE id = $1`, [id])).toBe(
        '55000',
      );
      expect(await sqlState(sql, `UPDATE license_assignments SET source = 'REQUEST' WHERE id = $1`, [id])).toBe(
        '55000',
      );
      expect(
        await sqlState(sql, `UPDATE license_assignments SET valid_until = '2026-12-01' WHERE id = $1`, [id]),
      ).toBeNull();
      expect(
        await sqlState(sql, `UPDATE license_assignments SET expected_end_date = '2027-01-01' WHERE id = $1`, [id]),
      ).toBeNull();
    });
  });

  describe('closing the baseline (AC-6)', () => {
    it('refuses a baseline assignment once the baseline is closed, and still takes handover and request ones', async () => {
      await sql.query(`INSERT INTO seat_baseline_states (organization_id) VALUES ($1)`, [organizationId]);
      const subscriptionId = await fresh(10);
      expect(await personal(subscriptionId, { employeeId: other, source: 'BASELINE' })).toBeNull();

      await sql.query(
        `UPDATE seat_baseline_states SET closed_at = now(), closed_by_app_user_id = $2 WHERE organization_id = $1`,
        [organizationId, randomUUID()],
      );

      expect(await personal(subscriptionId, { employeeId: staff, source: 'BASELINE' })).toBe('55000');
      expect(
        await personal(subscriptionId, {
          employeeId: intern,
          source: 'REQUEST',
          importId: null,
          expectedEnd: '2027-01-01',
        }),
      ).toBeNull();
    });

    it('never reopens a closed baseline and keeps the closer with the time', async () => {
      expect(
        await sqlState(
          sql,
          `UPDATE seat_baseline_states SET closed_at = NULL, closed_by_app_user_id = NULL WHERE organization_id = $1`,
          [organizationId],
        ),
      ).toBe('55000');
      expect(await sqlState(sql, `DELETE FROM seat_baseline_states WHERE organization_id = $1`, [organizationId])).toBe(
        '55000',
      );
      expect(
        await sqlState(sql, `UPDATE seat_baseline_states SET closed_by_app_user_id = NULL WHERE organization_id = $1`, [
          organizationId,
        ]),
      ).toBe('55000');
    });
  });
});
