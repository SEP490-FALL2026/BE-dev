import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { StopRequestSweepService } from '../../../src/modules/devices/stop-request/stop-request-sweep.service';
import { ApiAccount } from '../../support/api-accounts';
import {
  DevicesHarness,
  type CredentialWire,
  type DeviceWire,
  type MyDeviceWire,
  type NoticeWire,
  type SessionWire,
  type StopRequestWire,
} from '../../support/devices-harness';

const h = new DevicesHarness();

describe('stopping collection on the holder request (integration, real PostgreSQL)', () => {
  let notice: NoticeWire;
  let it2: ApiAccount;
  let counter = 0;
  const sql = (): Client => h.ctx.sql;
  const holder = async (): Promise<ApiAccount> => {
    counter += 1;
    return h.account(`E-STP${counter}`, await h.person(`E-STP${counter}`), 'EMPLOYEE');
  };
  const stopOf = (response: { body: unknown }): StopRequestWire =>
    (response.body as { data: { stopRequest: StopRequestWire } }).data.stopRequest;
  const rowsOf = async (registrationId: string) =>
    (
      await sql().query<{ id: string; state: string; invalid_reason: string | null; handled_at: Date | null }>(
        `SELECT id, state, invalid_reason, handled_at FROM device_stop_requests WHERE registration_id = $1 ORDER BY id`,
        [registrationId],
      )
    ).rows;
  const projection = async (registrationId: string) =>
    (
      await sql().query<{ acknowledged_from: Date | null; collection_stopped_at: Date | null }>(
        `SELECT acknowledged_from, collection_stopped_at FROM device_registrations WHERE id = $1`,
        [registrationId],
      )
    ).rows[0];

  beforeAll(async () => {
    await h.start();
    notice = await h.published();
    await h.allowlisted();
    it2 = await h.account('E-STP-IT2', await h.person('E-STP-IT2'), 'IT_ADMIN');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('US-09-04 AC-1, AC-12: a request is received open with a deadline two working days away, and collection goes on until it is completed', async () => {
    const person = await holder();
    const { device, token } = await h.collected(person, notice);
    const registrationId = device.registrationId as string;
    const batch = h.usageBatch(h.today(), new Date());

    const created = stopOf(await h.requestStop(person, registrationId).expect(201));

    expect(created).toMatchObject({
      registrationId,
      deviceId: device.id,
      holderEmployeeId: person.employeeId,
      state: 'OPEN',
      invalidReason: null,
      handledAt: null,
      handledByAppUserId: null,
      selfHandled: false,
      overdue: false,
    });
    expect(Date.parse(created.dueAt)).toBeGreaterThanOrEqual(Date.parse(created.requestedAt) + 2 * 86_400_000);
    expect((await projection(registrationId)).collection_stopped_at).toBeNull();
    expect(
      h.dataOf<{ results: { outcome: string }[] }>(await h.sendUsage(token, batch).expect(200)).results[0].outcome,
    ).toBe('ACCEPTED');
    const listed = h.dataOf<{ items: StopRequestWire[] }>(await h.listStopRequests('?pageSize=100').expect(200));
    expect(listed.items.find((item) => item.id === created.id)).toMatchObject({ state: 'OPEN', overdue: false });
  });

  it('US-09-04 AC-3, AC-7, AC-12: any IT Admin completes it; the batch is then refused, the credential stays, and the registration keeps one projection', async () => {
    const person = await holder();
    const { device, token, credentialId } = await h.collected(person, notice);
    const registrationId = device.registrationId as string;
    const created = stopOf(await h.requestStop(person, registrationId).expect(201));

    const completed = stopOf(await h.completeStop(created.id, it2).expect(200));

    expect(completed).toMatchObject({
      id: created.id,
      state: 'COMPLETED',
      invalidReason: null,
      handledByAppUserId: it2.appUserId,
      selfHandled: false,
      overdue: false,
    });
    expect(completed.handledAt).not.toBeNull();
    const row = await projection(registrationId);
    expect(row.acknowledged_from).toBeNull();
    expect(row.collection_stopped_at).not.toBeNull();
    expect(h.codeOf(await h.sendUsage(token, h.usageBatch(h.today(), new Date())).expect(403))).toBe(
      'DEVICE.COLLECTION_STOPPED',
    );
    expect(h.dataOf<SessionWire>(await h.session(token).expect(200)).state).toBe('COLLECTION_STOPPED');
    const credentials = h.dataOf<{ items: CredentialWire[] }>(await h.listCredentials(registrationId).expect(200));
    expect(credentials.items.find((item) => item.id === credentialId)?.revokedAt).toBeNull();
    expect(h.dataOf<DeviceWire>(await h.getDevice(device.id).expect(200)).state).toBe('COLLECTION_STOPPED');

    const audit = await sql().query<{ action: string; after: Record<string, unknown> | null }>(
      `SELECT action, after FROM audit_events WHERE resource_id = $1 ORDER BY occurred_at, id`,
      [created.id],
    );
    expect(audit.rows.map((event) => event.action)).toEqual([
      'DEVICE_STOP_REQUEST.CREATED',
      'DEVICE_STOP_REQUEST.COMPLETED',
    ]);
    expect(audit.rows[1].after).toMatchObject({ selfHandled: false });
  });

  it('US-09-04 AC-3, AC-6: a request is completed once; a second completion and an unknown id are refused, and there is no way to close a valid one', async () => {
    const person = await holder();
    const device = await h.active(person, notice);
    const created = stopOf(await h.requestStop(person, device.registrationId as string).expect(201));

    await h.completeStop(created.id).expect(200);
    const again = await h.completeStop(created.id).expect(409);

    expect(h.codeOf(again)).toBe('DEVICE_STOP_REQUEST.NOT_OPEN');
    expect((again.body as { error: { details: unknown } }).error.details).toEqual({ state: 'COMPLETED' });
    expect(h.codeOf(await h.completeStop(randomUUID()).expect(404))).toBe('DEVICE_STOP_REQUEST.NOT_FOUND');
    await h.completeStop(created.id, person).expect(403);
    await h.completeStop(created.id, h.it1, { note: 'closed' }).expect(422);
  });

  it('US-09-04 AC-10: a request for a machine already stopped, or one already waiting, is kept as invalid with the time it was handled', async () => {
    const person = await holder();
    const device = await h.active(person, notice);
    const registrationId = device.registrationId as string;

    const first = stopOf(await h.requestStop(person, registrationId).expect(201));
    const duplicate = stopOf(await h.requestStop(person, registrationId).expect(201));

    expect(first.state).toBe('OPEN');
    expect(duplicate).toMatchObject({ state: 'INVALID', invalidReason: 'DUPLICATE', handledByAppUserId: null });
    expect(duplicate.handledAt).not.toBeNull();
    expect(duplicate.overdue).toBe(false);
    await h.completeStop(first.id).expect(200);
    const stopped = stopOf(await h.requestStop(person, registrationId).expect(201));

    expect(stopped).toMatchObject({ state: 'INVALID', invalidReason: 'ALREADY_STOPPED', handledByAppUserId: null });
    expect(stopped.handledAt).not.toBeNull();
    const rows = await rowsOf(registrationId);
    expect(rows.map((row) => row.state).sort()).toEqual(['COMPLETED', 'INVALID', 'INVALID']);
    expect(rows.every((row) => row.handled_at !== null)).toBe(true);
  });

  it('two requests at once leave one open and one invalid duplicate, and neither answers 500', async () => {
    const person = await holder();
    const device = await h.active(person, notice);
    const registrationId = device.registrationId as string;

    const [a, b] = await Promise.all([h.requestStop(person, registrationId), h.requestStop(person, registrationId)]);

    expect([a.status, b.status]).toEqual([201, 201]);
    expect([stopOf(a), stopOf(b)].map((item) => `${item.state}/${item.invalidReason}`).sort()).toEqual([
      'INVALID/DUPLICATE',
      'OPEN/null',
    ]);
    expect((await rowsOf(registrationId)).map((row) => row.state).sort()).toEqual(['INVALID', 'OPEN']);
  });

  it('US-09-04: only the holder of a registration in force asks; anybody else, an unknown id and an ended registration are refused', async () => {
    const [person, other] = [await holder(), await holder()];
    const device = await h.active(person, notice);
    const registrationId = device.registrationId as string;

    expect(h.codeOf(await h.requestStop(other, registrationId).expect(404))).toBe('DEVICE_REGISTRATION.NOT_FOUND');
    expect(h.codeOf(await h.requestStop(h.it1, registrationId).expect(404))).toBe('DEVICE_REGISTRATION.NOT_FOUND');
    expect(h.codeOf(await h.requestStop(person, randomUUID()).expect(404))).toBe('DEVICE_REGISTRATION.NOT_FOUND');
    expect(h.codeOf(await h.requestStop(person, registrationId, { reason: 'x' }).expect(422))).toBe('VALIDATION_ERROR');
    expect(await rowsOf(registrationId)).toEqual([]);

    await h.changeHolder(device.id, other.employeeId).expect(201);

    expect(h.codeOf(await h.requestStop(person, registrationId).expect(409))).toBe('DEVICE_REGISTRATION.ENDED');
    expect(await rowsOf(registrationId)).toEqual([]);
  });

  it('US-09-04 AC-7: an IT Admin who holds a machine asks and completes it themselves, and the request says so', async () => {
    const device = await h.active(it2, notice);
    const created = stopOf(await h.requestStop(it2, device.registrationId as string).expect(201));

    const completed = stopOf(await h.completeStop(created.id, it2).expect(200));

    expect(completed).toMatchObject({ state: 'COMPLETED', selfHandled: true, handledByAppUserId: it2.appUserId });
    const audit = await sql().query<{ after: { selfHandled: boolean } }>(
      `SELECT after FROM audit_events WHERE resource_id = $1 AND action = 'DEVICE_STOP_REQUEST.COMPLETED'`,
      [created.id],
    );
    expect(audit.rows[0].after.selfHandled).toBe(true);
  });

  it('a machine nobody has acknowledged yet can be stopped: the request is valid and completing it does not fail', async () => {
    const person = await holder();
    const machine = await h.signedMachine(person, notice);
    const registrationId = machine.registrationId as string;
    const created = stopOf(await h.requestStop(person, registrationId).expect(201));

    expect(created.state).toBe('OPEN');
    expect(stopOf(await h.completeStop(created.id).expect(200)).state).toBe('COMPLETED');
    const row = await projection(registrationId);
    expect(row.acknowledged_from).toBeNull();
    expect(row.collection_stopped_at).not.toBeNull();
    expect(h.dataOf<DeviceWire>(await h.getDevice(machine.id).expect(200)).state).toBe('COLLECTION_STOPPED');
  });

  it('US-09-04 AC-5: the IT Admin reads the open requests oldest deadline first, with the late ones marked; others cannot read them', async () => {
    const [early, late] = [await holder(), await holder()];
    const [first, second] = [await h.active(early, notice), await h.active(late, notice)];
    const lateRequest = stopOf(await h.requestStop(late, second.registrationId as string).expect(201));
    const earlyRequest = stopOf(await h.requestStop(early, first.registrationId as string).expect(201));
    await sql().query(`UPDATE device_stop_requests SET due_at = now() - interval '1 hour' WHERE id = $1`, [
      earlyRequest.id,
    ]);

    const page = h.dataOf<{ items: StopRequestWire[] }>(await h.listStopRequests('?pageSize=100').expect(200));
    const ids = page.items.map((item) => item.id);

    expect(ids.indexOf(earlyRequest.id)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(earlyRequest.id)).toBeLessThan(ids.indexOf(lateRequest.id));
    expect(page.items.find((item) => item.id === earlyRequest.id)?.overdue).toBe(true);
    expect(page.items.find((item) => item.id === lateRequest.id)?.overdue).toBe(false);
    expect(page.items.every((item) => item.state === 'OPEN')).toBe(true);
    await h.completeStop(earlyRequest.id).expect(200);
    const done = h.dataOf<{ items: StopRequestWire[] }>(
      await h.listStopRequests('?state=COMPLETED&pageSize=100').expect(200),
    ).items;
    expect(done.find((item) => item.id === earlyRequest.id)).toMatchObject({ state: 'COMPLETED', overdue: false });
    expect(h.codeOf(await h.listStopRequests('?state=NOPE').expect(422))).toBe('VALIDATION_ERROR');
    await h.listStopRequests('', early).expect(403);
  });

  it('TS-11 US-09-04 AC-11: after a stop the holder turns collection on again; days before that moment are refused and later ones accepted', async () => {
    const person = await holder();
    const { device, token } = await h.collected(person, notice);
    const registrationId = device.registrationId as string;
    const daysAgo = (days: number): string =>
      new Date(Date.parse(`${h.today()}T00:00:00.000Z`) - days * 86_400_000).toISOString().slice(0, 10);
    const tool = { tool: 'CODEX', coverage: 'PARTIAL', responses: 3, totalTokens: 900 };
    const outcomes = async () =>
      h
        .dataOf<{ results: { date: string; outcome: string; reasonCode: string | null }[] }>(
          await h
            .sendUsage(token, {
              generatedAt: new Date().toISOString(),
              days: [daysAgo(7), daysAgo(3), h.today()].map((date) => ({ date, tools: [tool] })),
            })
            .expect(200),
        )
        .results.map((result) => `${result.date}:${result.outcome}:${result.reasonCode}`);
    // The acknowledgement the holder gave long ago: the head of the chain goes back ten days.
    await sql().query(`UPDATE device_registrations SET acknowledged_from = now() - interval '10 days' WHERE id = $1`, [
      registrationId,
    ]);
    const created = stopOf(await h.requestStop(person, registrationId).expect(201));
    await h.completeStop(created.id).expect(200);
    expect(h.codeOf(await h.sendUsage(token, h.usageBatch(h.today(), new Date())).expect(403))).toBe(
      'DEVICE.COLLECTION_STOPPED',
    );
    // The stop happened five days ago, as far as the intake is concerned.
    await sql().query(
      `UPDATE device_registrations SET collection_stopped_at = now() - interval '5 days' WHERE id = $1`,
      [registrationId],
    );

    await h.acknowledge(person, registrationId, notice.id).expect(201);

    const row = await projection(registrationId);
    expect(row.collection_stopped_at).toBeNull();
    const latest = await sql().query<{ acknowledged_at: Date }>(
      `SELECT acknowledged_at FROM device_acknowledgements WHERE registration_id = $1 ORDER BY acknowledged_at DESC, id DESC LIMIT 1`,
      [registrationId],
    );
    expect(row.acknowledged_from).toEqual(latest.rows[0].acknowledged_at);
    expect(await outcomes()).toEqual([
      `${daysAgo(7)}:REJECTED:OUTSIDE_WINDOW`,
      `${daysAgo(3)}:REJECTED:OUTSIDE_WINDOW`,
      `${h.today()}:ACCEPTED:null`,
    ]);
    expect(h.dataOf<SessionWire>(await h.session(token).expect(200)).state).toBe('ACTIVE');
  });

  it('US-09-04: a registration that ends while a request is open closes it as invalid, with the time it was handled', async () => {
    const [person, next] = [await holder(), await holder()];
    const device = await h.active(person, notice);
    const registrationId = device.registrationId as string;
    const created = stopOf(await h.requestStop(person, registrationId).expect(201));

    await h.changeHolder(device.id, next.employeeId).expect(201);

    const rows = await sql().query<{
      state: string;
      invalid_reason: string;
      handled_at: Date | null;
      by: string | null;
      note: string | null;
    }>(
      `SELECT state, invalid_reason, handled_at, handled_by_app_user_id AS by, invalid_note AS note FROM device_stop_requests WHERE id = $1`,
      [created.id],
    );
    expect(rows.rows[0]).toMatchObject({
      state: 'INVALID',
      invalid_reason: 'REGISTRATION_ENDED',
      by: null,
      note: null,
    });
    expect(rows.rows[0].handled_at).not.toBeNull();
    expect(h.codeOf(await h.completeStop(created.id).expect(409))).toBe('DEVICE_STOP_REQUEST.NOT_OPEN');
    const open = h.dataOf<{ items: StopRequestWire[] }>(await h.listStopRequests('?pageSize=100').expect(200));
    expect(open.items.find((item) => item.id === created.id)).toBeUndefined();
  });

  it('GET /me/devices says whether a stop request of the registration is waiting', async () => {
    const person = await holder();
    const device = await h.active(person, notice);
    const pending = async (): Promise<boolean[]> =>
      h
        .dataOf<{ items: MyDeviceWire[] }>(await h.myDevices(person).expect(200))
        .items.map((item) => item.stopRequestPending);

    expect(await pending()).toEqual([false]);
    const created = stopOf(await h.requestStop(person, device.registrationId as string).expect(201));
    expect(await pending()).toEqual([true]);
    await h.requestStop(person, device.registrationId as string).expect(201);
    expect(await pending()).toEqual([true]);
    await h.completeStop(created.id).expect(200);
    expect(await pending()).toEqual([false]);
  });

  describe('the notices of a request (FX-T9c)', () => {
    interface Notice {
      recipient_employee_id: string;
      subject_type: string | null;
      subject_id: string | null;
      event_key: string;
      params: Record<string, unknown>;
    }
    const noticesOf = async (code: string, requestId: string): Promise<Notice[]> =>
      (
        await sql().query<Notice>(
          `SELECT recipient_employee_id, subject_type, subject_id, event_key, params
             FROM in_app_notifications WHERE code = $1 AND event_key = $2 ORDER BY recipient_employee_id`,
          [code, `${code}:${requestId}`],
        )
      ).rows;
    const recipients = (notices: Notice[]): string[] => notices.map((notice) => notice.recipient_employee_id).sort();
    const inCharge = (employeeId: string | null) =>
      sql().query(`UPDATE departments SET it_admin_employee_id = $1 WHERE status = 'ACTIVE'`, [employeeId]);
    const dayOf = async (instant: string): Promise<string> => {
      const zone = (await sql().query<{ time_zone: string }>(`SELECT time_zone FROM organizations LIMIT 1`)).rows[0]
        .time_zone;

      return new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date(instant));
    };
    const sweep = (now: Date) => h.ctx.app.get(StopRequestSweepService, { strict: false }).run(now);
    const pastDue = (id: string) =>
      sql().query(`UPDATE device_stop_requests SET due_at = now() - interval '1 hour' WHERE id = $1`, [id]);

    afterEach(async () => {
      await inCharge(null);
    });

    it('FX-T9c: a request tells the IT Admin in charge of the department of the holder, once, with the deadline day', async () => {
      await inCharge(h.it1.employeeId);
      const person = await holder();
      const device = await h.active(person, notice);

      const created = stopOf(await h.requestStop(person, device.registrationId as string).expect(201));

      const notices = await noticesOf('DEVICE_STOP_REQUESTED', created.id);
      expect(recipients(notices)).toEqual([h.it1.employeeId]);
      expect(notices[0]).toMatchObject({
        subject_type: 'DEVICE_STOP_REQUEST',
        subject_id: created.id,
        params: {
          stopRequestId: created.id,
          registrationId: device.registrationId,
          deviceId: device.id,
          holderEmployeeId: person.employeeId,
          dueAt: created.dueAt,
          dueOn: await dayOf(created.dueAt),
        },
      });
      expect(Object.keys(notices[0].params).sort()).toEqual([
        'deviceId',
        'dueAt',
        'dueOn',
        'holderEmployeeId',
        'registrationId',
        'stopRequestId',
      ]);
    });

    it('FX-T9c: when nobody is in charge, every IT Admin who can act is told, and not the holder', async () => {
      await inCharge(null);
      const person = await holder();
      const device = await h.active(person, notice);

      const created = stopOf(await h.requestStop(person, device.registrationId as string).expect(201));

      const told = recipients(await noticesOf('DEVICE_STOP_REQUESTED', created.id));
      expect(told).toEqual(expect.arrayContaining([h.it1.employeeId, it2.employeeId]));
      expect(told).not.toContain(person.employeeId);
    });

    it('FX-T9c Review 2: an IT Admin who asks for their own machine is not told; the other IT Admins who can act are', async () => {
      await inCharge(it2.employeeId);
      const device = await h.active(it2, notice);

      const created = stopOf(await h.requestStop(it2, device.registrationId as string).expect(201));

      const told = recipients(await noticesOf('DEVICE_STOP_REQUESTED', created.id));
      expect(told).not.toContain(it2.employeeId);
      expect(told).toContain(h.it1.employeeId);
    });

    it('FX-T9c: a request closed as a duplicate tells nobody', async () => {
      await inCharge(h.it1.employeeId);
      const person = await holder();
      const device = await h.active(person, notice);
      await h.requestStop(person, device.registrationId as string).expect(201);

      const duplicate = stopOf(await h.requestStop(person, device.registrationId as string).expect(201));

      expect(duplicate.state).toBe('INVALID');
      expect(await noticesOf('DEVICE_STOP_REQUESTED', duplicate.id)).toEqual([]);
    });

    it('FX-T9c AC-5: an open request past its deadline tells the same people once; a second pass says nothing', async () => {
      await inCharge(h.it1.employeeId);
      const person = await holder();
      const device = await h.active(person, notice);
      const created = stopOf(await h.requestStop(person, device.registrationId as string).expect(201));
      await pastDue(created.id);

      await sweep(new Date());
      await sweep(new Date());

      const notices = await noticesOf('DEVICE_STOP_REQUEST_OVERDUE', created.id);
      expect(recipients(notices)).toEqual([h.it1.employeeId]);
      expect(notices[0]).toMatchObject({
        subject_type: 'DEVICE_STOP_REQUEST',
        subject_id: created.id,
        params: { stopRequestId: created.id, holderEmployeeId: person.employeeId, deviceId: device.id },
      });
      const marked = await sql().query<{ overdue_noticed_at: Date | null }>(
        `SELECT overdue_noticed_at FROM device_stop_requests WHERE id = $1`,
        [created.id],
      );
      expect(marked.rows[0].overdue_noticed_at).not.toBeNull();
    });

    it('FX-T9c AC-5: a request before its deadline, a completed one and an invalid one past it are not told', async () => {
      await inCharge(h.it1.employeeId);
      const [waiting, done, closed] = [await holder(), await holder(), await holder()];
      const [waitingDevice, doneDevice, closedDevice] = [
        await h.active(waiting, notice),
        await h.active(done, notice),
        await h.active(closed, notice),
      ];
      const early = stopOf(await h.requestStop(waiting, waitingDevice.registrationId as string).expect(201));
      const completed = stopOf(await h.requestStop(done, doneDevice.registrationId as string).expect(201));
      await h.completeStop(completed.id).expect(200);
      await h.requestStop(closed, closedDevice.registrationId as string).expect(201);
      const duplicate = stopOf(await h.requestStop(closed, closedDevice.registrationId as string).expect(201));
      await pastDue(completed.id);
      await pastDue(duplicate.id);

      await sweep(new Date());

      for (const id of [early.id, completed.id, duplicate.id]) {
        expect(await noticesOf('DEVICE_STOP_REQUEST_OVERDUE', id)).toEqual([]);
      }
    });
  });
});
