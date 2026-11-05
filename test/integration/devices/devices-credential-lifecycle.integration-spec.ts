import { Client } from 'pg';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';
import { CredentialRepo } from '../../../src/modules/devices/credential/credential.repo';
import { DeviceCredentialRevokedError } from '../../../src/modules/devices/public/devices.errors';
import { DevicesApi } from '../../../src/modules/devices/public/devices.api';
import { ApiAccount } from '../../support/api-accounts';
import { DevicesHarness, type CredentialWire, type DeviceWire } from '../../support/devices-harness';

const h = new DevicesHarness();

async function sqlState(sql: Client, text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('revoking, ending and reading credentials (integration, real PostgreSQL)', () => {
  let counter = 0;
  const sql = (): Client => h.ctx.sql;
  const runner = (): TransactionRunner => h.ctx.app.get(TransactionRunner);
  const devices = (): DevicesApi => h.ctx.app.get(DevicesApi);
  const holder = async (): Promise<ApiAccount> => {
    counter += 1;
    return h.account(`E-LIFE${counter}`, await h.person(`E-LIFE${counter}`), 'EMPLOYEE');
  };
  const credentialsOf = async (registrationId: string): Promise<CredentialWire[]> =>
    h.dataOf<{ items: CredentialWire[] }>(await h.listCredentials(registrationId).expect(200)).items;

  beforeAll(async () => {
    await h.start();
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('US-09-01 AC-13: the IT Admin sees who has connected and cuts one off; the very next request of the tool is a 401 REVOKED', async () => {
    const machine = await h.signedMachine(await holder(), await h.published());
    const registrationId = machine.registrationId as string;
    const extension = await h.enrolled(registrationId, { collectorKind: 'BROWSER_EXTENSION', maxUses: 2 });
    const other = await h.enrolled(registrationId, { collectorKind: 'BROWSER_EXTENSION' }).catch(() => null);
    await h.session(extension.token).expect(200);

    const listed = await credentialsOf(registrationId);
    expect(listed.find((item) => item.id === extension.credentialId)).toMatchObject({
      collectorKind: 'BROWSER_EXTENSION',
      revokedAt: null,
      revocationCause: null,
    });
    await h.revokeCredential(extension.credentialId, '   ').expect(422);
    const revoked = h.dataOf<CredentialWire>(
      await h.revokeCredential(extension.credentialId, 'The profile was lost.').expect(201),
    );

    expect(revoked).toMatchObject({ revocationCause: 'IT_ADMIN', revocationReason: 'The profile was lost.' });
    expect(revoked.revokedAt).not.toBeNull();
    expect(h.codeOf(await h.session(extension.token).expect(401))).toBe('DEVICE.CREDENTIAL_REVOKED');
    expect(h.codeOf(await h.revokeCredential(extension.credentialId).expect(409))).toBe(
      'DEVICE_CREDENTIAL.ALREADY_REVOKED',
    );
    expect(h.codeOf(await h.revokeCredential('3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11').expect(404))).toBe(
      'DEVICE_CREDENTIAL.NOT_FOUND',
    );
    expect(h.codeOf(await h.listCredentials('3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11').expect(404))).toBe(
      'DEVICE_REGISTRATION.NOT_FOUND',
    );
    expect(other === null || (await h.session(other.token)).status === 200).toBe(true);
  });

  it('US-09-08 AC-5: a registration that ends takes every credential of it at that instant — a new holder, a retired machine, a person who left', async () => {
    const version = await h.published();
    const given = await h.signedMachine(await holder(), version);
    const givenCredential = await h.enrolled(given.registrationId as string);
    const retired = await h.signedMachine(await holder(), version);
    const retiredCredential = await h.enrolled(retired.registrationId as string);
    const leaver = await holder();
    const left = await h.signedMachine(leaver, version);
    const leftCredential = await h.enrolled(left.registrationId as string);

    await h.changeHolder(given.id, (await holder()).employeeId).expect(201);
    await h.retire(retired.id).expect(201);
    await runner().run((tx) =>
      devices().endRegistrationsOfHolder(tx, {
        employeeId: leaver.employeeId,
        end: { at: new Date() },
        cause: 'EMPLOYEE_LEFT',
      }),
    );

    for (const credential of [givenCredential, retiredCredential, leftCredential]) {
      expect(h.codeOf(await h.session(credential.token).expect(401))).toBe('DEVICE.CREDENTIAL_REVOKED');
    }
    const rows = await sql().query<{ revoked_at: Date; ended_at: Date; revocation_cause: string }>(
      `SELECT c.revoked_at, r.ended_at, c.revocation_cause
         FROM device_credentials c JOIN device_registrations r ON r.id = c.registration_id WHERE c.id = ANY($1::uuid[])`,
      [[givenCredential.credentialId, retiredCredential.credentialId, leftCredential.credentialId]],
    );
    expect(rows.rows).toHaveLength(3);
    for (const row of rows.rows) {
      expect(row.revocation_cause).toBe('REGISTRATION_ENDED');
      expect(row.revoked_at.getTime()).toBe(row.ended_at.getTime());
    }
    expect(h.codeOf(await h.enroll(await Promise.resolve('ABCD-EFGH-JKMN')).expect(404))).toBe(
      'DEVICE_ENROLLMENT.CODE_INVALID',
    );
    const audits = await sql().query<{ actor_kind: string }>(
      `SELECT actor_kind FROM audit_events WHERE action = 'DEVICE_CREDENTIAL.REVOKED' AND resource_id = $1`,
      [leftCredential.credentialId],
    );
    expect(audits.rows).toEqual([{ actor_kind: 'SYSTEM' }]);
  });

  it('a new registration of the same machine needs a new code: the credential of the old holder is not reborn', async () => {
    const version = await h.published();
    const first = await holder();
    const machine = await h.signedMachine(first, version);
    const old = await h.enrolled(machine.registrationId as string);
    const second = await holder();

    const changed = h.dataOf<DeviceWire>(await h.changeHolder(machine.id, second.employeeId).expect(201));
    await h.signed(changed.registrationId as string, version.id);

    expect(h.codeOf(await h.session(old.token).expect(401))).toBe('DEVICE.CREDENTIAL_REVOKED');
    const fresh = await h.enrolled(changed.registrationId as string);
    await h.session(fresh.token).expect(200);
    expect(fresh.credentialId).not.toBe(old.credentialId);
  });

  it('US-09-05 AC-13: a credential that expired, or whose holder was terminated, is refused with its own answer', async () => {
    const version = await h.published();
    const expiring = await h.signedMachine(await holder(), version);
    const expired = await h.enrolled(expiring.registrationId as string);
    await sql().query(`UPDATE device_credentials SET expires_at = issued_at + interval '1 millisecond' WHERE id = $1`, [
      expired.credentialId,
    ]);
    const person = await holder();
    const terminated = await h.signedMachine(person, version);
    const gone = await h.enrolled(terminated.registrationId as string);

    expect(h.codeOf(await h.session(expired.token).expect(401))).toBe('DEVICE.CREDENTIAL_EXPIRED');
    expect(h.codeOf(await h.rotate(expired.token).expect(401))).toBe('DEVICE.CREDENTIAL_EXPIRED');
    await sql().query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [person.employeeId]);
    expect(h.codeOf(await h.session(gone.token).expect(401))).toBe('DEVICE.CREDENTIAL_REVOKED');
  });

  it('QĐ-100q: a block of the last working day refuses the token of the machine from that day (REVOKED), before it not at all, and lifting the block gives it back', async () => {
    const version = await h.published();
    const person = await holder();
    const machine = await h.signedMachine(person, version);
    const tool = await h.enrolled(machine.registrationId as string);
    const today = await h.ctx.app.get(OrganizationReadApi).businessToday();
    const block = (cause: string, offsetDays: number): Promise<unknown> =>
      sql().query(
        `INSERT INTO employee_access_blocks (employee_id, organization_id, blocked_from, cause)
         SELECT id, organization_id, $2::date + $3::int, $4 FROM employees WHERE id = $1
         ON CONFLICT (employee_id) DO UPDATE SET blocked_from = EXCLUDED.blocked_from, cause = EXCLUDED.cause`,
        [person.employeeId, today, offsetDays, cause],
      );
    const wrongSecret = `${tool.token.slice(0, -1)}${tool.token.endsWith('A') ? 'B' : 'A'}`;

    await block('DEPARTURE_LAST_DAY', 1); // the last working day is still ahead: the block acts tomorrow
    await h.session(tool.token).expect(200);
    await block('DEPARTURE_LAST_DAY', 0); // the block begins today
    expect(h.codeOf(await h.session(tool.token).expect(401))).toBe('DEVICE.CREDENTIAL_REVOKED');
    expect(h.codeOf(await h.rotate(tool.token).expect(401))).toBe('DEVICE.CREDENTIAL_REVOKED');
    expect(h.codeOf(await h.session(wrongSecret).expect(401))).toBe('DEVICE.CREDENTIAL_INVALID');
    await block('DEPARTURE_BLOCK_NOW', -3); // BLOCK_NOW with a day already behind
    expect(h.codeOf(await h.session(tool.token).expect(401))).toBe('DEVICE.CREDENTIAL_REVOKED');
    await sql().query('DELETE FROM employee_access_blocks WHERE employee_id = $1', [person.employeeId]);
    await h.session(tool.token).expect(200);
  });

  it('G-L3: a second AI collector credential on a registration takes the first one away; a browser extension credential does not', async () => {
    const machine = await h.signedMachine(await holder(), await h.published());
    const registrationId = machine.registrationId as string;
    const first = await h.enrolled(registrationId);
    const browser = await h.enrolled(registrationId, { collectorKind: 'BROWSER_EXTENSION' });
    await h.session(first.token).expect(200);

    const second = await h.enrolled(registrationId);

    expect(h.codeOf(await h.session(first.token).expect(401))).toBe('DEVICE.CREDENTIAL_REVOKED');
    await h.session(second.token).expect(200);
    await h.session(browser.token).expect(200);
    const rows = await sql().query<{ id: string; revocation_cause: string | null }>(
      `SELECT id, revocation_cause FROM device_credentials WHERE registration_id = $1 ORDER BY issued_at`,
      [registrationId],
    );
    expect(rows.rows.map((row) => row.revocation_cause)).toEqual(['REPLACED', null, null]);
    const audit = await sql().query<{ count: string }>(
      `SELECT count(*) FROM audit_events WHERE action = 'DEVICE_CREDENTIAL.REVOKED' AND resource_id = $1`,
      [first.credentialId],
    );
    expect(Number(audit.rows[0].count)).toBe(1);
  });

  it('G-L1: only the secret that was checked is marked used: a hash the credential no longer has marks nothing', async () => {
    const machine = await h.signedMachine(await holder(), await h.published());
    const tool = await h.enrolled(machine.registrationId as string);
    const rotated = h.dataOf<{ token: string }>(await h.rotate(tool.token).expect(201)).token;
    const current = await sql().query<{ secret_hash: string }>(
      'SELECT secret_hash FROM device_credentials WHERE id = $1',
      [tool.credentialId],
    );
    const repo = h.ctx.app.get(CredentialRepo);

    await repo.markSecretUsed(tool.credentialId, 'a-hash-the-credential-no-longer-has', new Date());
    let row = await sql().query<{ secret_used_at: Date | null }>(
      'SELECT secret_used_at FROM device_credentials WHERE id = $1',
      [tool.credentialId],
    );
    expect(row.rows[0].secret_used_at).toBeNull();
    await repo.markSecretUsed(tool.credentialId, current.rows[0].secret_hash, new Date());
    row = await sql().query<{ secret_used_at: Date | null }>(
      'SELECT secret_used_at FROM device_credentials WHERE id = $1',
      [tool.credentialId],
    );
    expect(row.rows[0].secret_used_at).not.toBeNull();
    await h.session(rotated).expect(200);
  });

  it('reads the machine behind a credential for the intake, and keeps the latest instant the server accepted data', async () => {
    const version = await h.published({ includesToolStatus: true, requiresReacknowledgement: true });
    const person = await holder();
    const machine = await h.signedMachine(person, version);
    const { credentialId } = await h.enrolled(machine.registrationId as string);
    const read = () => runner().run((tx) => devices().getIntakeContext(tx, credentialId));

    expect(await read()).toMatchObject({
      deviceId: machine.id,
      registrationId: machine.registrationId,
      credentialId,
      state: 'AWAITING_ACKNOWLEDGEMENT',
      acceptFromAt: null,
      toolStatusAcknowledged: false,
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    await h.acknowledge(person, machine.registrationId as string, version.id).expect(201);
    expect(await read()).toMatchObject({ state: 'ACTIVE', toolStatusAcknowledged: true });
    const later = new Date('2026-11-05T10:00:00.000Z');
    await runner().run((tx) => devices().recordAccepted(tx, credentialId, later));
    await runner().run((tx) => devices().recordAccepted(tx, credentialId, new Date('2026-11-01T10:00:00.000Z')));
    const listed = await credentialsOf(machine.registrationId as string);
    expect(listed.find((item) => item.id === credentialId)?.lastAcceptedAt).toBe(later.toISOString());

    await h.revokeCredential(credentialId).expect(201);
    await expect(read()).rejects.toBeInstanceOf(DeviceCredentialRevokedError);
  });

  it('TC-01: the database refuses a code used more than allowed, an AI collector with many uses, a credential that moves, and a revoked one that changes', async () => {
    const machine = await h.signedMachine(await holder(), await h.published());
    const registrationId = machine.registrationId as string;
    const { credentialId } = await h.enrolled(registrationId);

    expect(
      await sqlState(sql(), `UPDATE device_enrollment_codes SET uses = 2 WHERE registration_id = $1`, [registrationId]),
    ).toBe('23514');
    expect(
      await sqlState(sql(), `UPDATE device_enrollment_codes SET max_uses = 3 WHERE registration_id = $1`, [
        registrationId,
      ]),
    ).toBe('55000');
    expect(
      await sqlState(sql(), `DELETE FROM device_enrollment_codes WHERE registration_id = $1`, [registrationId]),
    ).toBe('55000');
    expect(
      await sqlState(sql(), `UPDATE device_credentials SET collector_kind = 'BROWSER_EXTENSION' WHERE id = $1`, [
        credentialId,
      ]),
    ).toBe('55000');
    expect(await sqlState(sql(), `DELETE FROM device_credentials WHERE id = $1`, [credentialId])).toBe('55000');
    expect(
      await sqlState(sql(), `UPDATE device_credentials SET revoked_at = now() WHERE id = $1`, [credentialId]),
    ).toBe('23514');
    await h.revokeCredential(credentialId).expect(201);
    expect(
      await sqlState(sql(), `UPDATE device_credentials SET expires_at = expires_at + interval '1 day' WHERE id = $1`, [
        credentialId,
      ]),
    ).toBe('55000');
    for (const statement of [
      `UPDATE device_enrollment_uses SET used_at = now()`,
      `DELETE FROM device_enrollment_uses`,
      `TRUNCATE device_enrollment_uses`,
    ]) {
      expect(await sqlState(sql(), statement)).toBe('55000');
    }
  });

  it('keeps every token, code and secret out of the Audit Trail, and writes an event for each step', async () => {
    const machine = await h.signedMachine(await holder(), await h.published());
    const { token, credentialId } = await h.enrolled(machine.registrationId as string);
    await h.rotate(token).expect(201);
    await h.revokeCredential(credentialId).expect(201);

    const events = await sql().query<{ action: string; actor_kind: string }>(
      `SELECT action, actor_kind FROM audit_events WHERE action LIKE 'DEVICE_CREDENTIAL%' OR action LIKE 'DEVICE_ENROLLMENT%' ORDER BY occurred_at`,
    );
    const secret = token.split('_')[2];
    const leaked = await sql().query(`SELECT 1 FROM audit_events WHERE before::text LIKE $1 OR after::text LIKE $1`, [
      `%${secret}%`,
    ]);
    const keys = await sql().query(
      `SELECT 1 FROM audit_events e, LATERAL jsonb_object_keys(coalesce(e.after, '{}'::jsonb)) k
        WHERE (e.action LIKE 'DEVICE_CREDENTIAL%' OR e.action LIKE 'DEVICE_ENROLLMENT%')
          AND k ~* 'pass|hash|token|secret|cookie|credential|authorization|pepper'`,
    );

    expect(events.rows).toEqual(
      expect.arrayContaining([
        { action: 'DEVICE_ENROLLMENT_CODE.CREATED', actor_kind: 'USER' },
        { action: 'DEVICE_CREDENTIAL.ISSUED', actor_kind: 'DEVICE' },
        { action: 'DEVICE_CREDENTIAL.ROTATED', actor_kind: 'DEVICE' },
        { action: 'DEVICE_CREDENTIAL.REVOKED', actor_kind: 'USER' },
      ]),
    );
    expect(leaked.rowCount).toBe(0);
    expect(keys.rowCount).toBe(0);
  });
});
