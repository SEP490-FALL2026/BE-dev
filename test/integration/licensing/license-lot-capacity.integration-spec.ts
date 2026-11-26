import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { isCheckViolation } from '../../../src/infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../../src/infrastructure/security/tokens/access-token-verifier.port';
import { LicenseKeyAssignmentService } from '../../../src/modules/licensing/license-key/license-key-assignment.service';
import { LicenseKeyStateError } from '../../../src/modules/licensing/license-key/license-key.errors';
import { LicenseKeyService } from '../../../src/modules/licensing/license-key/license-key.service';
import { LicensingDeviceActivationApi } from '../../../src/modules/licensing/public/licensing-device-activation.api';
import {
  DeviceActivationKeyWithdrawnError,
  DeviceActivationLotFullError,
} from '../../../src/modules/licensing/public/licensing-device-activation.errors';
import { ProvisioningPlanBoundToDeviceError } from '../../../src/modules/licensing/public/licensing.errors';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import { declareApplication } from '../../support/builders/catalog.builder';
import { Barrier } from '../../support/concurrency-harness';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../../support/http-test-app';
import { lineWorld } from '../../support/w3-lines-world';

const isDeadlockError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '40P01';

/**
 * FIX-W3-FINAL F-19: verifies K4 license-lot DB capacity/guard invariants and proves lock order (`6a -> 7 -> 7b`)
 * via real `LicenseKeyAssignmentService.assign`, `LicenseKeyService.withdraw`, and `LicensingDeviceActivationApi.open`
 * over concurrent connections (`managed_devices`, `device_activations`, valid enums, zero `40P01`).
 */
describe('the licenses of a lot (integration, real PostgreSQL & real services, F-19)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let runner: TransactionRunner;
  let assignments: LicenseKeyAssignmentService;
  let licenseKeys: LicenseKeyService;
  let activations: LicensingDeviceActivationApi;
  let it1: ApiAccount;
  let seq = 0;

  const server = () => ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });
  const dataOf = <T>(res: request.Response): T => (res.body as { data: T }).data;
  const unique = (prefix: string): string => `${prefix}-${(seq += 1)}`;
  const itActor = (): AuthenticatedPrincipal => ({
    subject: it1.appUserId,
    appUserId: it1.appUserId,
    sessionId: randomUUID(),
    employeeId: it1.employeeId,
    directRoles: ['IT_ADMIN'],
    roles: ['IT_ADMIN'],
  });
  const actActor = () => ({
    kind: 'USER' as const,
    appUserId: it1.appUserId,
    employeeId: it1.employeeId,
    sessionId: randomUUID(),
  });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    runner = ctx.app.get(TransactionRunner);
    assignments = ctx.app.get(LicenseKeyAssignmentService, { strict: false });
    licenseKeys = ctx.app.get(LicenseKeyService, { strict: false });
    activations = ctx.app.get(LicensingDeviceActivationApi);
    seed = await seedInstallation(ctx.app);
    const admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-LOTIT', email: 'lotit@acme.vn', role: 'IT_ADMIN', admin });
  }, 180_000);

  afterAll(async () => {
    await ctx?.close();
  });

  async function createLotWithKeys(binding: 'ACCOUNT' | 'DEVICE_KEY', licenseCount: number, keysCount: number) {
    const applicationId = await declareApplication(ctx, it1.accessToken, {
      name: unique('LotApp'),
      kind: 'LICENSED',
      vendorName: unique('LotVendor'),
      dataSensitivity: 'LOW',
    });
    const planId = dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/plans')
        .set(as(it1))
        .send({
          applicationId,
          name: unique('LotPlan'),
          provisioningType: 'K4',
          controlLevel: 'FULL',
          keyBinding: binding,
        })
        .expect(201),
    ).id;
    const lotId = dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/license-lots')
        .set(as(it1))
        .send({
          planId,
          purchasedOn: '2026-09-01',
          licenseCount,
          unitPrice: { amount: '1000000', currency: 'VND' },
          purpose: 'STOCK',
        })
        .expect(201),
    ).id;
    if (keysCount > 0) {
      const keys = Array.from(
        { length: keysCount },
        () => `KEY-${randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`,
      );
      await request(server()).post(`/api/v1/license-lots/${lotId}/keys`).set(as(it1)).send({ keys }).expect(201);
    }
    const { rows } = await ctx.sql.query<{ id: string }>(
      `SELECT id FROM license_keys WHERE license_lot_id = $1 ORDER BY imported_at, id`,
      [lotId],
    );

    return { planId, lotId, keyIds: rows.map((r) => r.id) };
  }

  async function createEmployee(code: string): Promise<string> {
    const id = randomUUID();
    await ctx.sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       VALUES ($1, $2, $3, $3, 'STAFF', '2026-01-01', now())`,
      [id, seed.organizationId, unique(code)],
    );

    return id;
  }

  async function createAssignment(planId: string, code: string, subscriptionId: string | null = null): Promise<string> {
    const id = randomUUID();
    const empId = await createEmployee(code);
    const identifier = `${unique(code).toLowerCase()}@acme.vn`;
    await ctx.sql.query(
      `INSERT INTO license_assignments
         (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
          normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
       VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, $4, $5, $6, $6, '2026-09-02', 'ACTUAL', $7)`,
      [id, seed.organizationId, planId, subscriptionId, empId, identifier, it1.appUserId],
    );

    return id;
  }

  async function createDevice(type: 'LAP' | 'PC' = 'LAP'): Promise<string> {
    return dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/devices')
        .set(as(it1))
        .send({ deviceType: type, hostname: unique('LOT-HOST'), os: 'Windows 11' })
        .expect(201),
    ).id;
  }

  it('never assigns more keys via LicenseKeyAssignmentService than the lot has licenses', async () => {
    const { planId, lotId, keyIds } = await createLotWithKeys('ACCOUNT', 2, 2);
    const extraKeyId = randomUUID();
    await ctx.sql.query(
      `INSERT INTO license_keys
         (id, organization_id, license_lot_id, cost_borne, fingerprint, masked, ciphertext, cipher_key_id, imported_by_app_user_id)
       VALUES ($1, $2, $3, true, $4, '....9999', decode(repeat('ab', 40), 'hex'), 'k1', $5)`,
      [extraKeyId, seed.organizationId, lotId, randomBytes(32).toString('hex'), it1.appUserId],
    );
    const r0 = await createAssignment(planId, 'CAP1');
    const r1 = await createAssignment(planId, 'CAP2');
    const r2 = await createAssignment(planId, 'CAP3');

    await runner.run((tx) =>
      assignments.assign(tx, itActor(), {
        organizationId: seed.organizationId,
        licenseKeyId: keyIds[0],
        assignmentId: r0,
        subscriptionId: null,
        licenseLotId: lotId,
      }),
    );
    await runner.run((tx) =>
      assignments.assign(tx, itActor(), {
        organizationId: seed.organizationId,
        licenseKeyId: keyIds[1],
        assignmentId: r1,
        subscriptionId: null,
        licenseLotId: lotId,
      }),
    );

    const overAssignError = await runner
      .run((tx) =>
        assignments.assign(tx, itActor(), {
          organizationId: seed.organizationId,
          licenseKeyId: extraKeyId,
          assignmentId: r2,
          subscriptionId: null,
          licenseLotId: lotId,
        }),
      )
      .catch((error: unknown) => error);
    expect(isCheckViolation(overAssignError, 'license_lots_capacity')).toBe(true);
  });

  it('counts unkeyed legacy assignments once and keyed assignments once against device_activation_occupied', async () => {
    const w = await lineWorld(ctx.sql);
    const { vendorId } = await w.vendor('JetBrains');
    const plan = await w.plan(vendorId, 'IntelliJ', 'K4', 'ACCOUNT');
    const legacy = await w.perpetual(plan, { quantity: 2 });
    await ctx.sql.query(
      `INSERT INTO license_lots (id, organization_id, plan_id, purchased_on, license_count, unit_price_minor, purpose, legacy_subscription_id, updated_at)
       VALUES ($1, $2, $3, '2026-09-01', 2, 1000000, 'OPENING', $1, now())
       ON CONFLICT (id) DO UPDATE SET license_count = 2, unit_price_minor = 1000000, updated_at = now()`,
      [legacy, w.organizationId, plan],
    );
    const old = await createAssignment(plan, 'OLD1', legacy);
    await createAssignment(plan, 'OLD2', legacy);
    const occupied = async () =>
      Number((await ctx.sql.query<{ n: string }>(`SELECT device_activation_occupied($1) AS n`, [legacy])).rows[0].n);

    expect(await occupied()).toBe(2);
    await createAssignment(plan, 'OLD3', legacy);
    expect(await occupied()).toBe(3);

    const keyId = await w.key(legacy);
    const legacyOverCapError = await runner
      .run((tx) =>
        assignments.assign(tx, itActor(), {
          organizationId: w.organizationId,
          licenseKeyId: keyId,
          assignmentId: old,
          subscriptionId: legacy,
          licenseLotId: legacy,
        }),
      )
      .catch((error: unknown) => error);
    expect(isCheckViolation(legacyOverCapError, 'license_lots_capacity')).toBe(true);
    await ctx.sql.query(`UPDATE license_lots SET license_count = 3 WHERE id = $1`, [legacy]);
    await runner.run((tx) =>
      assignments.assign(tx, itActor(), {
        organizationId: w.organizationId,
        licenseKeyId: keyId,
        assignmentId: old,
        subscriptionId: legacy,
        licenseLotId: legacy,
      }),
    );
    expect(await occupied()).toBe(3);
  });

  it('counts device activations via LicensingDeviceActivationApi.open and frees one closed with license_released = true', async () => {
    const { planId, lotId, keyIds } = await createLotWithKeys('DEVICE_KEY', 2, 2);
    const [d1, d2, d3] = await Promise.all([createDevice(), createDevice(), createDevice()]);

    const first = await runner.run((tx) =>
      activations.open(tx, {
        organizationId: seed.organizationId,
        deviceId: d1,
        planId,
        licenseKeyId: keyIds[0],
        origin: 'OPERATION',
        on: '2026-10-01',
        by: actActor(),
      }),
    );
    await runner.run((tx) =>
      activations.open(tx, {
        organizationId: seed.organizationId,
        deviceId: d2,
        planId,
        licenseKeyId: keyIds[1],
        origin: 'OPERATION',
        on: '2026-10-01',
        by: actActor(),
      }),
    );
    await expect(
      runner.run((tx) =>
        activations.open(tx, {
          organizationId: seed.organizationId,
          deviceId: d3,
          planId,
          licenseKeyId: keyIds[0],
          origin: 'OPERATION',
          on: '2026-10-01',
          by: actActor(),
        }),
      ),
    ).rejects.toBeInstanceOf(DeviceActivationLotFullError);

    await ctx.sql.query(
      `UPDATE device_activations
          SET deactivated_on = '2026-11-01', deactivated_at = now(), end_cause = 'MOVED'::"DeviceActivationEndCause",
              license_released = true, closed_by_app_user_id = $2
        WHERE id = $1`,
      [first.activation.id, it1.appUserId],
    );
    await expect(
      runner.run((tx) =>
        activations.open(tx, {
          organizationId: seed.organizationId,
          deviceId: d3,
          planId,
          licenseKeyId: keyIds[0],
          origin: 'OPERATION',
          on: '2026-11-02',
          by: actActor(),
        }),
      ),
    ).resolves.toMatchObject({ activation: { deviceId: d3 } });
    expect(
      Number((await ctx.sql.query<{ n: string }>(`SELECT device_activation_occupied($1) AS n`, [lotId])).rows[0].n),
    ).toBe(2);
  });

  it('refuses assigning a DEVICE_KEY lot key to a personal right (ProvisioningPlanBoundToDeviceError) and keeps DB triggers intact', async () => {
    const machine = await createLotWithKeys('DEVICE_KEY', 2, 1);
    const machineRight = await createAssignment(machine.planId, 'DEV-ACC');
    await expect(
      runner.run((tx) =>
        assignments.assign(tx, itActor(), {
          organizationId: seed.organizationId,
          licenseKeyId: machine.keyIds[0],
          assignmentId: machineRight,
          subscriptionId: null,
          licenseLotId: machine.lotId,
        }),
      ),
    ).rejects.toBeInstanceOf(ProvisioningPlanBoundToDeviceError);

    const account = await createLotWithKeys('ACCOUNT', 2, 1);
    const otherLotId = randomUUID();
    await ctx.sql.query(
      `INSERT INTO license_lots (id, organization_id, plan_id, purchased_on, license_count, unit_price_minor, purpose, updated_at)
       VALUES ($1, $2, $3, '2026-09-01', 1, 1000000, 'OPENING', now())`,
      [otherLotId, seed.organizationId, account.planId],
    );
    await expect(
      ctx.sql.query(`UPDATE license_keys SET license_lot_id = $2 WHERE id = $1`, [account.keyIds[0], otherLotId]),
    ).rejects.toMatchObject({ code: '55000', constraint: 'license_key_columns_fixed' });
    await expect(
      ctx.sql.query(`UPDATE license_lots SET purpose = 'REQUEST', request_id = $2 WHERE id = $1`, [
        machine.lotId,
        randomUUID(),
      ]),
    ).rejects.toMatchObject({ constraint: 'license_lots_purpose_binding' });
    // T-9: STOCK is valid for ACCOUNT K4 plans.
    await expect(
      ctx.sql.query(
        `INSERT INTO license_lots (id, organization_id, plan_id, purchased_on, license_count, unit_price_minor, purpose, updated_at)
         VALUES (gen_random_uuid(), $1, $2, '2026-09-01', 1, 1000000, 'STOCK', now())`,
        [seed.organizationId, account.planId],
      ),
    ).resolves.toBeDefined();
  });

  it('barrier x20: LicensingDeviceActivationApi.open || LicenseKeyService.withdraw on same DEVICE_KEY lot proves lock order with zero 40P01', async () => {
    const { planId, keyIds } = await createLotWithKeys('DEVICE_KEY', 25, 20);
    const devices = await Promise.all(Array.from({ length: 20 }, () => createDevice('PC')));

    for (let i = 0; i < 20; i += 1) {
      const barrier = new Barrier(2);
      const keyId = keyIds[i];
      const deviceId = devices[i];

      const activateTask = (async () => {
        await barrier.wait();
        return runner.run((tx) =>
          activations.open(tx, {
            organizationId: seed.organizationId,
            deviceId,
            planId,
            licenseKeyId: keyId,
            origin: 'OPERATION',
            on: '2026-10-10',
            by: actActor(),
          }),
        );
      })();
      const withdrawTask = (async () => {
        await barrier.wait();
        return licenseKeys.withdraw(itActor(), keyId, { reason: 'Retire device key' });
      })();

      const [actOutcome, withdrawOutcome] = await Promise.allSettled([activateTask, withdrawTask]);
      if (actOutcome.status === 'rejected') {
        expect(isDeadlockError(actOutcome.reason)).toBe(false);
        expect(actOutcome.reason).toBeInstanceOf(DeviceActivationKeyWithdrawnError);
      }
      if (withdrawOutcome.status === 'rejected') {
        expect(isDeadlockError(withdrawOutcome.reason)).toBe(false);
      }
      expect(withdrawOutcome.status).toBe('fulfilled');
    }
  });

  it('barrier x20: LicenseKeyAssignmentService.assign || LicenseKeyService.withdraw on same ACCOUNT lot serializes via lot -> plan -> key with zero 40P01', async () => {
    const { planId, lotId, keyIds } = await createLotWithKeys('ACCOUNT', 25, 20);
    const rightIds = await Promise.all(Array.from({ length: 20 }, (_, i) => createAssignment(planId, `BACC-${i}`)));

    for (let i = 0; i < 20; i += 1) {
      const barrier = new Barrier(2);
      const keyId = keyIds[i];
      const assignmentId = rightIds[i];

      const assignTask = (async () => {
        await barrier.wait();
        return runner.run((tx) =>
          assignments.assign(tx, itActor(), {
            organizationId: seed.organizationId,
            licenseKeyId: keyId,
            assignmentId,
            subscriptionId: null,
            licenseLotId: lotId,
          }),
        );
      })();
      const withdrawTask = (async () => {
        await barrier.wait();
        return licenseKeys.withdraw(itActor(), keyId, { reason: 'Damaged key' });
      })();

      const [assignOutcome, withdrawOutcome] = await Promise.allSettled([assignTask, withdrawTask]);
      if (assignOutcome.status === 'rejected') {
        expect(isDeadlockError(assignOutcome.reason)).toBe(false);
        expect(assignOutcome.reason).toBeInstanceOf(LicenseKeyStateError);
      }
      if (withdrawOutcome.status === 'rejected') {
        expect(isDeadlockError(withdrawOutcome.reason)).toBe(false);
        expect(withdrawOutcome.reason).toBeInstanceOf(LicenseKeyStateError);
      }
      const wonCount = [assignOutcome, withdrawOutcome].filter((r) => r.status === 'fulfilled').length;
      expect(wonCount).toBe(1);

      const { rows } = await ctx.sql.query<{ status: string; withdrawn_at: Date | null }>(
        `SELECT status::text, withdrawn_at FROM license_keys WHERE id = $1`,
        [keyId],
      );
      expect(['ASSIGNED', 'IN_STORE']).toContain(rows[0].status);
      if (rows[0].status === 'ASSIGNED') expect(rows[0].withdrawn_at).toBeNull();
      else expect(rows[0].withdrawn_at).not.toBeNull();
    }
  });
});
