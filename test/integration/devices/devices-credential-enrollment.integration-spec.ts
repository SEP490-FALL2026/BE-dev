import { Client } from 'pg';
import { ApiAccount } from '../../support/api-accounts';
import { DevicesHarness, type DeviceWire, type SessionWire } from '../../support/devices-harness';

const h = new DevicesHarness();

describe('the enrollment code, the credential and its session (integration, real PostgreSQL)', () => {
  let counter = 0;
  const sql = (): Client => h.ctx.sql;
  const holder = async (): Promise<ApiAccount> => {
    counter += 1;
    return h.account(`E-CRED${counter}`, await h.person(`E-CRED${counter}`), 'EMPLOYEE');
  };
  const codeRow = async (registrationId: string) =>
    (
      await sql().query<{ code_hash: string; uses: number; max_uses: number }>(
        `SELECT code_hash, uses, max_uses FROM device_enrollment_codes WHERE registration_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [registrationId],
      )
    ).rows[0];
  const notice = () => h.published();

  beforeAll(async () => {
    await h.start();
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('US-09-01 AC-13: makes no code until the signed BM-06 of an open registration is kept', async () => {
    const version = await notice();
    const person = await holder();
    const unsigned = await h.registered(person.employeeId);

    expect(
      h.codeOf(await h.createCode(unsigned.registrationId as string, { collectorKind: 'AI_COLLECTOR' }).expect(409)),
    ).toBe('DEVICE_REGISTRATION.SIGNATURE_RECORD_MISSING');
    const signed = await h.signedMachine(person, version);
    await h.changeHolder(signed.id, (await holder()).employeeId).expect(201);
    expect(
      h.codeOf(await h.createCode(signed.registrationId as string, { collectorKind: 'AI_COLLECTOR' }).expect(409)),
    ).toBe('DEVICE_REGISTRATION.ENDED');
    expect(
      h.codeOf(
        await h.createCode('3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11', { collectorKind: 'AI_COLLECTOR' }).expect(404),
      ),
    ).toBe('DEVICE_REGISTRATION.NOT_FOUND');
  });

  it('US-09-01 AC-13: shows the code once, keeps only its hash, and takes one use for an AI collector and up to five for the browser', async () => {
    const machine = await h.signedMachine(await holder(), await notice());
    const registrationId = machine.registrationId as string;

    const response = await h.createCode(registrationId, { collectorKind: 'BROWSER_EXTENSION', maxUses: 3 }).expect(201);
    const issued = h.dataOf<{ code: string; collectorKind: string; maxUses: number; expiresAt: string }>(response);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(issued).toMatchObject({ collectorKind: 'BROWSER_EXTENSION', maxUses: 3 });
    expect(issued.code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    const hours = (Date.parse(issued.expiresAt) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
    const stored = await codeRow(registrationId);
    expect(stored.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(issued.code.replace(/-/g, ''));
    await h.createCode(registrationId, { collectorKind: 'AI_COLLECTOR', maxUses: 2 }).expect(422);
    await h.createCode(registrationId, { collectorKind: 'BROWSER_EXTENSION', maxUses: 6 }).expect(422);
    expect((await codeRow(registrationId)).max_uses).toBe(3);
    expect(
      h.dataOf<{ maxUses: number }>(await h.createCode(registrationId, { collectorKind: 'AI_COLLECTOR' }).expect(201))
        .maxUses,
    ).toBe(1);
  });

  it('exchanges a code for a credential with an Idempotency-Key, however the installer typed it, and a code of the wrong shape is the same 404 as an unknown one', async () => {
    const machine = await h.signedMachine(await holder(), await notice());
    const code = await h.codeFor(machine.registrationId as string);

    await h.enroll(code, null).expect(422);
    await h.enroll(code, 'short').expect(422);
    expect(h.codeOf(await h.enroll('NOT-A-CODE').expect(404))).toBe('DEVICE_ENROLLMENT.CODE_INVALID');
    expect(h.codeOf(await h.enroll('ABCD-EFGH-JKMN').expect(404))).toBe('DEVICE_ENROLLMENT.CODE_INVALID');
    const response = await h.enroll(` ${code.toLowerCase().replace(/-/g, ' ')} `).expect(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(h.dataOf<{ token: string }>(response).token).toMatch(/^sstd_[0-9a-f-]{36}_[A-Za-z0-9_-]{43}$/);
    expect(h.codeOf(await h.enroll(code).expect(404))).toBe('DEVICE_ENROLLMENT.CODE_INVALID');
  });

  it('a retry with the same key gets a credential again while the tool never used the first answer, and not after', async () => {
    const machine = await h.signedMachine(await holder(), await notice());
    const code = await h.codeFor(machine.registrationId as string);
    const key = 'retry-key-0123456789abcdef';

    const first = h.dataOf<{ token: string }>(await h.enroll(code, key).expect(201)).token;
    const again = h.dataOf<{ token: string }>(await h.enroll(code, key).expect(201)).token;

    expect(first.split('_')[1]).toBe(again.split('_')[1]);
    expect(first).not.toBe(again);
    expect((await codeRow(machine.registrationId as string)).uses).toBe(1);
    await h.session(first).expect(401);
    await h.session(again).expect(200);
    expect(h.codeOf(await h.enroll(code, key).expect(404))).toBe('DEVICE_ENROLLMENT.CODE_INVALID');
  });

  it('two browser profiles share one code and an AI collector takes exactly one use, even when the exchanges race', async () => {
    const machine = await h.signedMachine(await holder(), await notice());
    const registrationId = machine.registrationId as string;
    const shared = await h.codeFor(registrationId, { collectorKind: 'BROWSER_EXTENSION', maxUses: 2 });

    const responses = await Promise.all([h.enroll(shared), h.enroll(shared), h.enroll(shared)]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 201, 404]);
    const own = await h.signedMachine(await holder(), await notice());
    const single = await h.codeFor(own.registrationId as string);
    const racing = await Promise.all([h.enroll(single), h.enroll(single)]);
    expect(racing.map((response) => response.status).sort()).toEqual([201, 404]);
  });

  it('refuses a code whose registration ended or whose machine was retired with the one answer', async () => {
    const version = await notice();
    const handed = await h.signedMachine(await holder(), version);
    const handedCode = await h.codeFor(handed.registrationId as string);
    await h.changeHolder(handed.id, (await holder()).employeeId).expect(201);
    const retired = await h.signedMachine(await holder(), version);
    const retiredCode = await h.codeFor(retired.registrationId as string);
    await h.retire(retired.id).expect(201);

    expect(h.codeOf(await h.enroll(handedCode).expect(404))).toBe('DEVICE_ENROLLMENT.CODE_INVALID');
    expect(h.codeOf(await h.enroll(retiredCode).expect(404))).toBe('DEVICE_ENROLLMENT.CODE_INVALID');
  });

  it('US-09-05 AC-13: tells a collector the state of its machine, and answers a person’s token and a collector’s token on the wrong routes with 401', async () => {
    const version = await notice();
    const person = await holder();
    const machine = await h.signedMachine(person, version);
    const { token } = await h.enrolled(machine.registrationId as string);

    const waiting = h.dataOf<SessionWire>(await h.session(token).expect(200));
    expect(waiting).toMatchObject({
      state: 'AWAITING_ACKNOWLEDGEMENT',
      acceptFromAt: null,
      acceptUntilAt: null,
      timezone: 'Asia/Ho_Chi_Minh',
    });
    const days = (Date.parse(waiting.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(89.9);
    expect(days).toBeLessThanOrEqual(90);

    await h.acknowledge(person, machine.registrationId as string, version.id).expect(201);
    const active = h.dataOf<SessionWire>(await h.session(token).expect(200));
    const detail = h.dataOf<DeviceWire>(await h.getDevice(machine.id).expect(200));
    expect(active).toMatchObject({ state: 'ACTIVE', acceptUntilAt: null });
    expect(active.acceptFromAt).toBe(detail.acknowledgedFrom);

    expect(h.codeOf(await h.session(person.accessToken).expect(401))).toBe('DEVICE.CREDENTIAL_INVALID');
    expect(h.codeOf(await h.session(token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')).expect(401))).toBe(
      'DEVICE.CREDENTIAL_INVALID',
    );
    expect(h.codeOf(await h.session('sstd_nonsense').expect(401))).toBe('DEVICE.CREDENTIAL_INVALID');
    const onUserRoute = await h.getDevice(machine.id, { ...h.it1, accessToken: token }).expect(401);
    expect(h.codeOf(onUserRoute)).toBe('INVALID_ACCESS_TOKEN');
  });

  it('rotates the secret: the old one works for a day or until the new one is used, a rotation with the old one extends nothing', async () => {
    const machine = await h.signedMachine(await holder(), await notice());
    const { token: first, credentialId } = await h.enrolled(machine.registrationId as string);
    await h.session(first).expect(200);

    const rotated = h.dataOf<{ token: string; expiresAt: string }>(await h.rotate(first).expect(201)).token;
    expect(rotated.split('_')[1]).toBe(credentialId);
    expect(rotated).not.toBe(first);
    await h.session(first).expect(200);
    const kept = await sql().query<{
      previous_secret_hash: string | null;
      previous_valid_until: Date | null;
      secret_used_at: Date | null;
    }>(`SELECT previous_secret_hash, previous_valid_until, secret_used_at FROM device_credentials WHERE id = $1`, [
      credentialId,
    ]);
    expect(kept.rows[0].previous_secret_hash).not.toBeNull();
    const graceHours = (kept.rows[0].previous_valid_until!.getTime() - Date.now()) / 3_600_000;
    expect(graceHours).toBeGreaterThan(23.5);
    expect(kept.rows[0].secret_used_at).toBeNull();

    // G-M2: the answer of the first rotation was lost, so the tool rotates again with the secret it still holds. Only the current secret
    // is replaced; the previous secret and its end stay as they were, and the old secret keeps working until its own day is over.
    const again = h.dataOf<{ token: string }>(await h.rotate(first).expect(201)).token;
    const afterOld = await sql().query<{ previous_secret_hash: string | null; previous_valid_until: Date | null }>(
      `SELECT previous_secret_hash, previous_valid_until FROM device_credentials WHERE id = $1`,
      [credentialId],
    );
    expect(afterOld.rows[0].previous_secret_hash).toBe(kept.rows[0].previous_secret_hash);
    expect(afterOld.rows[0].previous_valid_until!.getTime()).toBe(kept.rows[0].previous_valid_until!.getTime());
    await h.session(first).expect(200);
    expect(h.codeOf(await h.session(rotated).expect(401))).toBe('DEVICE.CREDENTIAL_INVALID');
    const third = h.dataOf<{ token: string }>(await h.rotate(first).expect(201)).token; // lost once more: still possible
    expect(third).not.toBe(again);
    expect(h.codeOf(await h.session(again).expect(401))).toBe('DEVICE.CREDENTIAL_INVALID');
    // The tool uses the secret it got: the first use of the current secret ends the old one.
    await h.session(third).expect(200);
    expect(h.codeOf(await h.session(first).expect(401))).toBe('DEVICE.CREDENTIAL_INVALID');
    await h.rotate(third).send({ extra: true }).expect(422);
  });
});
