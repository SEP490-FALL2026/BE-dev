import request from 'supertest';
import { OBJECT_STORAGE } from '../../../src/infrastructure/object-storage/object-storage.port';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { ProfilePurgeService } from '../../../src/modules/identity-access/profile/profile-purge.service';
import { IdentityAccessApi } from '../../../src/modules/identity-access/public/identity-access.api';
import { AccountManagementHttpHarness, dataOf } from '../../support/account-management-http-harness';
import { bodyOf } from '../../support/api-body';
import { FakeObjectStorage } from '../../support/fake-object-storage';
import { SEED_PASSWORD, createHttpTestApp, seedInstallation } from '../../support/http-test-app';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);

class ProfileHarness extends AccountManagementHttpHarness {
  readonly storage = new FakeObjectStorage();

  override async start() {
    this.ctx = await createHttpTestApp({ providerOverrides: [{ token: OBJECT_STORAGE, useValue: this.storage }] });
    this.seed = await seedInstallation(this.ctx.app);
    this.adminToken = (await this.signIn(this.seed.superAdmin.email, SEED_PASSWORD)).token;
  }
}

const h = new ProfileHarness();

interface ProfileColumns {
  avatar_object_key: string | null;
  avatar_content_type: string | null;
  avatar_updated_at: Date | null;
  work_phone: string | null;
}

/**
 * The picture and the work phone of a person against real PostgreSQL (`PF-1`, `QĐ-111at`…`QĐ-111av`, `MAJ-12`): what an upload writes, what a
 * replacement queues, that the departure of the person drops both columns and queues the object once, and that the sweeper deletes an object
 * one time however many passes run.
 */
describe('profile of a person (integration, real PostgreSQL)', () => {
  const columnsOf = async (appUserId: string): Promise<ProfileColumns> =>
    (
      await h.ctx.sql.query<ProfileColumns>(
        `SELECT avatar_object_key, avatar_content_type, avatar_updated_at, work_phone FROM app_users WHERE id = $1`,
        [appUserId],
      )
    ).rows[0];
  const queued = async (appUserId: string): Promise<{ object_key: string; purged_at: Date | null }[]> =>
    (
      await h.ctx.sql.query<{ object_key: string; purged_at: Date | null }>(
        `SELECT object_key, purged_at FROM avatar_purges WHERE object_key LIKE $1 ORDER BY requested_at, id`,
        [`avatars/${h.seed.organizationId}/${appUserId}/%`],
      )
    ).rows;
  const person = async () => {
    const account = await h.activatedAccount(['EMPLOYEE']);
    const { token } = await h.signIn(account.email, account.password);

    return { ...account, token };
  };
  const upload = (token: string, bytes: Buffer = PNG, contentType = 'image/png') =>
    request(h.server())
      .put('/api/v1/me/avatar')
      .set(h.as(token))
      .attach('file', bytes, { filename: 'me.png', contentType });
  const purge = () => h.ctx.app.get(ProfilePurgeService, { strict: false });

  beforeAll(async () => {
    await h.start();
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  afterEach(async () => {
    await h.afterEach();
  });

  it('keeps an uploaded picture under a key of the account, with its type and time, and shows a link to it in GET /me', async () => {
    const me = await person();

    const response = await upload(me.token).expect(200);
    const columns = await columnsOf(me.appUserId);

    expect(columns.avatar_object_key).toMatch(
      new RegExp(`^avatars/${h.seed.organizationId}/${me.appUserId}/.+\\.png$`),
    );
    expect(columns.avatar_content_type).toBe('image/png');
    expect(columns.avatar_updated_at).not.toBeNull();
    expect(h.storage.objects.has(columns.avatar_object_key!)).toBe(true);
    expect(dataOf<{ avatar: { url: string } | null }>(response).avatar?.url).toContain(columns.avatar_object_key!);
    const profile = dataOf<{ avatar: { url: string } | null }>(
      await request(h.server()).get('/api/v1/me').set(h.as(me.token)).expect(200),
    );
    expect(profile.avatar?.url).toContain(columns.avatar_object_key!);
  });

  it('refuses a file that is not a picture by its signature and leaves the account and the storage as they were', async () => {
    const me = await person();
    const writtenBefore = h.storage.written.length;

    const response = await upload(me.token, Buffer.from('not a picture at all'), 'image/png').expect(415);

    expect(bodyOf(response).error.code).toBeDefined();
    expect((await columnsOf(me.appUserId)).avatar_object_key).toBeNull();
    expect(h.storage.written).toHaveLength(writtenBefore);
  });

  it('queues the old object when a new picture replaces it, and the sweeper deletes it once however many passes run', async () => {
    const me = await person();
    await upload(me.token).expect(200);
    const first = (await columnsOf(me.appUserId)).avatar_object_key!;

    await upload(me.token).expect(200);
    const second = (await columnsOf(me.appUserId)).avatar_object_key!;

    expect(second).not.toBe(first);
    expect(await queued(me.appUserId)).toEqual([{ object_key: first, purged_at: null }]);
    expect(h.storage.objects.has(first)).toBe(true);

    expect(await purge().purgeDue()).toBeGreaterThanOrEqual(1);
    expect(h.storage.objects.has(first)).toBe(false);
    expect(h.storage.objects.has(second)).toBe(true);
    const deletedOnce = h.storage.deleted.filter((key) => key === first);
    expect(deletedOnce).toHaveLength(1);

    expect(await purge().purgeDue()).toBe(0);
    expect(h.storage.deleted.filter((key) => key === first)).toHaveLength(1);
    expect((await queued(me.appUserId))[0].purged_at).not.toBeNull();
  });

  it('drops the picture on DELETE /me/avatar, queues its object, and a second DELETE changes nothing', async () => {
    const me = await person();
    await upload(me.token).expect(200);
    const key = (await columnsOf(me.appUserId)).avatar_object_key!;

    await request(h.server()).delete('/api/v1/me/avatar').set(h.as(me.token)).expect(200);
    await request(h.server()).delete('/api/v1/me/avatar').set(h.as(me.token)).expect(200);

    const columns = await columnsOf(me.appUserId);
    expect([columns.avatar_object_key, columns.avatar_content_type, columns.avatar_updated_at]).toEqual([
      null,
      null,
      null,
    ]);
    expect(await queued(me.appUserId)).toEqual([{ object_key: key, purged_at: null }]);
  });

  it('keeps the work phone as digits, clears it with null, and never writes the number into the audit trail', async () => {
    const me = await person();

    const changed = await request(h.server())
      .patch('/api/v1/me/profile')
      .set(h.as(me.token))
      .send({ workPhone: '+84 90 123 4567' })
      .expect(200);

    expect(dataOf<{ workPhone: string }>(changed).workPhone).toBe('+84901234567');
    expect((await columnsOf(me.appUserId)).work_phone).toBe('+84901234567');
    const audit = await h.ctx.sql.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_events WHERE action = 'PROFILE.WORK_PHONE_CHANGED' AND resource_id = $1
          AND (before::text LIKE '%84901234567%' OR after::text LIKE '%84901234567%')`,
      [me.appUserId],
    );
    expect(audit.rows[0].n).toBe(0);
    expect(await h.countAudit('PROFILE.WORK_PHONE_CHANGED', me.appUserId)).toBe(1);

    await request(h.server()).patch('/api/v1/me/profile').set(h.as(me.token)).send({ workPhone: null }).expect(200);
    expect((await columnsOf(me.appUserId)).work_phone).toBeNull();
  });

  it('refuses at the database an account that points at a picture without its type, and a number that is not a phone', async () => {
    const me = await person();

    await expect(
      h.ctx.sql.query(`UPDATE app_users SET avatar_object_key = 'avatars/x' WHERE id = $1`, [me.appUserId]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      h.ctx.sql.query(`UPDATE app_users SET work_phone = 'call me' WHERE id = $1`, [me.appUserId]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('drops the picture and the phone when the person leaves, queues the object once, and a repeat of the departure changes nothing', async () => {
    const me = await person();
    await upload(me.token).expect(200);
    await request(h.server())
      .patch('/api/v1/me/profile')
      .set(h.as(me.token))
      .send({ workPhone: '0901234567' })
      .expect(200);
    const key = (await columnsOf(me.appUserId)).avatar_object_key!;
    const runner = h.ctx.app.get(TransactionRunner);
    const identity = h.ctx.app.get(IdentityAccessApi, { strict: false });

    await runner.run((tx) => identity.markEmployeeLeft(tx, me.employeeId, '2026-11-14'));
    await runner.run((tx) => identity.markEmployeeLeft(tx, me.employeeId, '2026-11-14'));

    const columns = await columnsOf(me.appUserId);
    expect([
      columns.avatar_object_key,
      columns.avatar_content_type,
      columns.avatar_updated_at,
      columns.work_phone,
    ]).toEqual([null, null, null, null]);
    expect(await queued(me.appUserId)).toEqual([{ object_key: key, purged_at: null }]);
    // The departure never touched the storage: only the sweeper does, after the commit.
    expect(h.storage.objects.has(key)).toBe(true);

    expect(await purge().purgeDue()).toBeGreaterThanOrEqual(1);
    expect(h.storage.objects.has(key)).toBe(false);
    expect(await purge().purgeDue()).toBe(0);
  });
});
