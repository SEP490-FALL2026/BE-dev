import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { PrismaService } from '../../../src/infrastructure/database/prisma.service';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../src/infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../../src/modules/audit/public/audit.api';
import type { AuditEventInput } from '../../../src/modules/audit/public/audit.types';
import {
  DeviceNotEditableError,
  DeviceSerialNumberTakenError,
  DeviceStaleError,
  DeviceUpdateEmptyError,
} from '../../../src/modules/devices/attributes/device-attributes.errors';
import { toDeviceAttributesApiException } from '../../../src/modules/devices/attributes/device-attributes.http-errors';
import { DeviceAttributesRepo } from '../../../src/modules/devices/attributes/device-attributes.repo';
import { DeviceAttributesService } from '../../../src/modules/devices/attributes/device-attributes.service';
import { EmployeeNotStartedError } from '../../../src/modules/organization/public/organization.errors';
import { DeviceNotFoundError, DeviceNotInChargeError } from '../../../src/modules/devices/public/devices.errors';
import type { IdentityAccessApi } from '../../../src/modules/identity-access/public/identity-access.api';
import type { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';
import { unplacedWorkKey } from '../../../src/modules/organization/public/organization.types';
import { Barrier } from '../../support/concurrency-harness';
import {
  type DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';
import { testConfig } from '../../support/test-config';

/**
 * Redesign wave 2, W2-04: the correction of what a person entered wrong on a machine, on a real PostgreSQL. The route is not mounted yet (the
 * module that owns it registers it), so the service is driven directly; the HTTP answers are the business of the mapper and are covered once
 * the route exists.
 */
describe('the correction of the attributes of a machine (integration, real PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let prisma: PrismaService;
  let service: DeviceAttributesService;
  let holderDept: Map<string, string>;
  let unplacedDesignees: Map<string, string>;
  let notStarted: Set<string>;
  let actingByDepartment: Map<string, { inCharge: string | null; substitute: string | null; actors: string[] }>;
  const events: AuditEventInput[] = [];
  const org = randomUUID();
  const actor = {
    appUserId: randomUUID(),
    roles: ['IT_ADMIN'],
    employeeId: randomUUID(),
  } as unknown as AuthenticatedPrincipal;

  const insertDevice = async (
    assetCode: string,
    over: { serial?: string | null; type?: string; retired?: boolean; voided?: boolean } = {},
  ) => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO managed_devices (id, organization_id, asset_code, normalized_asset_code, hostname, os, device_type, asset_code_origin,
         serial_number, normalized_serial_number, created_by_app_user_id, updated_at)
       VALUES ($1, $2, $3, lower($3), 'LT-0004', 'Windows 11', $4::"DeviceType", 'GENERATED', $5, lower($5), $6, now())`,
      [id, org, assetCode, over.type ?? 'PC', over.serial ?? null, randomUUID()],
    );
    if (over.retired) {
      await sql.query(
        `UPDATE managed_devices SET retired_at = now(), retirement_reason = 'Sold', retirement_kind = 'DISPOSED' WHERE id = $1`,
        [id],
      );
    }
    if (over.voided) {
      await sql.query(
        `UPDATE managed_devices SET voided_at = now(), void_reason = 'Typed twice', voided_by_app_user_id = $2 WHERE id = $1`,
        [id, randomUUID()],
      );
    }

    return id;
  };
  const versionOf = async (id: string): Promise<Date> =>
    (await sql.query<{ updated_at: Date }>(`SELECT updated_at FROM managed_devices WHERE id = $1`, [id])).rows[0]
      .updated_at;
  const rowOf = async (id: string) =>
    (
      await sql.query<{
        asset_code: string;
        device_type: string;
        serial_number: string | null;
        normalized_serial_number: string | null;
      }>(
        `SELECT asset_code, device_type::text, serial_number, normalized_serial_number FROM managed_devices WHERE id = $1`,
        [id],
      )
    ).rows[0];

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    const config = testConfig({ DATABASE_URL: database.url });
    prisma = new PrismaService(config);
    const audit = {
      record: (_tx: unknown, event: AuditEventInput) => {
        events.push(event);

        return Promise.resolve();
      },
    } as unknown as AuditApi;
    actingByDepartment = new Map();
    holderDept = new Map();
    unplacedDesignees = new Map();
    notStarted = new Set();
    const usable = new Set<string>();
    const organizationReads = {
      getOrganization: () => Promise.resolve({ id: org }),
      businessToday: () => Promise.resolve('2026-11-24'),
      workDepartmentsOf: (ids: readonly string[]) =>
        Promise.resolve(new Map(ids.flatMap((id) => (holderDept.has(id) ? [[id, holderDept.get(id)!]] : [])))),
      itAdminsActingFor: (deptIds: readonly string[]) =>
        Promise.resolve(
          new Map(deptIds.flatMap((d) => (actingByDepartment.has(d) ? [[d, actingByDepartment.get(d)!]] : []))),
        ),
      notStartedAmong: (ids: readonly string[]) => Promise.resolve(new Set(ids.filter((id) => notStarted.has(id)))),
      itAdminsActingForUnplacedWork: (refs: readonly { workKind: 'DEVICE' | 'DEVICE_RETURN_TASK'; workId: string }[]) =>
        Promise.resolve(
          new Map(
            refs.flatMap((ref) => {
              const key = unplacedWorkKey(ref.workKind, ref.workId);
              return unplacedDesignees.has(key) ? [[key, unplacedDesignees.get(key)!]] : [];
            }),
          ),
        ),
    } as unknown as OrganizationReadApi;
    const identity = {
      findUsableItAdminEmployeeIds: () => Promise.resolve(usable),
    } as unknown as IdentityAccessApi;
    service = new DeviceAttributesService(
      new DeviceAttributesRepo(),
      organizationReads,
      audit,
      new TransactionRunner(prisma, config),
      identity,
    );
    await sql.query(
      `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
      [org],
    );
  }, 240000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  beforeEach(() => {
    events.length = 0;
  });

  it('changes the kind of a machine from PC to LAP and keeps its asset code, with the new version in the answer', async () => {
    const id = await insertDevice('PC-26-0004');
    const read = await versionOf(id);

    const view = await service.change(actor, id, { expectedUpdatedAt: read, deviceType: 'LAP' });

    expect(view).toMatchObject({
      id,
      assetCode: 'PC-26-0004',
      deviceType: 'LAP',
      hostname: 'LT-0004',
      os: 'Windows 11',
    });
    expect(view.updatedAt.getTime()).toBeGreaterThan(read.getTime());
    expect((await rowOf(id)).asset_code).toBe('PC-26-0004');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'DEVICE.UPDATED',
      resourceType: 'ManagedDevice',
      resourceId: id,
      before: { deviceType: 'PC' },
      after: { deviceType: 'LAP' },
    });
  });

  it('refuses a correction made on a version that is no longer the machine, and says the current one', async () => {
    const id = await insertDevice('PC-26-0005');
    const stale = await versionOf(id);
    await service.change(actor, id, { expectedUpdatedAt: stale, hostname: 'LT-0099' });

    const refused = service.change(actor, id, { expectedUpdatedAt: stale, hostname: 'LT-0100' });

    await expect(refused).rejects.toBeInstanceOf(DeviceStaleError);
    await expect(refused).rejects.toMatchObject({ currentUpdatedAt: await versionOf(id) });
    expect(events).toHaveLength(1);
  });

  it('refuses an update that names nothing but the version', async () => {
    const id = await insertDevice('PC-26-0006');

    await expect(service.change(actor, id, { expectedUpdatedAt: await versionOf(id) })).rejects.toBeInstanceOf(
      DeviceUpdateEmptyError,
    );
  });

  it('writes and audits nothing when the correction changes nothing, and leaves the version as it was', async () => {
    const id = await insertDevice('PC-26-0007');
    const read = await versionOf(id);

    const view = await service.change(actor, id, { expectedUpdatedAt: read, hostname: 'LT-0004', deviceType: 'PC' });

    expect(view.updatedAt.getTime()).toBe(read.getTime());
    expect((await versionOf(id)).getTime()).toBe(read.getTime());
    expect(events).toEqual([]);
  });

  it('sets the serial number with its search key, takes it away with null, and refuses one that another machine has, whatever its case', async () => {
    const first = await insertDevice('PC-26-0008');
    const second = await insertDevice('PC-26-0009');
    await service.change(actor, first, { expectedUpdatedAt: await versionOf(first), serialNumber: 'SN-ABC-1' });
    expect(await rowOf(first)).toMatchObject({ serial_number: 'SN-ABC-1', normalized_serial_number: 'sn-abc-1' });

    await expect(
      service.change(actor, second, { expectedUpdatedAt: await versionOf(second), serialNumber: 'sn-abc-1' }),
    ).rejects.toBeInstanceOf(DeviceSerialNumberTakenError);

    await service.change(actor, first, { expectedUpdatedAt: await versionOf(first), serialNumber: null });
    expect(await rowOf(first)).toMatchObject({ serial_number: null, normalized_serial_number: null });
    await service.change(actor, second, { expectedUpdatedAt: await versionOf(second), serialNumber: 'sn-abc-1' });
    expect(await rowOf(second)).toMatchObject({ serial_number: 'sn-abc-1' });
  });

  it('does not correct a machine taken out of use or a record that was voided, nor one that is not in the register', async () => {
    const retired = await insertDevice('PC-26-0010', { retired: true });
    const voided = await insertDevice('PC-26-0011', { voided: true });

    await expect(
      service.change(actor, retired, { expectedUpdatedAt: await versionOf(retired), hostname: 'x' }),
    ).rejects.toMatchObject({ reason: 'RETIRED' });
    await expect(
      service.change(actor, voided, { expectedUpdatedAt: await versionOf(voided), hostname: 'x' }),
    ).rejects.toBeInstanceOf(DeviceNotEditableError);
    await expect(
      service.change(actor, randomUUID(), { expectedUpdatedAt: new Date(), hostname: 'x' }),
    ).rejects.toBeInstanceOf(DeviceNotFoundError);
  });

  it('lets exactly one of two corrections made at once on the same version through, and tells the other it is stale (20 rounds)', async () => {
    for (let round = 0; round < 20; round += 1) {
      const id = await insertDevice(`PC-27-${String(round).padStart(4, '0')}`);
      const read = await versionOf(id);
      const barrier = new Barrier(2);
      const correct = async (hostname: string) => {
        await barrier.wait();

        return service.change(actor, id, { expectedUpdatedAt: read, hostname });
      };

      const outcomes = await Promise.allSettled([correct('LT-A'), correct('LT-B')]);

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      const rejected = outcomes.find((outcome) => outcome.status === 'rejected') as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(DeviceStaleError);
    }
  }, 120000);

  it('allows any IT Admin when in stock, and restricts assigned devices to in-charge or substitute IT Admin', async () => {
    const devId = await insertDevice('PC-26-0099');
    const holderId = randomUUID();
    const deptId = randomUUID();
    const itInChargeId = randomUUID();
    const itSubId = randomUUID();
    const itOtherId = randomUUID();
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, work_email, normalized_work_email, employment_type, hire_date, updated_at)
       VALUES ($1, $2, 'E-ATTR-H', 'Attr Holder', 'attr-h@acme.vn', 'attr-h@acme.vn', 'STAFF', '2025-01-01', now())`,
      [holderId, org],
    );
    await sql.query(
      `INSERT INTO device_registrations (id, organization_id, device_id, holder_employee_id, valid_from, created_by_app_user_id)
       VALUES (gen_random_uuid(), $1, $2, $3, '2026-11-24', $4)`,
      [org, devId, holderId, randomUUID()],
    );
    holderDept.set(holderId, deptId);
    actingByDepartment.set(deptId, { inCharge: itInChargeId, substitute: itSubId, actors: [itInChargeId, itSubId] });

    await expect(
      service.change(
        { appUserId: randomUUID(), employeeId: itOtherId, roles: ['IT_ADMIN'] } as unknown as AuthenticatedPrincipal,
        devId,
        { expectedUpdatedAt: await versionOf(devId), hostname: 'BLOCKED' },
      ),
    ).rejects.toBeInstanceOf(DeviceNotInChargeError);

    const updated = await service.change(
      { appUserId: randomUUID(), employeeId: itSubId, roles: ['IT_ADMIN'] } as unknown as AuthenticatedPrincipal,
      devId,
      { expectedUpdatedAt: await versionOf(devId), hostname: 'SUB-OK' },
    );
    expect(updated.hostname).toBe('SUB-OK');
    expect(events[0].after).toEqual({ hostname: 'SUB-OK', bySubstitute: true });
    holderDept.delete(holderId);
    actingByDepartment.delete(deptId);
  });

  describe('a machine whose holder has no department yet', () => {
    const employeeOf = async (code: string) => {
      const id = randomUUID();
      await sql.query(
        `INSERT INTO employees (id, organization_id, employee_code, full_name, work_email, normalized_work_email, employment_type, hire_date, updated_at)
         VALUES ($1, $2, $3, 'Unplaced Holder', $4, $4, 'STAFF', '2025-01-01', now())`,
        [id, org, code, `${code.toLowerCase()}@acme.vn`],
      );

      return id;
    };
    const asIt = (employeeId: string) =>
      ({ appUserId: randomUUID(), employeeId, roles: ['IT_ADMIN'] }) as unknown as AuthenticatedPrincipal;

    it('lets the IT Admin appointed for the device correct it and refuses any other IT Admin with DEVICE.NOT_IN_CHARGE', async () => {
      const devId = await insertDevice('PC-26-0120');
      const holderId = await employeeOf('E-ATTR-U1');
      const designee = randomUUID();
      await sql.query(
        `INSERT INTO device_registrations (id, organization_id, device_id, holder_employee_id, valid_from, created_by_app_user_id)
         VALUES (gen_random_uuid(), $1, $2, $3, '2026-11-24', $4)`,
        [org, devId, holderId, randomUUID()],
      );
      unplacedDesignees.set(unplacedWorkKey('DEVICE', devId), designee);

      const refused = service.change(asIt(randomUUID()), devId, {
        expectedUpdatedAt: await versionOf(devId),
        hostname: 'BLOCKED',
      });
      await expect(refused).rejects.toBeInstanceOf(DeviceNotInChargeError);
      expect(toDeviceAttributesApiException(await refused.catch((error: Error) => error))).toMatchObject({
        response: { code: 'DEVICE.NOT_IN_CHARGE' },
      });

      const updated = await service.change(asIt(designee), devId, {
        expectedUpdatedAt: await versionOf(devId),
        hostname: 'APPOINTED-OK',
      });
      expect(updated.hostname).toBe('APPOINTED-OK');
      expect(events.at(-1)?.after).toEqual({ hostname: 'APPOINTED-OK', bySubstitute: true });
    });

    it('answers EMPLOYEE.NOT_STARTED, not DEVICE.NOT_IN_CHARGE, when the holder has only a future placement', async () => {
      const devId = await insertDevice('PC-26-0122');
      const holderId = await employeeOf('E-ATTR-U3');
      await sql.query(
        `INSERT INTO device_registrations (id, organization_id, device_id, holder_employee_id, valid_from, created_by_app_user_id)
         VALUES (gen_random_uuid(), $1, $2, $3, '2026-11-24', $4)`,
        [org, devId, holderId, randomUUID()],
      );
      notStarted.add(holderId);

      const refused = service.change(asIt(randomUUID()), devId, {
        expectedUpdatedAt: await versionOf(devId),
        hostname: 'BLOCKED',
      });

      await expect(refused).rejects.toBeInstanceOf(EmployeeNotStartedError);
      expect(toDeviceAttributesApiException(await refused.catch((error: Error) => error))).toMatchObject({
        response: { code: 'EMPLOYEE.NOT_STARTED' },
      });
      notStarted.delete(holderId);
    });

    it('refuses the person who is leaving with the machine awaiting return of their own, whoever is in charge', async () => {
      const devId = await insertDevice('PC-26-0123');
      const holderId = await employeeOf('E-ATTR-U4');
      const deptId = randomUUID();
      const registrationId = randomUUID();
      await sql.query(
        `INSERT INTO device_registrations (id, organization_id, device_id, holder_employee_id, valid_from, created_by_app_user_id)
         VALUES ($1, $2, $3, $4, '2026-11-24', $5)`,
        [registrationId, org, devId, holderId, randomUUID()],
      );
      await sql.query(
        `INSERT INTO device_return_tasks (id, organization_id, device_id, registration_id, employee_id, offboarding_case_id, department_id, due_on)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, gen_random_uuid(), $5, '2026-12-01')`,
        [org, devId, registrationId, holderId, deptId],
      );
      actingByDepartment.set(deptId, { inCharge: holderId, substitute: null, actors: [holderId] });

      const refused = service.change(asIt(holderId), devId, {
        expectedUpdatedAt: await versionOf(devId),
        hostname: 'BLOCKED',
      });

      await expect(refused).rejects.toBeInstanceOf(DeviceNotInChargeError);
      expect(toDeviceAttributesApiException(await refused.catch((error: Error) => error))).toMatchObject({
        response: { code: 'DEVICE.NOT_IN_CHARGE' },
      });
      actingByDepartment.delete(deptId);
    });

    it('reads the appointment of the open return task when the machine awaits return, not the one of the device', async () => {
      const devId = await insertDevice('PC-26-0121');
      const holderId = await employeeOf('E-ATTR-U2');
      const registrationId = randomUUID();
      const taskId = randomUUID();
      const designee = randomUUID();
      await sql.query(
        `INSERT INTO device_registrations (id, organization_id, device_id, holder_employee_id, valid_from, created_by_app_user_id)
         VALUES ($1, $2, $3, $4, '2026-11-24', $5)`,
        [registrationId, org, devId, holderId, randomUUID()],
      );
      await sql.query(
        `INSERT INTO device_return_tasks (id, organization_id, device_id, registration_id, employee_id, offboarding_case_id, due_on)
         VALUES ($1, $2, $3, $4, $5, gen_random_uuid(), '2026-12-01')`,
        [taskId, org, devId, registrationId, holderId],
      );
      unplacedDesignees.set(unplacedWorkKey('DEVICE', devId), designee);

      await expect(
        service.change(asIt(designee), devId, { expectedUpdatedAt: await versionOf(devId), hostname: 'WRONG-KIND' }),
      ).rejects.toBeInstanceOf(DeviceNotInChargeError);

      unplacedDesignees.set(unplacedWorkKey('DEVICE_RETURN_TASK', taskId), designee);
      const updated = await service.change(asIt(designee), devId, {
        expectedUpdatedAt: await versionOf(devId),
        hostname: 'TASK-OK',
      });
      expect(updated.hostname).toBe('TASK-OK');
    });
  });
});
