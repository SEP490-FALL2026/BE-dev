import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { AuditApi } from '../../../src/modules/audit/public/audit.api';
import { PayloadCipher } from '../../../src/modules/notifications/email/payload-cipher.service';
import { bodyOf } from '../../support/api-body';
import {
  HttpTestApp,
  SEED_PASSWORD,
  SeededInstallation,
  createHttpTestApp,
  insertEmployeeFixture,
  seedInstallation,
} from '../../support/http-test-app';

const PASSWORD = 'a long enough passphrase';
const T0 = Date.parse('2026-09-01T00:00:00.000Z');
const MINUTE = 60_000;

interface Item {
  id: string;
  occurredAt: string;
  actorKind: string;
  actorAppUserId: string | null;
  actorRoles: string[];
  action: string;
  resourceType: string;
  resourceId: string;
  before: unknown;
  after: unknown;
  correlationId: string;
  operatorReference: string | null;
}

interface Page {
  items: Item[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

describe('Audit Trail query over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let adminToken: string;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    adminToken = (await loginAs(seed.superAdmin.email, SEED_PASSWORD)).accessToken;
  }, 90000);

  afterAll(async () => {
    await ctx?.close();
  });

  async function loginAs(email: string, password: string) {
    const response = await request(server()).post('/api/v1/auth/login').send({ email, password }).expect(200);

    return { accessToken: bodyOf(response).data.accessToken };
  }

  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });

  const list = (query: string, headers: Record<string, string> = asAdmin()) =>
    request(server()).get(`/api/v1/audit-events${query}`).set(headers);

  const pageOf = async (query: string): Promise<Page> => ((await list(query).expect(200)).body as { data: Page }).data;

  /** Records events the way every module does, in a transaction, at exact instants. */
  const recordSynthetic = async (
    count: number,
    options: {
      resourceType: string;
      resourceId?: string;
      actor?: string | null;
      action?: string;
      at: (index: number) => Date;
    },
  ): Promise<void> => {
    const runner = ctx.app.get(TransactionRunner);
    const audit = ctx.app.get(AuditApi);
    await runner.run(async (tx) => {
      for (let index = 0; index < count; index += 1) {
        await audit.record(tx, {
          organizationId: seed.organizationId,
          actorKind: options.actor === null ? 'SYSTEM' : 'USER',
          // `null` means the system acted; leaving `actor` out means the Super Admin did.
          actorAppUserId: options.actor === undefined ? seed.superAdmin.appUserId : options.actor,
          actorRoles: options.actor === null ? [] : ['SUPER_ADMIN'],
          action: options.action ?? 'PROBE.RECORDED',
          resourceType: options.resourceType,
          resourceId: options.resourceId ?? `probe-${index}`,
          before: null,
          after: { index },
          correlationId: randomUUID(),
          occurredAt: options.at(index),
        });
      }
    });
  };

  /** The oracle: what the database itself says the answer is, in the order the API promises. */
  const idsFromSql = async (where: string, params: unknown[] = []): Promise<string[]> =>
    (
      await ctx.sql.query<{ id: string }>(
        `SELECT id FROM audit_events WHERE ${where} ORDER BY occurred_at DESC, id DESC`,
        params,
      )
    ).rows.map((row) => row.id);

  const invitationToken = async (appUserId: string): Promise<string> => {
    const cipher = ctx.app.get(PayloadCipher, { strict: false });
    const { rows } = await ctx.sql.query<{ id: string; payload_key_id: string; payload_ciphertext: Buffer }>(
      `SELECT o.id, o.payload_key_id, o.payload_ciphertext FROM email_outbox o
         JOIN account_action_tokens t ON t.token_hash = o.action_token_hash
        WHERE t.app_user_id = $1 AND t.consumed_at IS NULL AND t.revoked_at IS NULL AND o.payload_ciphertext IS NOT NULL
        ORDER BY o.created_at DESC LIMIT 1`,
      [appUserId],
    );

    return cipher.decrypt(rows[0].id, rows[0].payload_key_id, rows[0].payload_ciphertext).token as string;
  };

  /** An account created and activated through the real workflow, holding exactly `role` (QĐ-95: one role per account). */
  const newAccount = async (role: string) => {
    counter += 1;
    const email = `audit.reader.${counter}@acme.vn`;
    const { employeeId } = await insertEmployeeFixture(ctx.app, seed, { code: `E-AU${counter}`, email });
    const created = await request(server())
      .post('/api/v1/app-users')
      .set(asAdmin())
      .send({ employeeId, role })
      .expect(201);
    const id = (created.body as { data: { id: string } }).data.id;
    await request(server())
      .post('/api/v1/auth/invitations/redeem')
      .send({ token: await invitationToken(id), password: PASSWORD })
      .expect(200);

    return { id, email, token: (await loginAs(email, PASSWORD)).accessToken };
  };

  describe('what the real workflows wrote', () => {
    it('lists them newest first with every field, attributed to the Super Admin', async () => {
      const account = await newAccount('IT_ADMIN');
      await request(server())
        .post(`/api/v1/app-users/${account.id}/lock`)
        .set(asAdmin())
        .send({ reason: 'Incident SEC-7: contain the account' })
        .expect(200);

      const page = await pageOf(`?resourceType=AppUser&resourceId=${account.id}`);

      const actions = page.items.map((item) => item.action);
      expect(actions[0]).toBe('APP_USER.LOCKED');
      expect(actions).toEqual(
        expect.arrayContaining(['APP_USER.CREATED', 'APP_USER.INVITATION_SENT', 'APP_USER.ACTIVATED']),
      );
      for (const item of page.items) {
        expect(Object.keys(item).sort()).toEqual(
          [
            'action',
            'actorAppUserId',
            'actorKind',
            'actorRoles',
            'after',
            'before',
            'correlationId',
            'id',
            'occurredAt',
            'operatorReference',
            'resourceId',
            'resourceType',
          ].sort(),
        );
        expect(item.resourceId).toBe(account.id);
        expect(new Date(item.occurredAt).toISOString()).toBe(item.occurredAt);
      }
      const locked = page.items[0];
      expect(locked).toMatchObject({
        actorKind: 'USER',
        actorAppUserId: seed.superAdmin.appUserId,
        actorRoles: ['SUPER_ADMIN'],
        before: { status: 'ACTIVE' },
        after: { status: 'LOCKED', reason: 'Incident SEC-7: contain the account' },
      });
    });

    it('answers the same set as the database, whichever filter is used', async () => {
      const lockedAccount = await newAccount('IT_ADMIN');
      await request(server())
        .post(`/api/v1/app-users/${lockedAccount.id}/lock`)
        .set(asAdmin())
        .send({ reason: 'Locked to compare the filters' })
        .expect(200);

      const byActor = await pageOf(`?actorAppUserId=${seed.superAdmin.appUserId}&pageSize=100`);
      const byAction = await pageOf('?action=APP_USER.LOCKED&pageSize=100');
      const byResource = await pageOf(`?resourceType=AppUser&pageSize=100`);

      const expectedActor = await idsFromSql('actor_app_user_id = $1', [seed.superAdmin.appUserId]);
      expect(byActor.items.map((item) => item.id)).toEqual(expectedActor.slice(0, 100));
      expect(byActor.pagination.totalItems).toBe(expectedActor.length);
      expect(byAction.items.map((item) => item.id)).toEqual(await idsFromSql(`action = 'APP_USER.LOCKED'`));
      expect(byResource.items.map((item) => item.id)).toEqual(
        (await idsFromSql(`resource_type = 'AppUser'`)).slice(0, 100),
      );
    });

    it('does not mistake a resource id for an id of another type', async () => {
      await recordSynthetic(1, { resourceType: 'TypeA', resourceId: 'shared-id', at: () => new Date(T0) });
      await recordSynthetic(1, { resourceType: 'TypeB', resourceId: 'shared-id', at: () => new Date(T0) });

      const onlyA = await pageOf('?resourceType=TypeA&resourceId=shared-id');

      expect(onlyA.items.map((item) => item.resourceType)).toEqual(['TypeA']);
      expect(onlyA.pagination.totalItems).toBe(1);
    });
  });

  describe('time window and paging, on events placed at exact instants', () => {
    it('reads the window as [from, to): the start is in, the end is out, and it agrees with the database', async () => {
      await recordSynthetic(25, {
        resourceType: 'WindowProbe',
        at: (index) => new Date(T0 + index * MINUTE),
      });
      const from = new Date(T0 + 5 * MINUTE).toISOString();
      const to = new Date(T0 + 10 * MINUTE).toISOString();

      const window = await pageOf(`?resourceType=WindowProbe&occurredFrom=${from}&occurredTo=${to}`);

      expect(window.items.map((item) => item.occurredAt)).toEqual(
        [9, 8, 7, 6, 5].map((minute) => new Date(T0 + minute * MINUTE).toISOString()),
      );
      expect(window.items.map((item) => item.id)).toEqual(
        await idsFromSql(`resource_type = 'WindowProbe' AND occurred_at >= $1 AND occurred_at < $2`, [from, to]),
      );
      // An open end on either side, and an offset other than UTC for the same instants.
      expect((await pageOf(`?resourceType=WindowProbe&occurredFrom=${to}`)).pagination.totalItems).toBe(15);
      expect((await pageOf(`?resourceType=WindowProbe&occurredTo=${from}`)).pagination.totalItems).toBe(5);
      const withOffset = await pageOf(
        `?resourceType=WindowProbe&occurredFrom=${encodeURIComponent('2026-09-01T07:05:00+07:00')}&occurredTo=${encodeURIComponent('2026-09-01T07:10:00+07:00')}`,
      );
      expect(withOffset.items.map((item) => item.id)).toEqual(window.items.map((item) => item.id));
    });

    it('combines the filters, each one narrowing the others', async () => {
      await recordSynthetic(6, {
        resourceType: 'ComboProbe',
        actor: null,
        action: 'PROBE.SYSTEM',
        at: (i) => new Date(T0 + i * MINUTE),
      });
      await recordSynthetic(6, {
        resourceType: 'ComboProbe',
        action: 'PROBE.USER',
        at: (i) => new Date(T0 + i * MINUTE),
      });

      const system = await pageOf(
        `?resourceType=ComboProbe&action=PROBE.SYSTEM&occurredFrom=${new Date(T0 + 2 * MINUTE).toISOString()}`,
      );
      const byUser = await pageOf(`?resourceType=ComboProbe&actorAppUserId=${seed.superAdmin.appUserId}`);

      expect(system.items).toHaveLength(4);
      expect(system.items.every((item) => item.actorKind === 'SYSTEM' && item.actorAppUserId === null)).toBe(true);
      expect(byUser.items).toHaveLength(6);
      expect(byUser.items.every((item) => item.action === 'PROBE.USER')).toBe(true);
    });

    it('pages 25 events as 10 + 10 + 5, with the true total, and an empty fourth page', async () => {
      await recordSynthetic(25, { resourceType: 'PagedProbe', at: (index) => new Date(T0 + index * MINUTE) });
      const query = (page: number) => `?resourceType=PagedProbe&pageSize=10&page=${page}`;

      const [first, second, third, fourth] = [
        await pageOf(query(1)),
        await pageOf(query(2)),
        await pageOf(query(3)),
        await pageOf(query(4)),
      ];

      expect([first.items.length, second.items.length, third.items.length, fourth.items.length]).toEqual([
        10, 10, 5, 0,
      ]);
      for (const page of [first, second, third, fourth]) {
        expect(page.pagination.totalItems).toBe(25);
        expect(page.pagination.totalPages).toBe(3);
      }
      expect([...first.items, ...second.items, ...third.items].map((item) => item.id)).toEqual(
        await idsFromSql(`resource_type = 'PagedProbe'`),
      );
    });

    it('keeps a fixed order across pages when many events share one instant: none skipped, none repeated', async () => {
      await recordSynthetic(7, { resourceType: 'TieProbe', at: () => new Date(T0) });

      const seen: string[] = [];
      for (let page = 1; page <= 4; page += 1) {
        seen.push(...(await pageOf(`?resourceType=TieProbe&pageSize=2&page=${page}`)).items.map((item) => item.id));
      }

      expect(seen).toEqual(await idsFromSql(`resource_type = 'TieProbe'`));
      expect(new Set(seen).size).toBe(7);
      // Same instant, so the id decides: strictly descending.
      expect([...seen].sort().reverse()).toEqual(seen);
    });

    it('turns away a window that is empty or reversed, and a page size past 100', async () => {
      await list('?occurredFrom=2026-09-01T00:00:00Z&occurredTo=2026-09-01T00:00:00Z').expect(422);
      await list('?occurredFrom=2026-09-02T00:00:00Z&occurredTo=2026-09-01T00:00:00Z').expect(422);
      await list('?pageSize=101').expect(422);
      await list('?resourceId=abc').expect(422);
    });
  });

  describe('who may read it (US-01-06 AC-5, AC-6)', () => {
    it.each([
      ['an employee', 'EMPLOYEE'],
      ['an IT administrator', 'IT_ADMIN'],
      ['the finance officer', 'FINANCE'],
      ['a department head', 'MANAGER'],
    ])('refuses %s with 403 and returns no data', async (_name, role) => {
      const account = await newAccount(role);

      const response = await list('', { Authorization: `Bearer ${account.token}` }).expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
      expect(JSON.stringify(response.body)).not.toContain('APP_USER.CREATED');
    });

    it('refuses a request with no token, and one whose account was locked after the token was issued', async () => {
      await request(server()).get('/api/v1/audit-events').expect(401);
      const account = await newAccount('IT_ADMIN');
      await list('', { Authorization: `Bearer ${account.token}` }).expect(403);

      await request(server())
        .post(`/api/v1/app-users/${account.id}/lock`)
        .set(asAdmin())
        .send({ reason: 'Locked to end the session' })
        .expect(200);

      const response = await list('', { Authorization: `Bearer ${account.token}` }).expect(401);
      expect(bodyOf(response).error.code).toBe('INVALID_ACCESS_TOKEN');
    });
  });

  describe('reading is not writing (AC-2 regression)', () => {
    it('adds nothing to the trail, however many times it is read', async () => {
      const count = async () =>
        (await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM audit_events')).rows[0].n;
      const before = await count();

      await list('').expect(200);
      await list('?resourceType=AppUser&pageSize=5').expect(200);
      await list('?actorAppUserId=not-a-uuid').expect(422);

      expect(await count()).toBe(before);
    });

    it('still refuses to change or remove an event, whatever the reader does', async () => {
      await recordSynthetic(1, { resourceType: 'ImmutableProbe', at: () => new Date(T0) });

      await expect(
        ctx.sql.query(`UPDATE audit_events SET action = 'TAMPERED' WHERE resource_type = 'ImmutableProbe'`),
      ).rejects.toThrow();
      await expect(ctx.sql.query(`DELETE FROM audit_events WHERE resource_type = 'ImmutableProbe'`)).rejects.toThrow();
    });
  });

  describe('the index that serves a read with no actor filter', () => {
    it('exists and covers (time desc, id desc): the order of the unfiltered page', async () => {
      const index = await ctx.sql.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes WHERE tablename = 'audit_events' AND indexname = 'audit_events_occurred_at_id_idx'`,
      );

      expect(index.rows).toHaveLength(1);
      expect(index.rows[0].indexdef).toMatch(/(occurred_at DESC, id DESC)/);
    });
  });

  describe('the index that serves the filter by actor', () => {
    it('exists and covers (actor, time desc, id desc), the order the query sorts by', async () => {
      const index = await ctx.sql.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes WHERE tablename = 'audit_events' AND indexname = 'audit_events_actor_app_user_id_occurred_at_id_idx'`,
      );

      expect(index.rows).toHaveLength(1);
      expect(index.rows[0].indexdef).toMatch(/\(actor_app_user_id, occurred_at DESC, id DESC\)/);
    });
  });
});
