import { randomUUID } from 'node:crypto';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements } from '../../support/query-count';
import { DevicesHarness, type DeviceWire } from '../../support/devices-harness';

const h = new DevicesHarness();

interface RegistrationWire {
  id: string;
  holder: { id: string; employeeCode: string; fullName: string } | null;
  validFrom: string;
  validUntil: string | null;
  endedAt: string | null;
  endCause: string | null;
  acknowledgedFrom: string | null;
  collectionStoppedAt: string | null;
  signatureRecorded: boolean;
  lastAcceptedAt: string | null;
}
interface RegistrationPageWire {
  items: RegistrationWire[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}
interface DevicePageWire {
  items: DeviceWire[];
  pagination: { totalItems: number };
}

/**
 * `QĐ-111ay` (FB-7-6, FB-7-7): who held a machine, newest first and a page at a time, and what the list of machines says of the collection
 * (the state and the last time an intake was accepted) without one call for each machine.
 */
describe('the holders of a machine and the collection column of the register (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  const holderCount = { n: 0 };
  const holder = (): Promise<string> => h.person(`E-RGH${(holderCount.n += 1)}`);

  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
  }, 300000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  describe('GET /devices/{id}/registrations', () => {
    it('lists every registration of the machine, the open one first, each with who held it and how it ended', async () => {
      const [e1, e2, e3] = [await holder(), await holder(), await holder()];
      const device = await h.registered(e1);
      await h.changeHolder(device.id, e2).expect(201);
      await h.changeHolder(device.id, e3).expect(201);

      const page = h.dataOf<RegistrationPageWire>(await h.deviceRegistrations(device.id).expect(200));

      expect(page.items.map((item) => item.holder?.id)).toEqual([e3, e2, e1]);
      expect(page.items[0]).toMatchObject({
        validFrom: h.today(),
        validUntil: null,
        endedAt: null,
        endCause: null,
        acknowledgedFrom: null,
        collectionStoppedAt: null,
        signatureRecorded: false,
        lastAcceptedAt: null,
      });
      expect(page.items[1]).toMatchObject({ validUntil: h.today(), endCause: 'HOLDER_CHANGED' });
      expect(page.items[1].endedAt).not.toBeNull();
      expect(page.items[2]).toMatchObject({ holder: { id: e1 }, endCause: 'HOLDER_CHANGED' });
      expect(page.items[0].id).toBe(h.dataOf<DeviceWire>(await h.getDevice(device.id).expect(200)).registrationId);
      expect(page.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 3, totalPages: 1 });
    });

    it('ends the history with the retirement, and says whether the registration was signed and acknowledged', async () => {
      const notice = await h.published();
      const account = await h.account(`E-RGH-ACK`, await holder(), 'EMPLOYEE');
      const device = await h.active(account, notice);
      await h.retire(device.id, 'The disk failed.').expect(201);

      const page = h.dataOf<RegistrationPageWire>(await h.deviceRegistrations(device.id).expect(200));

      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({
        holder: { id: account.employeeId },
        endCause: 'DEVICE_RETIRED',
        signatureRecorded: true,
      });
      expect(page.items[0].acknowledgedFrom).not.toBeNull();
    });

    it('pages by newest first with the total of the same snapshot, and refuses a page size over 100', async () => {
      const people = [await holder(), await holder()];
      const device = await h.registered(people[0]);
      for (let index = 0; index < 4; index += 1) await h.changeHolder(device.id, people[(index + 1) % 2]).expect(201);

      const first = h.dataOf<RegistrationPageWire>(await h.deviceRegistrations(device.id, '?pageSize=2').expect(200));
      const last = h.dataOf<RegistrationPageWire>(
        await h.deviceRegistrations(device.id, '?pageSize=2&page=3').expect(200),
      );
      const beyond = h.dataOf<RegistrationPageWire>(
        await h.deviceRegistrations(device.id, '?pageSize=2&page=4').expect(200),
      );

      expect(first.pagination).toEqual({ page: 1, pageSize: 2, totalItems: 5, totalPages: 3 });
      expect(first.items.map((item) => item.endedAt === null)).toEqual([true, false]);
      expect(last.items).toHaveLength(1);
      expect(last.items[0].holder?.id).toBe(people[0]);
      expect(beyond.items).toEqual([]);
      expect(h.codeOf(await h.deviceRegistrations(device.id, '?pageSize=101').expect(422))).toBe('VALIDATION_ERROR');
    });

    it('answers 404 DEVICE.NOT_FOUND for a machine that is not in the register, and keeps the route for the IT Admin', async () => {
      expect(h.codeOf(await h.deviceRegistrations(randomUUID()).expect(404))).toBe('DEVICE.NOT_FOUND');
      const device = await h.registered(await holder());
      await h.deviceRegistrations(device.id, '', h.employee).expect(403);
      await h.deviceRegistrations(device.id, '', h.finance).expect(403);
    });

    it('reads the same number of statements whatever the number of registrations (API-LIST-DETAIL.1)', async () => {
      const people = [await holder(), await holder()];
      const device = await h.registered(people[0]);
      const few = await counter.run(() => h.deviceRegistrations(device.id, '?pageSize=100').expect(200));
      for (let index = 0; index < 6; index += 1) await h.changeHolder(device.id, people[(index + 1) % 2]).expect(201);
      const many = await counter.run(() => h.deviceRegistrations(device.id, '?pageSize=100').expect(200));

      expect(h.dataOf<RegistrationPageWire>(many.result).items).toHaveLength(7);
      expect(dataStatements(many.statements)).toHaveLength(dataStatements(few.statements).length);
    });
  });

  describe('the collection column of GET /devices', () => {
    const setAccepted = (credentialId: string, at: string) =>
      h.ctx.sql.query(`UPDATE device_credentials SET last_accepted_at = $2 WHERE id = $1`, [credentialId, at]);

    it('says the state and null while nothing was accepted, in the list and in the detail', async () => {
      const e = await holder();
      const device = await h.registered(e);

      const listed = h
        .dataOf<DevicePageWire>(await h.listDevices(`?holderEmployeeId=${e}`).expect(200))
        .items.find((item) => item.id === device.id);

      expect(listed?.collection).toEqual({ state: 'AWAITING_ACKNOWLEDGEMENT', lastAcceptedAt: null });
      expect(listed?.state).toBe(listed?.collection.state);
      expect(h.dataOf<DeviceWire>(await h.getDevice(device.id).expect(200)).collection).toEqual(listed?.collection);
      await h.retire(device.id).expect(201);
      expect(h.dataOf<DeviceWire>(await h.getDevice(device.id).expect(200)).collection).toEqual({
        state: 'RETIRED',
        lastAcceptedAt: null,
      });
    });

    it('gives the latest instant any credential of the open registration was accepted, revoked ones included', async () => {
      const notice = await h.published();
      const account = await h.account('E-RGH-COL', await holder(), 'EMPLOYEE');
      const collected = await h.collected(account, notice);
      await setAccepted(collected.credentialId, '2026-11-10T08:00:00.000Z');
      await h.revokeCredential(collected.credentialId).expect(201);
      const second = await h.enrolled(collected.device.registrationId as string);
      await setAccepted(second.credentialId, '2026-11-09T08:00:00.000Z');

      const listed = h
        .dataOf<DevicePageWire>(await h.listDevices(`?holderEmployeeId=${account.employeeId}`).expect(200))
        .items.find((item) => item.id === collected.device.id);

      expect(listed?.collection).toEqual({ state: 'ACTIVE', lastAcceptedAt: '2026-11-10T08:00:00.000Z' });
      expect(h.dataOf<DeviceWire>(await h.getDevice(collected.device.id).expect(200)).collection.lastAcceptedAt).toBe(
        '2026-11-10T08:00:00.000Z',
      );
      const registrations = h.dataOf<RegistrationPageWire>(
        await h.deviceRegistrations(collected.device.id).expect(200),
      );
      expect(registrations.items[0].lastAcceptedAt).toBe('2026-11-10T08:00:00.000Z');
    });

    it('starts again for the next holder: the new registration has accepted nothing yet', async () => {
      const notice = await h.published();
      const account = await h.account('E-RGH-NEXT', await holder(), 'EMPLOYEE');
      const collected = await h.collected(account, notice);
      await setAccepted(collected.credentialId, '2026-11-10T08:00:00.000Z');
      const next = await holder();
      await h.changeHolder(collected.device.id, next).expect(201);

      const detail = h.dataOf<DeviceWire>(await h.getDevice(collected.device.id).expect(200));
      const registrations = h.dataOf<RegistrationPageWire>(
        await h.deviceRegistrations(collected.device.id).expect(200),
      );

      expect(detail.collection).toEqual({ state: 'AWAITING_ACKNOWLEDGEMENT', lastAcceptedAt: null });
      expect(registrations.items.map((item) => item.lastAcceptedAt)).toEqual([null, '2026-11-10T08:00:00.000Z']);
    });

    it('reads the same number of statements for a page of one machine and for a page of many (one query, no call for each machine)', async () => {
      const people = [await holder(), await holder()];
      await h.registered(people[0]);
      const few = await counter.run(() => h.listDevices('?pageSize=100').expect(200));
      for (let index = 0; index < 8; index += 1) await h.registered(people[index % 2]);
      const many = await counter.run(() => h.listDevices('?pageSize=100').expect(200));

      expect(h.dataOf<DevicePageWire>(many.result).items.length).toBeGreaterThan(
        h.dataOf<DevicePageWire>(few.result).items.length,
      );
      expect(dataStatements(many.statements)).toHaveLength(dataStatements(few.statements).length);
    });
  });
});
