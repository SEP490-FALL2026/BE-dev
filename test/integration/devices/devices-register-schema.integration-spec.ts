import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
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
import { stopCliProcesses } from '../../support/cli-process';

/** What a rejected statement carried: the SQLSTATE and the constraint that said no, or null when it went through. */
async function refusal(
  sql: Client,
  text: string,
  values: unknown[] = [],
): Promise<{ code: string; constraint: string } | null> {
  try {
    await sql.query(text, values);

    return null;
  } catch (error) {
    const failure = error as { code?: string; constraint?: string };

    return { code: failure.code ?? 'unknown', constraint: failure.constraint ?? '' };
  }
}

const FIRST_NEW_MIGRATION = migrationEndingWith('_device_registration_end_cause_returned');

/**
 * Redesign wave 2, W2-01 (a) (b) (f): the register of machines grows a life. The history is deployed up to the migration before the wave,
 * the rows of the old register are written, then the four migrations of the wave are applied, so what the backfills did to real old rows
 * is seen. Then the new tables, CHECKs and triggers of the register are driven with plain SQL.
 */
describe('the register of machines after the migrations of wave 2 (integration, PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  const org = randomUUID();
  const holder = randomUUID();
  const other = randomUUID();
  const user = randomUUID();
  const ids = {
    retired: randomUUID(),
    plain: randomUUID(),
    lap7: randomUUID(),
    pcSpaced: randomUUID(),
    k4Plan: randomUUID(),
    k1Plan: randomUUID(),
    openRegistration: randomUUID(),
    endedRegistration: randomUUID(),
  };

  const insertDevice = async (
    assetCode: string,
    over: Partial<Record<'serial' | 'normalizedSerial' | 'origin' | 'type', string | null>> = {},
  ): Promise<{ id: string; failure: Awaited<ReturnType<typeof refusal>> }> => {
    const id = randomUUID();
    const failure = await refusal(
      sql,
      `INSERT INTO managed_devices (id, organization_id, asset_code, normalized_asset_code, hostname, os, serial_number,
         normalized_serial_number, asset_code_origin, device_type, created_by_app_user_id, updated_at)
       VALUES ($1, $2, $3, upper($3), 'host', 'Windows', $4, $5, COALESCE($6, 'LEGACY')::"DeviceAssetCodeOrigin",
         COALESCE($7, 'OTH')::"DeviceType", $8, now())`,
      [
        id,
        org,
        assetCode,
        over.serial ?? null,
        over.normalizedSerial ?? null,
        over.origin ?? null,
        over.type ?? null,
        user,
      ],
    );

    return { id, failure };
  };

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    const before = await deployMigrations(database, { through: migrationBefore(FIRST_NEW_MIGRATION) });
    if (before.code !== 0) throw new Error(`Deploying the history before the wave failed: ${before.stdout}`);

    // The register as the code of wave 1 left it: no kind, no serial number, no condition, no collector flag.
    await sql.query(
      `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
      [org],
    );
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at) VALUES
         ($1, $3, 'E-HOLD', 'Holder', 'STAFF', '2026-01-01', now()), ($2, $3, 'E-OTHER', 'Other', 'STAFF', '2026-01-01', now())`,
      [holder, other, org],
    );
    await sql.query(
      `INSERT INTO managed_devices (id, organization_id, asset_code, normalized_asset_code, hostname, os, retired_at,
         retirement_reason, created_by_app_user_id, updated_at) VALUES
         ($1, $5, 'SV-LT-001', 'SV-LT-001', 'old', 'Windows', '2026-03-01T00:00:00Z', 'Sold', $6, now()),
         ($2, $5, 'SV-LT-002', 'SV-LT-002', 'kept', 'Windows', NULL, NULL, $6, now()),
         ($3, $5, 'LAP-26-0007', 'LAP-26-0007', 'typed', 'Windows', NULL, NULL, $6, now()),
         ($4, $5, 'pc-26-0003 ', 'PC-26-0003', 'spaced', 'Windows', NULL, NULL, $6, now())`,
      [ids.retired, ids.plain, ids.lap7, ids.pcSpaced, org, user],
    );
    await sql.query(
      `INSERT INTO device_registrations (id, organization_id, device_id, holder_employee_id, valid_from, valid_until, ended_at,
         end_cause, created_by_app_user_id) VALUES
         ($1, $5, $3, $6, '2026-01-10', NULL, NULL, NULL, $8),
         ($2, $5, $4, $7, '2026-01-10', '2026-03-01', '2026-03-01T00:00:00Z', 'DEVICE_RETIRED', $8)`,
      [ids.openRegistration, ids.endedRegistration, ids.plain, ids.retired, org, holder, other, user],
    );
    const vendor = randomUUID();
    const application = randomUUID();
    await sql.query(`INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, 'V', 'v')`, [
      vendor,
      org,
    ]);
    await sql.query(
      `INSERT INTO applications (id, organization_id, kind, vendor_id, name, normalized_name, business_owner_employee_id,
         data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
       VALUES ($1, $2, 'LICENSED', $3, 'Office', 'office', $4, 'LOW', false, false, false, false)`,
      [application, org, vendor, holder],
    );
    await sql.query(
      `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level)
       VALUES ($1, $3, $4, 'Perpetual', 'perpetual', 'K4', 'PER_SEAT', 'FULL'),
              ($2, $3, $4, 'Monthly', 'monthly', 'K1', 'PER_SEAT', 'FULL')`,
      [ids.k4Plan, ids.k1Plan, org, application],
    );

    const after = await deployMigrations(database);
    if (after.code !== 0)
      throw new Error(`Deploying the migrations of the wave failed: ${after.stdout}\n${after.stderr}`);
  }, DEPLOY_TIMEOUT_MS * 2);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
    stopCliProcesses();
  });

  describe('what the migrations did to the rows that were already there', () => {
    it('gives every old machine the kind OTH, a typed (legacy) asset code and the condition USABLE', async () => {
      const { rows } = await sql.query<{ device_type: string; asset_code_origin: string; condition: string }>(
        `SELECT DISTINCT device_type::text, asset_code_origin::text, condition::text FROM managed_devices WHERE organization_id = $1`,
        [org],
      );

      expect(rows).toEqual([{ device_type: 'OTH', asset_code_origin: 'LEGACY', condition: 'USABLE' }]);
    });

    it('says a machine retired before the wave was disposed of, and leaves the others without a way of retiring', async () => {
      const kinds = await sql.query<{ asset_code: string; retirement_kind: string | null }>(
        `SELECT asset_code, retirement_kind::text FROM managed_devices WHERE id = ANY($1)`,
        [[ids.retired, ids.plain]],
      );

      expect(Object.fromEntries(kinds.rows.map((row) => [row.asset_code, row.retirement_kind]))).toEqual({
        'SV-LT-001': 'DISPOSED',
        'SV-LT-002': null,
      });
    });

    it('marks every old holding as having the collector installed, and a new holding as not having it', async () => {
      const old = await sql.query<{ collector_installed: boolean }>(
        `SELECT collector_installed FROM device_registrations WHERE id = ANY($1)`,
        [[ids.openRegistration, ids.endedRegistration]],
      );
      const fresh = randomUUID();
      await sql.query(
        `INSERT INTO device_registrations (id, organization_id, device_id, holder_employee_id, valid_from, created_by_app_user_id)
         VALUES ($1, $2, $3, $4, '2026-02-01', $5)`,
        [fresh, org, ids.lap7, holder, user],
      );
      const created = await sql.query<{ collector_installed: boolean }>(
        `SELECT collector_installed FROM device_registrations WHERE id = $1`,
        [fresh],
      );

      expect(old.rows.map((row) => row.collector_installed)).toEqual([true, true]);
      expect(created.rows[0].collector_installed).toBe(false);
    });

    it('binds every K4 plan to an account and leaves the plans of the other kinds with no binding', async () => {
      const { rows } = await sql.query<{ id: string; key_binding: string | null }>(
        `SELECT id, key_binding::text FROM plans WHERE id = ANY($1)`,
        [[ids.k4Plan, ids.k1Plan]],
      );

      expect(Object.fromEntries(rows.map((row) => [row.id, row.key_binding]))).toEqual({
        [ids.k4Plan]: 'ACCOUNT',
        [ids.k1Plan]: null,
      });
    });

    it('starts the counters from the generated-form codes already there, trailing space and case ignored, and skips the other forms', async () => {
      const { rows } = await sql.query<{ device_type: string; year: number; last_value: number }>(
        `SELECT device_type::text, year, last_value FROM device_code_counters ORDER BY device_type`,
      );

      expect(rows).toEqual([
        { device_type: 'LAP', year: 2026, last_value: 7 },
        { device_type: 'PC', year: 2026, last_value: 3 },
      ]);
    });
  });

  describe('the machines', () => {
    it('keeps a machine, its asset code and who entered it', async () => {
      const { id } = await insertDevice('SV-GUARD-1');

      expect((await refusal(sql, `DELETE FROM managed_devices WHERE id = $1`, [id]))?.constraint).toBe(
        'managed_devices_kept',
      );
      expect((await refusal(sql, `UPDATE managed_devices SET asset_code = 'X' WHERE id = $1`, [id]))?.constraint).toBe(
        'managed_devices_identity_fixed',
      );
      expect(
        (await refusal(sql, `UPDATE managed_devices SET asset_code_origin = 'GENERATED' WHERE id = $1`, [id]))
          ?.constraint,
      ).toBe('managed_devices_identity_fixed');
      expect(
        await refusal(sql, `UPDATE managed_devices SET hostname = 'renamed', condition = 'IN_REPAIR' WHERE id = $1`, [
          id,
        ]),
      ).toBeNull();
    });

    it('lets a machine be retired once and then changes nothing but its update time', async () => {
      const { id } = await insertDevice('SV-GUARD-2');

      expect(
        (
          await refusal(
            sql,
            `UPDATE managed_devices SET retired_at = now(), retirement_reason = 'Sold' WHERE id = $1`,
            [id],
          )
        )?.constraint,
      ).toBe('managed_devices_retired_complete');
      expect(
        await refusal(
          sql,
          `UPDATE managed_devices SET retired_at = now(), retirement_reason = 'Sold', retirement_kind = 'DISPOSED' WHERE id = $1`,
          [id],
        ),
      ).toBeNull();
      expect((await refusal(sql, `UPDATE managed_devices SET hostname = 'late' WHERE id = $1`, [id]))?.constraint).toBe(
        'managed_devices_closed_fixed',
      );
      expect(await refusal(sql, `UPDATE managed_devices SET updated_at = now() WHERE id = $1`, [id])).toBeNull();
    });

    it('voids a record typed by mistake instead of deleting it, never one that was retired, and never changes it after', async () => {
      const typed = (await insertDevice('SV-VOID-1')).id;
      const retired = (await insertDevice('SV-VOID-2')).id;
      await sql.query(
        `UPDATE managed_devices SET retired_at = now(), retirement_reason = 'Sold', retirement_kind = 'LOST' WHERE id = $1`,
        [retired],
      );
      const void_ = `UPDATE managed_devices SET voided_at = now(), void_reason = 'Typed twice', voided_by_app_user_id = $2 WHERE id = $1`;

      expect((await refusal(sql, void_, [retired, user]))?.constraint).toBe('managed_devices_closed_fixed');
      expect(await refusal(sql, `UPDATE managed_devices SET voided_at = now() WHERE id = $1`, [typed])).toMatchObject({
        constraint: 'managed_devices_void_complete',
      });
      expect(await refusal(sql, void_, [typed, user])).toBeNull();
      expect(
        (await refusal(sql, `UPDATE managed_devices SET condition = 'BROKEN' WHERE id = $1`, [typed]))?.constraint,
      ).toBe('managed_devices_closed_fixed');
    });

    it('accepts a generated asset code only in its form, and a typed one in any form', async () => {
      expect((await insertDevice('LAP-26-0100', { origin: 'GENERATED' })).failure).toBeNull();
      expect((await insertDevice('LAP-26-100', { origin: 'GENERATED' })).failure?.constraint).toBe(
        'managed_devices_asset_code_form',
      );
      expect((await insertDevice('SV-FREE', { origin: 'LEGACY' })).failure).toBeNull();
    });

    it('keeps the serial number and its search key together, and one serial number once in an organization', async () => {
      expect((await insertDevice('SN-1', { serial: 'abc' })).failure?.constraint).toBe('managed_devices_serial_pair');
      expect((await insertDevice('SN-2', { serial: 'abc', normalizedSerial: 'ABC' })).failure).toBeNull();
      expect((await insertDevice('SN-3', { serial: 'a b c', normalizedSerial: 'ABC' })).failure).toMatchObject({
        code: '23505',
        constraint: 'managed_devices_organization_id_normalized_serial_number_key',
      });
      expect((await insertDevice('SN-4')).failure).toBeNull();
      expect((await insertDevice('SN-5')).failure).toBeNull();
    });
  });

  describe('the holdings', () => {
    const holding = async (): Promise<string> => {
      const device = (await insertDevice(`SV-H-${randomUUID().slice(0, 8)}`)).id;
      const id = randomUUID();
      await sql.query(
        `INSERT INTO device_registrations (id, organization_id, device_id, holder_employee_id, valid_from, created_by_app_user_id)
         VALUES ($1, $2, $3, $4, '2026-02-01', $5)`,
        [id, org, device, holder, user],
      );

      return id;
    };
    const ending = `valid_until = '2026-03-01', ended_at = now(), end_cause = 'RETURNED'`;

    it('lets the collector flag go from false to true while the holding is open, and never back', async () => {
      const id = await holding();

      expect(
        await refusal(sql, `UPDATE device_registrations SET collector_installed = true WHERE id = $1`, [id]),
      ).toBeNull();
      expect(
        (await refusal(sql, `UPDATE device_registrations SET collector_installed = false WHERE id = $1`, [id]))
          ?.constraint,
      ).toBe('device_registrations_fixed');
    });

    it('does not let the collector flag change once the holding has ended', async () => {
      const id = await holding();
      await sql.query(`UPDATE device_registrations SET ${ending}, software_removal = 'REMOVED' WHERE id = $1`, [id]);

      expect(
        (await refusal(sql, `UPDATE device_registrations SET collector_installed = true WHERE id = $1`, [id]))
          ?.constraint,
      ).toBe('device_registrations_fixed');
    });

    it('takes the way the software was removed only in the update that ends the holding, and fixes it after', async () => {
      const id = await holding();

      expect(
        (await refusal(sql, `UPDATE device_registrations SET software_removal = 'REMOVED' WHERE id = $1`, [id]))
          ?.constraint,
      ).toBe('device_registrations_fixed');
      expect(
        (
          await refusal(
            sql,
            `UPDATE device_registrations SET ${ending}, software_removal = 'NOT_REMOVABLE' WHERE id = $1`,
            [id],
          )
        )?.constraint,
      ).toBe('device_registrations_software_removal');
      expect(
        await refusal(
          sql,
          `UPDATE device_registrations SET ${ending}, software_removal = 'NOT_REMOVABLE', software_removal_note = 'Disk dead' WHERE id = $1`,
          [id],
        ),
      ).toBeNull();
      expect(
        (await refusal(sql, `UPDATE device_registrations SET software_removal_note = 'Edited' WHERE id = $1`, [id]))
          ?.constraint,
      ).toBe('device_registrations_fixed');
    });

    it('still keeps what it kept before: never deleted, ends once', async () => {
      const id = await holding();
      await sql.query(`UPDATE device_registrations SET ${ending} WHERE id = $1`, [id]);

      expect((await refusal(sql, `DELETE FROM device_registrations WHERE id = $1`, [id]))?.constraint).toBe(
        'device_registrations_kept',
      );
      expect(
        (await refusal(sql, `UPDATE device_registrations SET end_cause = 'DEPARTURE' WHERE id = $1`, [id]))?.constraint,
      ).toBe('device_registrations_fixed');
    });
  });

  describe('the jobs of taking a machine back', () => {
    const insertJob = `INSERT INTO device_return_tasks (id, organization_id, device_id, registration_id, employee_id, offboarding_case_id, due_on)
                       VALUES ($1, $2, $3, $4, $5, $6, '2026-03-01')`;
    const holding = async (device: string, from: string): Promise<string> => {
      const registration = randomUUID();
      await sql.query(
        `INSERT INTO device_registrations (id, organization_id, device_id, holder_employee_id, valid_from, created_by_app_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [registration, org, device, holder, from, user],
      );

      return registration;
    };
    const job = async (): Promise<{ id: string; device: string; registration: string }> => {
      const device = (await insertDevice(`SV-J-${randomUUID().slice(0, 8)}`)).id;
      const registration = await holding(device, '2026-02-01');
      const id = randomUUID();
      await sql.query(insertJob, [id, org, device, registration, holder, randomUUID()]);

      return { id, device, registration };
    };

    it('makes one job for a holding, and one open job for a machine', async () => {
      const { id, device, registration } = await job();

      expect(
        (await refusal(sql, insertJob, [randomUUID(), org, device, registration, holder, randomUUID()]))?.constraint,
      ).toBe('device_return_tasks_registration_id_key');

      // The first holding ends and the machine is held again: a second job for the machine is refused while the first is open.
      await sql.query(
        `UPDATE device_registrations SET valid_until = '2026-02-15', ended_at = now(), end_cause = 'HOLDER_CHANGED' WHERE id = $1`,
        [registration],
      );
      const second = await holding(device, '2026-02-15');
      expect(
        (await refusal(sql, insertJob, [randomUUID(), org, device, second, holder, randomUUID()]))?.constraint,
      ).toBe('device_return_tasks_one_open');

      await sql.query(
        `UPDATE device_return_tasks SET state = 'NOT_RECOVERED', handled_at = now(), handled_by_app_user_id = $2, outcome_note = 'Lost' WHERE id = $1`,
        [id, user],
      );
      expect(await refusal(sql, insertJob, [randomUUID(), org, device, second, holder, randomUUID()])).toBeNull();
    });

    it('closes a job once, with what its state needs, and then changes nothing', async () => {
      const { id } = await job();
      const received = `UPDATE device_return_tasks SET state = 'RECEIVED', handled_at = now(), handled_by_app_user_id = $2,
                          condition_on_receipt = 'USABLE', software_removal = 'REMOVED' WHERE id = $1`;

      expect(
        (
          await refusal(sql, `UPDATE device_return_tasks SET state = 'RECEIVED', handled_at = now() WHERE id = $1`, [
            id,
          ])
        )?.constraint,
      ).toBe('device_return_tasks_outcome');
      expect(
        (
          await refusal(
            sql,
            `UPDATE device_return_tasks SET state = 'NOT_RECOVERED', handled_at = now(), handled_by_app_user_id = $2 WHERE id = $1`,
            [id, user],
          )
        )?.constraint,
      ).toBe('device_return_tasks_outcome');
      expect(await refusal(sql, received, [id, user])).toBeNull();
      expect(
        (await refusal(sql, `UPDATE device_return_tasks SET outcome_note = 'changed my mind' WHERE id = $1`, [id]))
          ?.constraint,
      ).toBe('device_return_tasks_closed_fixed');
    });

    it('lets the due date and the day of the last reminder move while the job is open, and nothing that names it', async () => {
      const { id } = await job();

      expect(
        await refusal(
          sql,
          `UPDATE device_return_tasks SET due_on = '2026-03-05', overdue_noticed_on = '2026-03-06' WHERE id = $1`,
          [id],
        ),
      ).toBeNull();
      expect(
        (await refusal(sql, `UPDATE device_return_tasks SET department_id = gen_random_uuid() WHERE id = $1`, [id]))
          ?.constraint,
      ).toBe('device_return_tasks_identity_fixed');
      expect((await refusal(sql, `DELETE FROM device_return_tasks WHERE id = $1`, [id]))?.constraint).toBe(
        'device_return_tasks_kept',
      );
    });

    it('closes a job the system cancelled with nobody handling it', async () => {
      const { id } = await job();

      expect(
        (
          await refusal(
            sql,
            `UPDATE device_return_tasks SET state = 'CANCELLED', handled_at = now(), handled_by_app_user_id = $2 WHERE id = $1`,
            [id, user],
          )
        )?.constraint,
      ).toBe('device_return_tasks_outcome');
      expect(
        await refusal(sql, `UPDATE device_return_tasks SET state = 'CANCELLED', handled_at = now() WHERE id = $1`, [
          id,
        ]),
      ).toBeNull();
    });
  });

  describe('the counters of asset codes', () => {
    it('keeps the year and the value inside what four digits and two year digits can say', async () => {
      const insert = `INSERT INTO device_code_counters (device_type, year, last_value) VALUES ('OTH', $1, $2)`;

      expect((await refusal(sql, insert, [1999, 1]))?.constraint).toBe('device_code_counters_year_check');
      expect((await refusal(sql, insert, [2027, 10000]))?.constraint).toBe('device_code_counters_value_check');
      expect(await refusal(sql, insert, [2027, 9999])).toBeNull();
    });
  });
});
