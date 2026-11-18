import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { DevicesApi } from '../../../src/modules/devices/public/devices.api';
import { PersonnelFileHookContributions } from '../../../src/modules/personnel/public/personnel.extension-points';
import { DevicesHarness, type DeviceWire } from '../../support/devices-harness';

const h = new DevicesHarness();

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(sql: Client, text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('the register of company machines (integration, real PostgreSQL)', () => {
  const holderCount = { n: 0 };
  /** A person who works here, made fresh so a case never shares a holder with another. */
  const holder = (): Promise<string> => h.person(`E-REG${(holderCount.n += 1)}`);
  const sql = (): Client => h.ctx.sql;

  beforeAll(async () => {
    await h.start();
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('US-09-01 AC-1, AC-5: registers a machine to a person, today by default, and lists their machines by asset code', async () => {
    const e1 = await holder();
    const second = await h.registered(e1, { assetCode: 'ZZ-0002' });
    const first = await h.registered(e1, { assetCode: 'AA-0001', os: 'Windows 11' });

    expect(first).toMatchObject({
      assetCode: 'AA-0001',
      state: 'AWAITING_ACKNOWLEDGEMENT',
      signatureRecorded: false,
      retiredAt: null,
      holder: { id: e1 },
      registeredFrom: h.today(),
      acknowledgedFrom: null,
      lastEnd: null,
    });
    const page = h.dataOf<{ items: DeviceWire[]; pagination: { totalItems: number } }>(
      await h.listDevices(`?holderEmployeeId=${e1}`).expect(200),
    );
    expect(page.items.map((item) => item.assetCode)).toEqual(['AA-0001', 'ZZ-0002']);
    expect(page.pagination.totalItems).toBe(2);
    expect(second.holder?.id).toBe(e1);
  });

  it('US-09-01 AC-3: refuses a second machine with the same asset code however it is written, and the register does not change', async () => {
    const e = await holder();
    await h.registered(e, { assetCode: 'AS-0042' });
    const before = Number((await sql().query<{ n: string }>('SELECT count(*) AS n FROM managed_devices')).rows[0].n);

    const response = await h
      .createDevice({ assetCode: '  as-0042 ', hostname: 'x', os: 'y', holderEmployeeId: e })
      .expect(409);

    expect(h.codeOf(response)).toBe('DEVICE.ASSET_CODE_TAKEN');
    expect(Number((await sql().query<{ n: string }>('SELECT count(*) AS n FROM managed_devices')).rows[0].n)).toBe(
      before,
    );
  });

  it('US-09-01 AC-9: a machine is not registered to a person who does not exist, is handing over, or on a day that cannot be', async () => {
    const e = await holder();
    const handing = await holder();
    await sql().query(`UPDATE employees SET work_state = 'HANDING_OVER' WHERE id = $1`, [handing]);
    const body = (over: object) => ({ assetCode: h.assetCode(), hostname: 'h', os: 'o', holderEmployeeId: e, ...over });
    const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

    expect(h.codeOf(await h.createDevice(body({ holderEmployeeId: randomUUID() })).expect(422))).toBe(
      'DEVICE.HOLDER_NOT_FOUND',
    );
    expect(h.codeOf(await h.createDevice(body({ holderEmployeeId: handing })).expect(409))).toBe(
      'DEVICE.HOLDER_NOT_WORKING',
    );
    expect(h.codeOf(await h.createDevice(body({ handedOverOn: tomorrow })).expect(422))).toBe(
      'DEVICE.HANDOVER_DATE_INVALID',
    );
    expect(h.codeOf(await h.createDevice(body({ handedOverOn: '2019-12-31' })).expect(422))).toBe(
      'DEVICE.HANDOVER_DATE_INVALID',
    );
    const backdated = h.dataOf<DeviceWire>(await h.createDevice(body({ handedOverOn: '2026-10-20' })).expect(201));
    expect(backdated.registeredFrom).toBe('2026-10-20');
  });

  it('US-09-01 AC-10: giving a machine to another person ends the registration today and starts a new one that waits to be acknowledged', async () => {
    const [e1, e2] = [await holder(), await holder()];
    const device = await h.registered(e1);

    const changed = h.dataOf<DeviceWire>(await h.changeHolder(device.id, e2).expect(201));

    expect(changed).toMatchObject({ holder: { id: e2 }, state: 'AWAITING_ACKNOWLEDGEMENT', registeredFrom: h.today() });
    expect(changed.registrationId).not.toBe(device.registrationId);
    expect(changed.lastEnd).toMatchObject({ holder: { id: e1 }, validUntil: h.today(), endCause: 'HOLDER_CHANGED' });
    expect(h.codeOf(await h.changeHolder(device.id, e2).expect(409))).toBe('DEVICE.HOLDER_UNCHANGED');
    expect(h.codeOf(await h.changeHolder(randomUUID(), e2).expect(404))).toBe('DEVICE.NOT_FOUND');
  });

  it('retires a machine: its registration ends, nobody holds it, and it cannot be given or retired again', async () => {
    const device = await h.registered(await holder());

    const retired = h.dataOf<DeviceWire>(await h.retire(device.id, 'The disk failed.').expect(201));

    expect(retired).toMatchObject({
      state: 'RETIRED',
      holder: null,
      registrationId: null,
      retirementReason: 'The disk failed.',
      lastEnd: { endCause: 'DEVICE_RETIRED' },
    });
    expect(h.codeOf(await h.retire(device.id).expect(409))).toBe('DEVICE.ALREADY_RETIRED');
    expect(h.codeOf(await h.changeHolder(device.id, await holder()).expect(409))).toBe('DEVICE.ALREADY_RETIRED');
  });

  it('two holder changes at once leave one open registration: one is made, the other is refused', async () => {
    const e = await holder();
    const device = await h.registered(e);
    await h.ctx.app
      .get(TransactionRunner)
      .run((tx) =>
        h.ctx.app
          .get(DevicesApi)
          .endRegistrationsOfHolder(tx, { employeeId: e, end: { at: new Date() }, cause: 'DEPARTURE' }),
      );
    const target = await holder();

    const responses = await Promise.all([h.changeHolder(device.id, target), h.changeHolder(device.id, target)]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(['DEVICE.HOLDER_UNCHANGED', 'DEVICE.REGISTRATION_OVERLAP']).toContain(
      h.codeOf(responses.find((r) => r.status === 409)!),
    );
    const open = await sql().query(`SELECT 1 FROM device_registrations WHERE device_id = $1 AND ended_at IS NULL`, [
      device.id,
    ]);
    expect(open.rowCount).toBe(1);
  });

  it('US-09-08 AC-3: a person who left holds no machine; asking again changes nothing; a machine nobody holds is registered again', async () => {
    const [leaver, stays] = [await holder(), await holder()];
    const a = await h.registered(leaver);
    const b = await h.registered(leaver);
    const kept = await h.registered(stays);
    const devices = h.ctx.app.get(DevicesApi);
    const runner = h.ctx.app.get(TransactionRunner);
    const end = () =>
      runner.run((tx) =>
        devices.endRegistrationsOfHolder(tx, { employeeId: leaver, end: { at: new Date() }, cause: 'EMPLOYEE_LEFT' }),
      );

    const first = await end();
    const again = await end();

    expect(first.registrationIds.sort()).toEqual([a.registrationId, b.registrationId].sort());
    expect(again.registrationIds).toEqual([]);
    const ended = await sql().query<{ end_cause: string }>(
      `SELECT end_cause FROM device_registrations WHERE id = ANY($1::uuid[])`,
      [first.registrationIds],
    );
    expect(ended.rows.map((row) => row.end_cause)).toEqual(['EMPLOYEE_LEFT', 'EMPLOYEE_LEFT']);
    const audits = await sql().query<{ actor_kind: string }>(
      `SELECT actor_kind FROM audit_events WHERE action = 'DEVICE_REGISTRATION.ENDED' AND resource_id = ANY($1::text[])`,
      [first.registrationIds],
    );
    expect(audits.rows).toEqual([{ actor_kind: 'SYSTEM' }, { actor_kind: 'SYSTEM' }]);
    expect(h.dataOf<DeviceWire>(await h.getDevice(kept.id).expect(200)).holder?.id).toBe(stays);
    const regained = h.dataOf<DeviceWire>(await h.changeHolder(a.id, stays).expect(201));
    expect(regained).toMatchObject({ holder: { id: stays }, state: 'AWAITING_ACKNOWLEDGEMENT' });
  });

  it('wires the departure of a person to the register: the personnel file calls it when the person is marked left', () => {
    expect(h.ctx.app.get(PersonnelFileHookContributions).names()).toContain('personnel.device-registration');
  });

  it('answers the intake what it needs: whether a machine is in the register, and which registrations a person has held', async () => {
    const [e1, e2] = [await holder(), await holder()];
    const device = await h.registered(e1);
    const retired = await h.registered(e1);
    await h.retire(retired.id).expect(201);
    await h.changeHolder(device.id, e2).expect(201);
    const devices = h.ctx.app.get(DevicesApi);

    const firstHeld = await devices.holderRegistrationIds(device.id, e1);
    const secondHeld = await devices.holderRegistrationIds(device.id, e2);

    expect(firstHeld).toHaveLength(1);
    expect(secondHeld).toEqual([h.dataOf<DeviceWire>(await h.getDevice(device.id).expect(200)).registrationId]);
    expect(await devices.holderRegistrationIds(device.id, randomUUID())).toEqual([]);
    expect(await devices.deviceExists(device.id)).toBe(true);
    expect(await devices.deviceExists(retired.id)).toBe(true);
    expect(await devices.deviceExists(randomUUID())).toBe(false);
  });

  it('lists by state and by search, a page at a time, with the total of the same snapshot', async () => {
    const e = await holder();
    for (let index = 0; index < 12; index += 1)
      await h.registered(e, { assetCode: `PG-${String(index).padStart(2, '0')}`, hostname: `PAGE-HOST-${index}` });

    const firstPage = h.dataOf<{ items: DeviceWire[]; pagination: { totalItems: number; totalPages: number } }>(
      await h.listDevices(`?search=pg-&pageSize=5&page=1`).expect(200),
    );
    const lastPage = h.dataOf<{ items: DeviceWire[] }>(
      await h.listDevices(`?search=PAGE-HOST&pageSize=5&page=3`).expect(200),
    );
    const waiting = h.dataOf<{ items: DeviceWire[] }>(
      await h.listDevices(`?state=AWAITING_ACKNOWLEDGEMENT&holderEmployeeId=${e}&pageSize=100`).expect(200),
    );

    expect(firstPage.items.map((item) => item.assetCode)).toEqual(['PG-00', 'PG-01', 'PG-02', 'PG-03', 'PG-04']);
    expect(firstPage.pagination).toMatchObject({ totalItems: 12, totalPages: 3 });
    expect(lastPage.items).toHaveLength(2);
    expect(waiting.items).toHaveLength(12);
    // US-09-01 AC-2: the count the IT Admin dashboard shows is the total the list answers for the same state.
    const everyWaiting = h.dataOf<{ pagination: { totalItems: number } }>(
      await h.listDevices(`?state=AWAITING_ACKNOWLEDGEMENT&pageSize=1`).expect(200),
    ).pagination.totalItems;
    const organization = await h.ctx.sql.query<{ id: string }>('SELECT id FROM organizations LIMIT 1');
    await expect(
      h.ctx.app.get(DevicesApi).countByCollectionState(organization.rows[0].id, 'AWAITING_ACKNOWLEDGEMENT'),
    ).resolves.toBe(everyWaiting);
    expect(everyWaiting).toBeGreaterThanOrEqual(12);
    expect(
      h.dataOf<{ items: DeviceWire[] }>(await h.listDevices(`?state=ACTIVE&holderEmployeeId=${e}`).expect(200)).items,
    ).toEqual([]);
  });

  it('TP-01, TP-02: the database refuses to move a holder, end a registration twice, delete one, open two on a machine or overlap days', async () => {
    const [e1, e2] = [await holder(), await holder()];
    const device = await h.registered(e1);
    const registrationId = device.registrationId as string;

    expect(
      await sqlState(sql(), `UPDATE device_registrations SET holder_employee_id = $2 WHERE id = $1`, [
        registrationId,
        e2,
      ]),
    ).toBe('55000');
    expect(await sqlState(sql(), `DELETE FROM device_registrations WHERE id = $1`, [registrationId])).toBe('55000');
    expect(
      await sqlState(
        sql(),
        `INSERT INTO device_registrations (id, organization_id, device_id, holder_employee_id, valid_from, created_by_app_user_id)
         SELECT gen_random_uuid(), organization_id, device_id, $2, valid_from, created_by_app_user_id FROM device_registrations WHERE id = $1`,
        [registrationId, e2],
      ),
    ).toMatch(/^(23505|23P01)$/);
    await h.changeHolder(device.id, e2).expect(201);
    expect(
      await sqlState(
        sql(),
        `UPDATE device_registrations SET ended_at = now(), valid_until = valid_from + 3, end_cause = 'DEPARTURE' WHERE id = $1`,
        [registrationId],
      ),
    ).toBe('55000');
    expect(
      await sqlState(
        sql(),
        `INSERT INTO device_registrations (id, organization_id, device_id, holder_employee_id, valid_from, valid_until, ended_at, end_cause, created_by_app_user_id)
         SELECT gen_random_uuid(), organization_id, device_id, holder_employee_id, valid_from - 1, valid_from + 1, now(), 'DEPARTURE', created_by_app_user_id
           FROM device_registrations WHERE id = $1`,
        [registrationId],
      ),
    ).toBe('23P01');
    expect(await sqlState(sql(), `UPDATE managed_devices SET retired_at = now() WHERE id = $1`, [device.id])).toBe(
      '23514',
    );
  });
});
