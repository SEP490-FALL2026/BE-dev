import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { InvalidInAppNotificationError } from '../../../src/modules/notifications/public/notifications.errors';
import { NotificationsApi } from '../../../src/modules/notifications/public/notifications.api';
import type { InAppNotificationInput } from '../../../src/modules/notifications/public/notifications.types';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements } from '../../support/query-count';
import { StatusHarness, type NoticeWire } from '../../support/status-harness';

const h = new StatusHarness();
const RESTRICT = '23001';
const UNIQUE = '23505';
const CHECK = '23514';
let relay: PgRelay;
let counter: QueryCounter;

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await h.ctx.sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('the inbox of the application over PostgreSQL (FR-3.11, US-05-15 AC-7, AC-10)', () => {
  const runner = () => h.ctx.app.get(TransactionRunner, { strict: false });
  const notifications = () => h.ctx.app.get(NotificationsApi, { strict: false });
  const SUBJECT = randomUUID();
  let alice: { employeeId: string; account: Parameters<typeof h.inbox>[0] };
  let bob: { employeeId: string; account: Parameters<typeof h.inbox>[0] };

  const notice = (
    recipientEmployeeId: string,
    overrides: Partial<InAppNotificationInput> = {},
  ): InAppNotificationInput => ({
    organizationId: h.seed.organizationId,
    recipientEmployeeId,
    code: 'REQUEST_GRANTED',
    subject: { type: 'ACCESS_REQUEST', id: SUBJECT },
    params: { requestId: SUBJECT, accessGuide: 'LOGIN_WITH_WORK_ACCOUNT', homepageUrl: null },
    eventKey: randomUUID(),
    ...overrides,
  });
  const give = (input: InAppNotificationInput) => runner().run((tx) => notifications().notifyInApp(tx, input));
  const list = async (account: typeof alice.account, query: Record<string, string | number> = {}) =>
    h.dataOf<{ items: NoticeWire[]; pagination: { totalItems: number; totalPages: number } }>(
      await h.inbox(account, query).expect(200),
    );

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
    const department = await h.departmentWithUnit('P-INBOX');
    alice = await h.staff(department, 'INB-A1');
    bob = await h.staff(department, 'INB-B1');
  }, 240000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  describe('what the database refuses whoever writes (data integrity)', () => {
    const insert = (
      overrides: {
        code?: string;
        params?: string;
        key?: string;
        subjectType?: string | null;
        subjectId?: string | null;
      } = {},
    ) =>
      sqlState(
        `INSERT INTO in_app_notifications (id, organization_id, recipient_employee_id, code, subject_type, subject_id, params, event_key)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [
          h.seed.organizationId,
          alice.employeeId,
          overrides.code ?? 'REQUEST_GRANTED',
          overrides.subjectType === undefined ? 'ACCESS_REQUEST' : overrides.subjectType,
          overrides.subjectId === undefined ? SUBJECT : overrides.subjectId,
          overrides.params ?? '{}',
          overrides.key ?? randomUUID(),
        ],
      );

    it('takes a well formed notice', async () => {
      expect(await insert()).toBeNull();
      expect(await insert({ subjectType: null, subjectId: null })).toBeNull();
    });

    it.each([
      ['a code that is not upper case', { code: 'request_granted' }],
      ['a code that is too short', { code: 'AB' }],
      ['parameters that are not an object', { params: '[1]' }],
      ['parameters over 4 096 bytes', { params: JSON.stringify({ reason: 'x'.repeat(4100) }) }],
      ['an empty event key', { key: '' }],
      ['an event key over 200 characters', { key: 'k'.repeat(201) }],
      ['a subject type with no id', { subjectType: 'ACCESS_REQUEST', subjectId: null }],
      ['a subject id with no type', { subjectType: null, subjectId: SUBJECT }],
    ])('refuses %s (23514)', async (_name, overrides) => {
      expect(await insert(overrides)).toBe(CHECK);
    });

    it('refuses a second notice for the same recipient and key (23505), and takes the key again for somebody else', async () => {
      const key = randomUUID();
      expect(await insert({ key })).toBeNull();
      expect(await insert({ key })).toBe(UNIQUE);
      expect(
        await sqlState(
          `INSERT INTO in_app_notifications (id, organization_id, recipient_employee_id, code, params, event_key)
           VALUES (gen_random_uuid(), $1, $2, 'REQUEST_GRANTED', '{}', $3)`,
          [h.seed.organizationId, bob.employeeId, key],
        ),
      ).toBeNull();
    });

    it('lets the moment of reading be set once from empty and nothing else change (23001)', async () => {
      const key = randomUUID();
      await insert({ key });
      const where = `recipient_employee_id = '${alice.employeeId}' AND event_key = '${key}'`;

      expect(await sqlState(`UPDATE in_app_notifications SET code = 'REQUEST_FAILED' WHERE ${where}`)).toBe(RESTRICT);
      expect(await sqlState(`UPDATE in_app_notifications SET params = '{"a":1}' WHERE ${where}`)).toBe(RESTRICT);
      expect(
        await sqlState(`UPDATE in_app_notifications SET recipient_employee_id = '${bob.employeeId}' WHERE ${where}`),
      ).toBe(RESTRICT);
      expect(
        await sqlState(`UPDATE in_app_notifications SET read_at = now(), code = 'REQUEST_FAILED' WHERE ${where}`),
      ).toBe(RESTRICT);
      expect(await sqlState(`UPDATE in_app_notifications SET read_at = NULL WHERE ${where}`)).toBe(RESTRICT);
      expect(await sqlState(`UPDATE in_app_notifications SET read_at = now() WHERE ${where}`)).toBeNull();
      expect(await sqlState(`UPDATE in_app_notifications SET read_at = now() WHERE ${where}`)).toBe(RESTRICT);
      expect(await sqlState(`UPDATE in_app_notifications SET read_at = NULL WHERE ${where}`)).toBe(RESTRICT);
    });

    it('never deletes or truncates (23001)', async () => {
      expect(
        await sqlState(`DELETE FROM in_app_notifications WHERE recipient_employee_id = $1`, [alice.employeeId]),
      ).toBe(RESTRICT);
      expect(await sqlState(`TRUNCATE in_app_notifications`)).toBe(RESTRICT);
    });
  });

  describe('giving a notice in the transaction of the change behind it', () => {
    it('writes it and says so, and says false for the same recipient and key without writing again', async () => {
      const input = notice(alice.employeeId);
      const mails = await h.count('email_outbox');

      expect(await give(input)).toBe(true);
      expect(await give(input)).toBe(false);
      expect(await give({ ...input, recipientEmployeeId: bob.employeeId })).toBe(true);

      expect((await h.noticesOf(alice.employeeId)).filter((row) => row.event_key === input.eventKey)).toHaveLength(1);
      expect(await h.count('email_outbox')).toBe(mails);
    });

    it('is gone when the change rolls back, and exists exactly when it commits', async () => {
      const kept = notice(alice.employeeId);
      const lost = notice(alice.employeeId);

      await runner().run(async (tx) => {
        await notifications().notifyInApp(tx, kept);
      });
      await expect(
        runner().run(async (tx) => {
          await notifications().notifyInApp(tx, lost);
          throw new Error('the change behind it failed');
        }),
      ).rejects.toThrow('the change behind it failed');

      const keys = (await h.noticesOf(alice.employeeId)).map((row) => row.event_key);
      expect(keys).toContain(kept.eventKey);
      expect(keys).not.toContain(lost.eventKey);
    });

    it('refuses a notice the closed table does not take, and writes nothing', async () => {
      const before = await h.noticeCount();

      await expect(give(notice(alice.employeeId, { code: 'NOT_A_CODE' as never }))).rejects.toBeInstanceOf(
        InvalidInAppNotificationError,
      );
      await expect(
        give(notice(alice.employeeId, { params: { requestId: SUBJECT, passwordHash: 'x' } })),
      ).rejects.toMatchObject({
        refusal: { reason: 'PARAM_KEY_FORBIDDEN' },
      });
      await expect(
        give(notice(alice.employeeId, { params: { requestId: SUBJECT, amountMinor: 5 } })),
      ).rejects.toMatchObject({
        refusal: { reason: 'PARAM_KEY_NOT_ALLOWED' },
      });
      expect(await h.noticeCount()).toBe(before);
    });
  });

  describe('reading the inbox over HTTP', () => {
    it('lists only the notices of the caller, the newest first, with a tie broken by id', async () => {
      const carol = await h.staff(await h.departmentWithUnit('P-INBOX2'), 'INB-C1');
      await runner().run(async (tx) => {
        // One transaction: every notice has the same moment of creation, so only the id can tell their order.
        for (let index = 0; index < 4; index += 1) await notifications().notifyInApp(tx, notice(carol.employeeId));
      });
      await give(notice(alice.employeeId));

      const page = await list(carol.account);

      expect(page.items).toHaveLength(4);
      expect(page.pagination.totalItems).toBe(4);
      const order = page.items.map((item) => `${item.createdAt}|${item.id}`);
      expect(order).toEqual([...order].sort().reverse());
      expect(page.items.every((item) => item.subject?.id === SUBJECT && item.code === 'REQUEST_GRANTED')).toBe(true);
      expect(page.items[0]).toMatchObject({
        subject: { type: 'ACCESS_REQUEST', id: SUBJECT },
        params: { requestId: SUBJECT, accessGuide: 'LOGIN_WITH_WORK_ACCOUNT', homepageUrl: null },
        readAt: null,
      });
    });

    it('narrows to the unread ones, pages with a bounded size, and counts what is unread', async () => {
      const dave = await h.staff(await h.departmentWithUnit('P-INBOX3'), 'INB-D1');
      for (let index = 0; index < 5; index += 1) await give(notice(dave.employeeId));
      const first = (await list(dave.account)).items[0];
      await h.markRead(first.id, dave.account).expect(200);

      const unreadOnly = await list(dave.account, { unreadOnly: 'true' });
      const everything = await list(dave.account);
      const paged = await list(dave.account, { pageSize: 2, page: 3 });

      expect(unreadOnly.items.map((item) => item.id)).not.toContain(first.id);
      expect(unreadOnly.pagination.totalItems).toBe(4);
      expect(everything.pagination.totalItems).toBe(5);
      expect(paged.items).toHaveLength(1);
      expect(paged.pagination).toMatchObject({ totalItems: 5, totalPages: 3 });
      expect(h.dataOf<{ unread: number }>(await h.unread(dave.account).expect(200))).toEqual({ unread: 4 });
      expect(h.codeOf(await h.inbox(dave.account, { pageSize: 51 }).expect(422))).toBe('VALIDATION_ERROR');
      expect(h.codeOf(await h.inbox(dave.account, { unreadOnly: 'maybe' }).expect(422))).toBe('VALIDATION_ERROR');
    });

    it('marks one notice as read once: the second call returns it as it is, with the same moment', async () => {
      const erin = await h.staff(await h.departmentWithUnit('P-INBOX4'), 'INB-E1');
      await give(notice(erin.employeeId));
      const target = (await list(erin.account)).items[0];

      const first = h.dataOf<{ notification: NoticeWire }>(
        await h.markRead(target.id, erin.account).expect(200),
      ).notification;
      const second = h.dataOf<{ notification: NoticeWire }>(
        await h.markRead(target.id, erin.account).expect(200),
      ).notification;

      expect(first.readAt).not.toBeNull();
      expect(second).toEqual(first);
    });

    it('does not let anybody read, mark or find the notice of another person, the Super Admin included (404)', async () => {
      const frank = await h.staff(await h.departmentWithUnit('P-INBOX5'), 'INB-F1');
      await give(notice(frank.employeeId));
      const theirs = (await list(frank.account)).items[0];

      const refusals = [
        await h.markRead(theirs.id, alice.account).expect(404),
        await h.markRead(theirs.id, h.it1).expect(404),
        await h.markRead(randomUUID(), alice.account).expect(404),
      ];

      for (const refused of refusals) expect(h.codeOf(refused)).toBe('NOTIFICATION.NOT_FOUND');
      const asSuperAdmin = await request(h.server())
        .post(`/api/v1/notifications/${theirs.id}/read`)
        .set({ Authorization: `Bearer ${h.admin}` })
        .expect(404);
      expect(h.codeOf(asSuperAdmin)).toBe('NOTIFICATION.NOT_FOUND');
      expect((await list(frank.account)).items.find((item) => item.id === theirs.id)?.readAt).toBeNull();
      expect((await list(alice.account)).items.map((item) => item.id)).not.toContain(theirs.id);
    });

    it('marks every unread notice of the caller and says how many changed, and none the second time', async () => {
      const gina = await h.staff(await h.departmentWithUnit('P-INBOX6'), 'INB-G1');
      const other = await h.staff(await h.departmentWithUnit('P-INBOX7'), 'INB-H1');
      for (let index = 0; index < 3; index += 1) await give(notice(gina.employeeId));
      await give(notice(other.employeeId));

      expect(h.dataOf<{ updated: number }>(await h.markAllRead(gina.account).expect(200))).toEqual({ updated: 3 });
      expect(h.dataOf<{ updated: number }>(await h.markAllRead(gina.account).expect(200))).toEqual({ updated: 0 });
      expect(h.dataOf<{ unread: number }>(await h.unread(gina.account).expect(200))).toEqual({ unread: 0 });
      expect(h.dataOf<{ unread: number }>(await h.unread(other.account).expect(200))).toEqual({ unread: 1 });
    });

    it('answers 401 without a session and 422 for an id that is not one', async () => {
      await request(h.server()).get('/api/v1/notifications').expect(401);
      await request(h.server()).get('/api/v1/notifications/unread-count').expect(401);
      await request(h.server()).post('/api/v1/notifications/read-all').expect(401);
      await request(h.server()).post(`/api/v1/notifications/${randomUUID()}/read`).expect(401);
      expect(h.codeOf(await h.markRead('not-an-id', alice.account).expect(422))).toBe('VALIDATION_ERROR');
    });

    it('gives web and mobile the same notices: no parameter of the route depends on the client (US-05-15 AC-10)', async () => {
      const web = await h.inbox(alice.account).set('User-Agent', 'web').set('X-Client', 'web').expect(200);
      const mobile = await h.inbox(alice.account).set('User-Agent', 'mobile').set('X-Client', 'mobile').expect(200);

      expect(h.dataOf(mobile)).toEqual(h.dataOf(web));
    });

    it('runs the same number of statements for a page of 3 notices and of 40 (a collection has no per-row work)', async () => {
      const small = await h.staff(await h.departmentWithUnit('P-INBOX8'), 'INB-I1');
      const large = await h.staff(await h.departmentWithUnit('P-INBOX9'), 'INB-J1');
      for (let index = 0; index < 3; index += 1) await give(notice(small.employeeId));
      await runner().run(async (tx) => {
        for (let index = 0; index < 40; index += 1) await notifications().notifyInApp(tx, notice(large.employeeId));
      });
      // The first call of each account warms the session; the count is of the second.
      await h.inbox(small.account, { pageSize: 50 }).expect(200);
      await h.inbox(large.account, { pageSize: 50 }).expect(200);

      const few = await counter.run(() => h.inbox(small.account, { pageSize: 50 }).expect(200));
      const many = await counter.run(() => h.inbox(large.account, { pageSize: 50 }).expect(200));

      expect(h.dataOf<{ items: unknown[] }>(few.result).items).toHaveLength(3);
      expect(h.dataOf<{ items: unknown[] }>(many.result).items).toHaveLength(40);
      expect(dataStatements(many.statements)).toHaveLength(dataStatements(few.statements).length);
    });
  });
});
