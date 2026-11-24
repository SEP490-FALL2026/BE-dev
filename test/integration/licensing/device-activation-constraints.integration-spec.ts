import { randomBytes, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';

interface Refusal {
  code: string;
  constraint: string;
  message: string;
}

/** What a rejected statement carried (the SQLSTATE, the constraint, the message), or null when it went through. */
async function refusal(sql: Client, text: string, values: unknown[] = []): Promise<Refusal | null> {
  try {
    await sql.query(text, values);

    return null;
  } catch (error) {
    const failure = error as { code?: string; constraint?: string; message?: string };

    return { code: failure.code ?? 'unknown', constraint: failure.constraint ?? '', message: failure.message ?? '' };
  }
}

/**
 * Redesign wave 2, W2-01 (c) (d) (e) (g): what PostgreSQL itself holds for the right of a machine to run software bought once — the
 * activation rows, the cap of a lot, the cap of a key, the binding of a plan and the rule that a key of a plan bound to a machine is
 * never given to a person (S-4).
 */
describe('activations of a machine, the keys of a lot and the binding of a plan (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  const user = randomUUID();
  let org: string;
  let employee: string;
  let application: string;

  const hex = () => randomBytes(32).toString('hex');
  const one = async <T>(text: string, values: unknown[] = []): Promise<T> =>
    (await sql.query(text, values)).rows[0] as T;

  const plan = async (binding: 'ACCOUNT' | 'DEVICE_KEY' | 'DEVICE_BUNDLED' | null, type = 'K4'): Promise<string> => {
    const id = randomUUID();
    const failure = await refusal(
      sql,
      `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level, key_binding)
       VALUES ($1, $2, $3, $4, $4, $5, 'PER_SEAT', 'FULL', $6)`,
      [id, org, application, `plan-${id}`, type, binding],
    );
    if (failure) throw new Error(`plan fixture refused: ${failure.constraint} ${failure.message}`);

    return id;
  };
  const purchase = async (planId: string, licenses: number): Promise<string> => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO subscriptions (id, organization_id, plan_id, kind, status, purchased_quantity)
       VALUES ($1, $2, $3, 'PERPETUAL', 'DRAFT', $4)`,
      [id, org, planId, licenses],
    );

    return id;
  };
  const key = async (subscriptionId: string): Promise<string> => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO license_keys (id, organization_id, subscription_id, fingerprint, masked, ciphertext, cipher_key_id, imported_by_app_user_id)
       VALUES ($1, $2, $3, $4, '••••1234', $5, 'k1', $6)`,
      [id, org, subscriptionId, hex(), randomBytes(40), user],
    );

    return id;
  };
  const device = async (): Promise<string> => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO managed_devices (id, organization_id, asset_code, normalized_asset_code, hostname, os, created_by_app_user_id, updated_at)
       VALUES ($1, $2, $3, $3, 'host', 'Windows', $4, now())`,
      [id, org, `M-${id}`, user],
    );

    return id;
  };
  const activate = (deviceId: string, planId: string, keyId: string | null) =>
    refusal(
      sql,
      `INSERT INTO device_activations (id, organization_id, device_id, plan_id, license_key_id, origin, activated_on, activated_at,
         activated_by_app_user_id) VALUES ($1, $2, $3, $4, $5, 'OPERATION', '2026-02-01', now(), $6)`,
      [randomUUID(), org, deviceId, planId, keyId, user],
    );
  const close = (activationId: string, cause: string, released: boolean | null) =>
    refusal(
      sql,
      `UPDATE device_activations SET deactivated_on = '2026-03-01', deactivated_at = now(), end_cause = $2::"DeviceActivationEndCause",
         license_released = $3, closed_by_app_user_id = $4 WHERE id = $1`,
      [activationId, cause, released, user],
    );
  const activationOf = async (deviceId: string, planId: string): Promise<string> =>
    (
      await one<{ id: string }>(`SELECT id FROM device_activations WHERE device_id = $1 AND plan_id = $2`, [
        deviceId,
        planId,
      ])
    ).id;

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    org = randomUUID();
    employee = randomUUID();
    await sql.query(
      `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
      [org],
    );
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       VALUES ($1, $2, 'E-ONE', 'E-ONE', 'STAFF', '2026-01-01', now())`,
      [employee, org],
    );
    const vendor = randomUUID();
    application = randomUUID();
    await sql.query(`INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, 'V', 'v')`, [
      vendor,
      org,
    ]);
    await sql.query(
      `INSERT INTO applications (id, organization_id, kind, vendor_id, name, normalized_name, business_owner_employee_id,
         data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
       VALUES ($1, $2, 'LICENSED', $3, 'Windows', 'windows', $4, 'LOW', false, false, false, false)`,
      [application, org, vendor, employee],
    );
  }, 90000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  describe('the binding of a plan', () => {
    it('is set exactly on a K4 plan, and a plan bundled with the machine has no price and no console', async () => {
      expect(
        (
          await refusal(
            sql,
            `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level, key_binding)
        VALUES (gen_random_uuid(), $1, $2, 'k1', 'k1', 'K1', 'PER_SEAT', 'FULL', 'DEVICE_KEY')`,
            [org, application],
          )
        )?.constraint,
      ).toBe('plans_key_binding_k4');
      expect(
        (
          await refusal(
            sql,
            `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level)
        VALUES (gen_random_uuid(), $1, $2, 'k4', 'k4', 'K4', 'PER_SEAT', 'FULL')`,
            [org, application],
          )
        )?.constraint,
      ).toBe('plans_key_binding_k4');
      expect(
        (
          await refusal(
            sql,
            `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level, key_binding, has_admin_console)
        VALUES (gen_random_uuid(), $1, $2, 'b1', 'b1', 'K4', 'PER_SEAT', 'FULL', 'DEVICE_BUNDLED', true)`,
            [org, application],
          )
        )?.constraint,
      ).toBe('plans_device_bundled_shape');
      expect(await plan('DEVICE_BUNDLED')).toEqual(expect.any(String));
    });

    it('does not move while a perpetual purchase rests on it, whichever way it goes', async () => {
      const planId = await plan('ACCOUNT');
      await purchase(planId, 5);

      const blocked = await refusal(sql, `UPDATE plans SET key_binding = 'DEVICE_KEY' WHERE id = $1`, [planId]);

      expect(blocked).toMatchObject({ code: '23514', constraint: 'plans_change_keeps_key_binding' });
      expect(blocked?.message).toContain('plan_change_blocked: KEY_BINDING_PURCHASES');
    });

    it('does not move while a person holds a seat of the plan', async () => {
      const planId = await plan('ACCOUNT');
      await sql.query(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, employee_id, account_identifier,
           normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
         VALUES (gen_random_uuid(), $1, 'PERSONAL', 'REQUEST', $2, $3, 'a@x.vn', 'a@x.vn', '2026-01-05', 'ACTUAL', $4)`,
        [org, planId, employee, user],
      );

      const blocked = await refusal(sql, `UPDATE plans SET key_binding = 'DEVICE_KEY' WHERE id = $1`, [planId]);

      expect(blocked).toMatchObject({ code: '23514', constraint: 'plans_change_keeps_key_binding_assignments' });
      expect(blocked?.message).toContain('plan_change_blocked: KEY_BINDING_ASSIGNMENTS');
    });

    it('does not move while a machine holds an activation of the plan', async () => {
      const planId = await plan('DEVICE_BUNDLED');
      expect(await activate(await device(), planId, null)).toBeNull();

      const blocked = await refusal(sql, `UPDATE plans SET key_binding = 'DEVICE_KEY' WHERE id = $1`, [planId]);

      expect(blocked).toMatchObject({ code: '23514', constraint: 'plans_change_keeps_device_activations' });
      expect(blocked?.message).toContain('plan_change_blocked: DEVICE_ACTIVATIONS');
    });

    it('does not leave K4 (the binding goes to none) while a machine holds an activation of the plan', async () => {
      const planId = await plan('DEVICE_BUNDLED');
      expect(await activate(await device(), planId, null)).toBeNull();

      const blocked = await refusal(
        sql,
        `UPDATE plans SET provisioning_type = 'K1', key_binding = NULL WHERE id = $1`,
        [planId],
      );

      expect(blocked).toMatchObject({ code: '23514', constraint: 'plans_change_keeps_device_activations' });
      expect(blocked?.message).toContain('plan_change_blocked: DEVICE_ACTIVATIONS');
    });

    it('moves when nothing rests on the plan', async () => {
      const planId = await plan('ACCOUNT');

      expect(await refusal(sql, `UPDATE plans SET key_binding = 'DEVICE_KEY' WHERE id = $1`, [planId])).toBeNull();
    });
  });

  describe('the activations of a machine', () => {
    it('refuses an activation of a plan bound to an account, and one whose key does not fit the plan', async () => {
      const account = await plan('ACCOUNT');
      const bound = await plan('DEVICE_KEY');
      const bundled = await plan('DEVICE_BUNDLED');
      const boundKey = await key(await purchase(bound, 3));
      const accountKey = await key(await purchase(account, 3));

      expect((await activate(await device(), account, accountKey))?.constraint).toBe(
        'device_activations_plan_device_bound',
      );
      expect((await activate(await device(), bound, null))?.constraint).toBe('device_activations_key_fits_plan');
      expect((await activate(await device(), bundled, boundKey))?.constraint).toBe('device_activations_key_fits_plan');
      expect((await activate(await device(), bound, accountKey))?.constraint).toBe('device_activations_key_usable');
      expect(await activate(await device(), bound, boundKey)).toBeNull();
      expect(await activate(await device(), bundled, null)).toBeNull();
    });

    it('refuses a key that was withdrawn from the store', async () => {
      const bound = await plan('DEVICE_KEY');
      const withdrawn = await key(await purchase(bound, 3));
      await sql.query(`UPDATE license_keys SET withdrawn_at = now(), withdrawal_reason = 'Leaked' WHERE id = $1`, [
        withdrawn,
      ]);

      expect((await activate(await device(), bound, withdrawn))?.constraint).toBe('device_activations_key_usable');
    });

    it('keeps one open activation of a plan on a machine, and takes another once the first is closed', async () => {
      const bound = await plan('DEVICE_KEY');
      const keyId = await key(await purchase(bound, 5));
      const machine = await device();
      expect(await activate(machine, bound, keyId)).toBeNull();

      expect((await activate(machine, bound, keyId))?.code).toBe('23505');
      expect(await close(await activationOf(machine, bound), 'DEACTIVATED', true)).toBeNull();
      expect(await activate(machine, bound, keyId)).toBeNull();
    });

    it('takes no more activations of the keys of a purchase than the purchase has licenses, whatever key they use', async () => {
      const bound = await plan('DEVICE_KEY');
      const subscription = await purchase(bound, 2);
      const [first, second] = [await key(subscription), await key(subscription)];

      expect(await activate(await device(), bound, first)).toBeNull();
      expect(await activate(await device(), bound, second)).toBeNull();

      const third = await refusal(
        sql,
        `INSERT INTO device_activations (id, organization_id, device_id, plan_id, license_key_id, origin, activated_on, activated_at,
           activated_by_app_user_id) VALUES ($1, $2, $3, $4, $5, 'OPERATION', '2026-02-01', now(), $6)`,
        [randomUUID(), org, await device(), bound, first, user],
      );

      expect(third).toMatchObject({ code: '23514', constraint: 'device_activations_lot_capacity' });
    });

    it('frees a license when the activation closes and the license goes back to the lot, and keeps it taken when it was lost with the machine', async () => {
      const bound = await plan('DEVICE_KEY');
      const subscription = await purchase(bound, 1);
      const keyId = await key(subscription);
      const first = await device();
      expect(await activate(first, bound, keyId)).toBeNull();
      const second = await device();
      expect((await activate(second, bound, keyId))?.constraint).toBe('device_activations_lot_capacity');

      // The license was lost with the machine: it stays counted.
      expect(await close(await activationOf(first, bound), 'DEVICE_LOST', false)).toBeNull();
      expect((await activate(second, bound, keyId))?.constraint).toBe('device_activations_lot_capacity');
      expect(
        (await one<{ taken: string }>(`SELECT device_activation_occupied($1)::text AS taken`, [subscription])).taken,
      ).toBe('1');
    });

    it('lets a license that went back to the lot be taken by another machine', async () => {
      const bound = await plan('DEVICE_KEY');
      const subscription = await purchase(bound, 1);
      const keyId = await key(subscription);
      const first = await device();
      expect(await activate(first, bound, keyId)).toBeNull();
      expect(await close(await activationOf(first, bound), 'DEACTIVATED', true)).toBeNull();

      expect(await activate(await device(), bound, keyId)).toBeNull();
      expect(
        (await one<{ taken: string }>(`SELECT device_activation_occupied($1)::text AS taken`, [subscription])).taken,
      ).toBe('1');
    });

    it('closes a row with the day, the time and the cause together, and tells the license of a key only', async () => {
      const bound = await plan('DEVICE_KEY');
      const bundled = await plan('DEVICE_BUNDLED');
      const keyed = await device();
      const free = await device();
      await activate(keyed, bound, await key(await purchase(bound, 2)));
      await activate(free, bundled, null);

      expect(
        (
          await refusal(sql, `UPDATE device_activations SET deactivated_at = now() WHERE id = $1`, [
            await activationOf(keyed, bound),
          ])
        )?.constraint,
      ).toBe('device_activations_closed_complete');
      expect((await close(await activationOf(keyed, bound), 'DEACTIVATED', null))?.constraint).toBe(
        'device_activations_release',
      );
      expect((await close(await activationOf(keyed, bound), 'MOVED', false))?.constraint).toBe(
        'device_activations_release',
      );
      expect((await close(await activationOf(free, bundled), 'DEACTIVATED', true))?.constraint).toBe(
        'device_activations_release',
      );
      expect(await close(await activationOf(free, bundled), 'DEACTIVATED', null)).toBeNull();
    });

    it('does not tell who closed a row that is still open', async () => {
      const bundled = await plan('DEVICE_BUNDLED');
      const machine = await device();
      await activate(machine, bundled, null);

      const refused = await refusal(sql, `UPDATE device_activations SET closed_by_app_user_id = $2 WHERE id = $1`, [
        await activationOf(machine, bundled),
        user,
      ]);

      expect(refused?.constraint).toBe('device_activations_closed_complete');
    });

    it('never deletes a row, changes nothing of a closed one, and moves only the closing columns of an open one', async () => {
      const bound = await plan('DEVICE_KEY');
      const keyId = await key(await purchase(bound, 3));
      const machine = await device();
      await activate(machine, bound, keyId);
      const id = await activationOf(machine, bound);

      expect((await refusal(sql, `DELETE FROM device_activations WHERE id = $1`, [id]))?.constraint).toBe(
        'device_activations_kept',
      );
      expect(
        (await refusal(sql, `UPDATE device_activations SET over_activation_cap = true WHERE id = $1`, [id]))
          ?.constraint,
      ).toBe('device_activations_open_fixed');
      expect(
        (await refusal(sql, `UPDATE device_activations SET device_id = $2 WHERE id = $1`, [id, await device()]))
          ?.constraint,
      ).toBe('device_activations_open_fixed');
      expect(await close(id, 'DEACTIVATED', true)).toBeNull();
      expect(
        (
          await refusal(sql, `UPDATE device_activations SET closed_by_app_user_id = $2 WHERE id = $1`, [
            id,
            randomUUID(),
          ])
        )?.constraint,
      ).toBe('device_activations_closed_fixed');
      expect((await refusal(sql, `DELETE FROM device_activations WHERE id = $1`, [id]))?.constraint).toBe(
        'device_activations_kept',
      );
    });
  });

  describe('the cap of a key', () => {
    it('only goes up, and stays between 1 and 100000', async () => {
      const bound = await plan('DEVICE_KEY');
      const keyId = await key(await purchase(bound, 5));
      await sql.query(`UPDATE license_keys SET max_activations = 30 WHERE id = $1`, [keyId]);

      const down = await refusal(sql, `UPDATE license_keys SET max_activations = 1 WHERE id = $1`, [keyId]);

      expect(down).toMatchObject({ code: '55000', constraint: 'license_key_max_activations_raise_only' });
      expect(await refusal(sql, `UPDATE license_keys SET max_activations = 40 WHERE id = $1`, [keyId])).toBeNull();
      expect(
        (await refusal(sql, `UPDATE license_keys SET max_activations = 100001 WHERE id = $1`, [keyId]))?.constraint,
      ).toBe('license_keys_max_activations_range');
    });

    it('is one by default, and the count already used when the key was entered is written once', async () => {
      const bound = await plan('DEVICE_KEY');
      const keyId = await key(await purchase(bound, 5));

      expect(
        await one(`SELECT max_activations, initial_activations_used FROM license_keys WHERE id = $1`, [keyId]),
      ).toEqual({
        max_activations: 1,
        initial_activations_used: 0,
      });
      expect(
        (await refusal(sql, `UPDATE license_keys SET initial_activations_used = 3 WHERE id = $1`, [keyId]))?.constraint,
      ).toBe('license_key_columns_fixed');
    });
  });

  describe('a key of a plan bound to a machine is never given to a person', () => {
    const seatOn = async (planId: string, subscriptionId: string): Promise<string> => {
      const id = randomUUID();
      await sql.query(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
           normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
         VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, $4, $5, $6, $6, '2026-01-05', 'ACTUAL', $7)`,
        [id, org, planId, subscriptionId, employee, `${id}@x.vn`, user],
      );

      return id;
    };
    const give = (keyId: string, seat: string) =>
      refusal(sql, `UPDATE license_keys SET assignment_id = $2, status = 'ASSIGNED' WHERE id = $1`, [keyId, seat]);

    it('refuses the key of a purchase of a plan bound to a machine, and gives the key of a plan bound to an account as before', async () => {
      const machine = await plan('DEVICE_KEY');
      const machineSubscription = await purchase(machine, 5);
      const refused = await give(await key(machineSubscription), await seatOn(machine, machineSubscription));

      expect(refused).toMatchObject({ code: '23514', constraint: 'license_key_assignment_plan_account' });

      const account = await plan('ACCOUNT');
      const accountSubscription = await purchase(account, 5);

      expect(await give(await key(accountSubscription), await seatOn(account, accountSubscription))).toBeNull();
    });
  });
});
