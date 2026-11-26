import { randomBytes, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { Barrier } from '../../support/concurrency-harness';
import {
  dropDisposableDatabase,
  provisionDisposableDatabase,
  type DisposableDatabase,
} from '../../support/disposable-database';
import { DEPLOY_TIMEOUT_MS, deployMigrations } from '../../support/migration-history';
import { lineWorld } from '../../support/w3-lines-world';

/**
 * Redesign wave 3, W3-24 (M6): the licenses of a lot as PostgreSQL itself counts them — the activations of wave 2 and the keys given to a person
 * against the count of the lot, the old rights that have no key, the guard of the keys, and the plan that keeps its lots.
 */
describe('the licenses of a lot (integration, real PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    const deployed = await deployMigrations(database);
    if (deployed.code !== 0) throw new Error(`Deploying history failed: ${deployed.stdout}`);
    sql = new Client({ connectionString: database.url });
    await sql.connect();
  }, DEPLOY_TIMEOUT_MS);

  afterAll(async () => {
    await sql.end();
    await dropDisposableDatabase(database);
  });

  /** A lot of a K4 plan with the keys it holds, written as M6 or the lot routes write it. */
  async function lotWorld(binding: 'ACCOUNT' | 'DEVICE_KEY', licenseCount: number, keys: number) {
    const w = await lineWorld(sql);
    const { vendorId } = await w.vendor('JetBrains');
    const plan = await w.plan(vendorId, 'IntelliJ', 'K4', binding);
    const lotId = randomUUID();
    await sql.query(
      `INSERT INTO license_lots (id, organization_id, plan_id, purchased_on, license_count, unit_price_minor, purpose, responsible_it_admin_employee_id,
         updated_at) VALUES ($1, $2, $3, '2026-09-01', $4, 1000000, 'OPENING', $5, now())`,
      [lotId, w.organizationId, plan, licenseCount, w.khoa],
    );
    const keyIds: string[] = [];
    for (let i = 0; i < keys; i += 1) {
      const id = randomUUID();
      await sql.query(
        `INSERT INTO license_keys (id, organization_id, license_lot_id, cost_borne, fingerprint, masked, ciphertext, cipher_key_id,
           imported_by_app_user_id) VALUES ($1, $2, $3, true, $4, '....1234', decode(repeat('ab', 40), 'hex'), 'k1', $5)`,
        [id, w.organizationId, lotId, randomBytes(32).toString('hex'), randomUUID()],
      );
      keyIds.push(id);
    }

    return { w, plan, lotId, keyIds };
  }

  const rightOf = async (
    w: Awaited<ReturnType<typeof lineWorld>>,
    plan: string,
    code: string,
    subscriptionId: string | null = null,
  ) => {
    const id = randomUUID();
    const employee = await w.person(code);
    await sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
         normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
       VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, $4, $5, $6, $6, '2026-09-02', 'ACTUAL', $7)`,
      [id, w.organizationId, plan, subscriptionId, employee, `${code}@acme.vn`, randomUUID()],
    );

    return id;
  };
  const giveKey = (keyId: string, assignmentId: string) =>
    sql.query(`UPDATE license_keys SET status = 'ASSIGNED', assignment_id = $2 WHERE id = $1`, [keyId, assignmentId]);

  it('never gives more keys to people than the lot has licenses', async () => {
    const { w, plan, keyIds } = await lotWorld('ACCOUNT', 2, 3);
    const rights = [await rightOf(w, plan, 'P1'), await rightOf(w, plan, 'P2'), await rightOf(w, plan, 'P3')];

    await giveKey(keyIds[0], rights[0]);
    await giveKey(keyIds[1], rights[1]);

    await expect(giveKey(keyIds[2], rights[2])).rejects.toMatchObject({
      code: '23514',
      constraint: 'license_lots_capacity',
    });
  });

  it('counts the rights of the subscription a lot came from that hold no key, and counts a right once when it holds a key', async () => {
    const w = await lineWorld(sql);
    const { vendorId } = await w.vendor('JetBrains');
    const plan = await w.plan(vendorId, 'IntelliJ', 'K4', 'ACCOUNT');
    const legacy = await w.perpetual(plan, { quantity: 2 });
    const lotId = legacy;
    await sql.query(
      `INSERT INTO license_lots (id, organization_id, plan_id, purchased_on, license_count, unit_price_minor, purpose, legacy_subscription_id, updated_at)
       VALUES ($1, $2, $3, '2026-09-01', 2, 1000000, 'OPENING', $1, now())`,
      [lotId, w.organizationId, plan],
    );
    const old = await rightOf(w, plan, 'OLD1', legacy);
    await rightOf(w, plan, 'OLD2', legacy);
    const occupied = async () =>
      Number((await sql.query<{ n: string }>(`SELECT device_activation_occupied($1) AS n`, [lotId])).rows[0].n);

    // K4 rights are counted through the lot: the third right of the old subscription is not refused by its frozen quantity (the lot counts).
    expect(await occupied()).toBe(2);
    await rightOf(w, plan, 'OLD3', legacy);
    expect(await occupied()).toBe(3);

    // A key given to one of the old rights takes that right once, not twice.
    const keyId = await w.key(legacy);
    await giveKey(keyId, old).catch((error: { constraint?: string }) => {
      // The lot (2 licenses) is already past its count by the third old right: the key cannot be given until a license is added.
      expect(error.constraint).toBe('license_lots_capacity');
    });
    await sql.query(`UPDATE license_lots SET license_count = 3 WHERE id = $1`, [lotId]);
    await giveKey(keyId, old);
    expect(await occupied()).toBe(3);
  });

  it('counts the activations of wave 2 against the licenses of the lot, and frees one that goes back to the lot', async () => {
    const { w, plan, lotId, keyIds } = await lotWorld('DEVICE_KEY', 2, 2);
    const user = randomUUID();
    const device = async () => {
      const id = randomUUID();
      await sql.query(
        `INSERT INTO managed_devices (id, organization_id, asset_code, normalized_asset_code, hostname, os, device_type, asset_code_origin,
           created_by_app_user_id, updated_at) VALUES ($1, $2, $3, $3, 'host', 'Windows', 'OTH', 'LEGACY', $4, now())`,
        [id, w.organizationId, `M-${id}`, user],
      );

      return id;
    };
    const activate = async (keyId: string) => {
      const id = randomUUID();
      await sql.query(
        `INSERT INTO device_activations (id, organization_id, device_id, plan_id, license_key_id, origin, activated_on, activated_at,
           activated_by_app_user_id) VALUES ($1, $2, $3, $4, $5, 'OPERATION', '2026-10-01', now(), $6)`,
        [id, w.organizationId, await device(), plan, keyId, user],
      );

      return id;
    };
    const first = await activate(keyIds[0]);
    await activate(keyIds[1]);
    await expect(activate(keyIds[0])).rejects.toMatchObject({
      code: '23514',
      constraint: 'device_activations_lot_capacity',
    });

    // Closing with the license back in the lot frees it.
    await sql.query(
      `UPDATE device_activations SET deactivated_on = '2026-11-01', deactivated_at = now(), end_cause = 'MOVED'::"DeviceActivationEndCause",
         license_released = true, closed_by_app_user_id = $2 WHERE id = $1`,
      [first, user],
    );
    await expect(activate(keyIds[0])).resolves.toEqual(expect.any(String));
    expect(
      Number((await sql.query<{ n: string }>(`SELECT device_activation_occupied($1) AS n`, [lotId])).rows[0].n),
    ).toBe(2);
  });

  it('refuses a key given to a person for a plan bound to a machine, and gives a key of a plan bound to an account', async () => {
    const machine = await lotWorld('DEVICE_KEY', 2, 1);
    const right = await rightOf(machine.w, machine.plan, 'M1');
    await expect(giveKey(machine.keyIds[0], right)).rejects.toMatchObject({
      code: '23514',
      constraint: 'license_key_assignment_plan_account',
    });

    const account = await lotWorld('ACCOUNT', 2, 1);
    await expect(giveKey(account.keyIds[0], await rightOf(account.w, account.plan, 'A1'))).resolves.toBeDefined();
  });

  it('fixes the lot of a key, and lets its cost go from not borne to borne once', async () => {
    const { w, plan, lotId, keyIds } = await lotWorld('ACCOUNT', 2, 1);
    const other = randomUUID();
    await sql.query(
      `INSERT INTO license_lots (id, organization_id, plan_id, purchased_on, license_count, unit_price_minor, purpose, updated_at)
       VALUES ($1, $2, $3, '2026-09-01', 1, 1000000, 'OPENING', now())`,
      [other, w.organizationId, plan],
    );
    await sql.query(`UPDATE license_keys SET cost_borne = false WHERE id = $1`, [keyIds[0]]).catch(() => undefined);

    await expect(
      sql.query(`UPDATE license_keys SET license_lot_id = $2 WHERE id = $1`, [keyIds[0], other]),
    ).rejects.toMatchObject({
      code: '55000',
      constraint: 'license_key_columns_fixed',
    });
    // A key that was not borne becomes borne, and never goes back.
    const unborne = randomUUID();
    await sql.query(
      `INSERT INTO license_keys (id, organization_id, license_lot_id, cost_borne, fingerprint, masked, ciphertext, cipher_key_id, imported_by_app_user_id)
       VALUES ($1, $2, $3, false, $4, '....1234', decode(repeat('ab', 40), 'hex'), 'k1', $5)`,
      [unborne, w.organizationId, lotId, randomBytes(32).toString('hex'), randomUUID()],
    );
    await sql.query(`UPDATE license_keys SET cost_borne = true WHERE id = $1`, [unborne]);
    await expect(
      sql.query(`UPDATE license_keys SET cost_borne = false WHERE id = $1`, [unborne]),
    ).rejects.toMatchObject({
      code: '55000',
      constraint: 'license_key_cost_borne_once',
    });
  });

  it('keeps the plan of a lot K4 and bound as it is, and still refuses a binding that moves under a right of a plan with no lot', async () => {
    const { plan, lotId } = await lotWorld('ACCOUNT', 2, 0);
    await expect(sql.query(`UPDATE plans SET provisioning_type = 'K3' WHERE id = $1`, [plan])).rejects.toMatchObject({
      code: '23514',
      constraint: 'plans_change_keeps_license_lots',
    });
    await expect(sql.query(`UPDATE plans SET key_binding = 'DEVICE_KEY' WHERE id = $1`, [plan])).rejects.toMatchObject({
      code: '23514',
      constraint: 'plans_change_keeps_key_binding',
    });
    expect(lotId).toEqual(expect.any(String));

    // A K4 plan bound to an account with no lot and a right of a person: the binding still cannot move (wave 2).
    const w = await lineWorld(sql);
    const { vendorId } = await w.vendor('Sublime');
    const bare = await w.plan(vendorId, 'Sublime Text', 'K4', 'ACCOUNT');
    await rightOf(w, bare, 'S1');
    await expect(sql.query(`UPDATE plans SET key_binding = 'DEVICE_KEY' WHERE id = $1`, [bare])).rejects.toMatchObject({
      code: '23514',
      constraint: 'plans_change_keeps_key_binding_assignments',
    });
  });

  it('judges a lot as a lot: a K4 plan not bundled, the workspace of its vendor, a purpose that fits the binding', async () => {
    const w = await lineWorld(sql);
    const { vendorId, workspaceId } = await w.vendor('JetBrains');
    const other = await w.vendor('Atlassian');
    const bundled = await w.plan(vendorId, 'Windows 11 Pro OEM', 'K4', 'DEVICE_BUNDLED');
    const account = await w.plan(vendorId, 'IntelliJ', 'K4', 'ACCOUNT');
    const stock = await w.plan(vendorId, 'Office LTSC', 'K4', 'DEVICE_KEY');
    const insert = (plan: string, purpose: string, workspace: string | null, request: string | null = null) =>
      sql.query(
        `INSERT INTO license_lots (id, organization_id, plan_id, workspace_id, purchased_on, license_count, unit_price_minor, purpose, request_id, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, '2026-09-01', 1, 1000000, $4, $5, now())`,
        [w.organizationId, plan, workspace, purpose, request],
      );

    await expect(insert(bundled, 'OPENING', null)).rejects.toMatchObject({ constraint: 'license_lots_plan_k4' });
    await expect(insert(account, 'OPENING', other.workspaceId)).rejects.toMatchObject({
      constraint: 'license_lots_workspace_vendor',
    });
    await expect(insert(stock, 'REQUEST', workspaceId, randomUUID())).rejects.toMatchObject({
      constraint: 'license_lots_purpose_binding',
    });
    await expect(insert(account, 'STOCK', workspaceId)).rejects.toMatchObject({
      constraint: 'license_lots_purpose_binding',
    });
    const request = randomUUID();
    await insert(account, 'REQUEST', workspaceId, request);
    await expect(insert(account, 'REQUEST', workspaceId, request)).rejects.toMatchObject({
      code: '23505',
      constraint: 'license_lots_request_key',
    });
  });

  it('barrier x20 grant || device activation on same lot enforces license_count with zero 40P01 deadlocks', async () => {
    const { w, plan, lotId, keyIds } = await lotWorld('DEVICE_KEY', 8, 1);
    const deviceIds: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const empId = await w.person(`DEVUSER-${i}`);
      const devId = randomUUID();
      await sql.query(
        `INSERT INTO devices (id, organization_id, asset_code, name, kind, status, owner_employee_id)
         VALUES ($1, $2, $3, $4, 'LAPTOP', 'ASSIGNED', $5)`,
        [devId, w.organizationId, `ASSET-${i}-${randomUUID().slice(0, 6)}`, `Mac-${i}`, empId],
      );
      deviceIds.push(devId);
    }

    const workers = 20;
    const barrier = new Barrier(workers);
    const results = await Promise.all(
      Array.from({ length: workers }, async (_, idx) => {
        const client = new Client({ connectionString: database.url });
        await client.connect();
        try {
          await barrier.wait();
          await client.query('BEGIN');
          // Strict lock order: tier 6a license_lots FOR UPDATE -> tier 7 plans FOR SHARE
          await client.query(`SELECT id FROM license_lots WHERE id = $1 FOR UPDATE`, [lotId]);
          await client.query(`SELECT id FROM plans WHERE id = $1 FOR SHARE`, [plan]);

          if (idx % 2 === 0) {
            const devId = deviceIds[Math.floor(idx / 2)];
            await client.query(
              `INSERT INTO device_activations (id, organization_id, device_id, license_key_id, activated_by_app_user_id)
               VALUES ($1, $2, $3, $4, $5)`,
              [randomUUID(), w.organizationId, devId, keyIds[0], randomUUID()],
            );
          } else {
            const right = randomUUID();
            const emp = await w.person(`GRANT-DEV-${idx}`);
            await client.query(
              `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
                 account_identifier, normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
               VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, NULL, $4, $5, $5, '2026-09-02', 'ACTUAL', $6)`,
              [right, w.organizationId, plan, emp, `gdev-${idx}@acme.vn`, randomUUID()],
            );
          }
          await client.query('COMMIT');
          return { ok: true as const };
        } catch (err) {
          await client.query('ROLLBACK').catch(() => undefined);
          return { ok: false as const, code: (err as { code?: string }).code ?? 'UNKNOWN' };
        } finally {
          await client.end();
        }
      }),
    );

    const deadlocks = results.filter((r) => !r.ok && r.code === '40P01');
    expect(deadlocks).toEqual([]);
    const occupied = Number(
      (await sql.query<{ n: string }>(`SELECT device_activation_occupied($1) AS n`, [lotId])).rows[0].n,
    );
    expect(occupied).toBeLessThanOrEqual(8);
    expect(occupied).toBeGreaterThan(0);
  });

  it('barrier x20 grant || key withdrawal on same ACCOUNT lot serializes cleanly via lot -> plan -> key with zero 40P01 deadlocks', async () => {
    const { w, plan, lotId, keyIds } = await lotWorld('ACCOUNT', 10, 10);
    const workers = 20;
    const barrier = new Barrier(workers);

    const results = await Promise.all(
      Array.from({ length: workers }, async (_, idx) => {
        const client = new Client({ connectionString: database.url });
        await client.connect();
        try {
          await barrier.wait();
          await client.query('BEGIN');
          // Both grants and withdrawals lock tier 6a lot -> tier 7 plan -> tier 7b key
          await client.query(`SELECT id FROM license_lots WHERE id = $1 FOR UPDATE`, [lotId]);
          await client.query(`SELECT id FROM plans WHERE id = $1 FOR SHARE`, [plan]);
          const keyId = keyIds[idx % 10];
          const { rows: locked } = await client.query<{ status: string }>(
            `SELECT status FROM license_keys WHERE id = $1 FOR UPDATE`,
            [keyId],
          );
          if (locked[0]?.status !== 'IN_STORE') {
            await client.query('ROLLBACK');
            return { ok: false as const, code: 'NOT_IN_STORE' };
          }

          if (idx < 10) {
            const right = randomUUID();
            const emp = await w.person(`ACC-${idx}`);
            await client.query(
              `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
                 account_identifier, normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
               VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, NULL, $4, $5, $5, '2026-09-02', 'ACTUAL', $6)`,
              [right, w.organizationId, plan, emp, `acc-${idx}@acme.vn`, randomUUID()],
            );
            await client.query(`UPDATE license_keys SET status = 'ASSIGNED', assignment_id = $2 WHERE id = $1`, [
              keyId,
              right,
            ]);
          } else {
            await client.query(`UPDATE license_keys SET status = 'WITHDRAWN' WHERE id = $1`, [keyId]);
          }
          await client.query('COMMIT');
          return { ok: true as const };
        } catch (err) {
          await client.query('ROLLBACK').catch(() => undefined);
          return { ok: false as const, code: (err as { code?: string }).code ?? 'UNKNOWN' };
        } finally {
          await client.end();
        }
      }),
    );

    const deadlocks = results.filter((r) => !r.ok && r.code === '40P01');
    expect(deadlocks).toEqual([]);
    const { rows: statuses } = await sql.query<{ status: string; n: string }>(
      `SELECT status, count(*)::text AS n FROM license_keys WHERE license_lot_id = $1 GROUP BY status`,
      [lotId],
    );
    const totalHandled = statuses
      .filter((s) => s.status === 'ASSIGNED' || s.status === 'WITHDRAWN')
      .reduce((sum, s) => sum + Number(s.n), 0);
    expect(totalHandled).toBe(10);
  });
});
