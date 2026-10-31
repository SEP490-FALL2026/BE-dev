import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { FIGURE_WORDS, FORBIDDEN_PARAM_KEY } from '../../../src/modules/notifications/inbox/inbox.policy';
import { NotificationsApi } from '../../../src/modules/notifications/public/notifications.api';
import type { ApiAccount } from '../../support/api-accounts';
import { StatusHarness, type NoticeWire } from '../../support/status-harness';

const h = new StatusHarness();
const MOBILE = { 'User-Agent': 'SLM-Mobile/1.0 (Android 16)', 'X-Client': 'mobile' } as const;

interface Inbox {
  items: NoticeWire[];
  pagination: { totalItems: number };
}

/** The inbox exactly as the mobile app reads it: the same routes as the web, the client saying what it is. */
const inbox = async (account: ApiAccount, query: Record<string, string | number> = {}): Promise<Inbox> =>
  h.dataOf<Inbox>(
    await request(h.server()).get('/api/v1/notifications').query(query).set(h.as(account)).set(MOBILE).expect(200),
  );
const unread = async (account: ApiAccount): Promise<number> =>
  h.dataOf<{ unread: number }>(await h.unread(account).set(MOBILE).expect(200)).unread;

/** The codes of the notices about alice's request on a page: what the flow told this reader about it. */
const aboutRequestOf = (id: string) => (page: Inbox) =>
  page.items.filter((item) => item.subject?.id === id).map((item) => item.code);

/** Every key of every object of a wire value, so that a secret or a figure cannot hide in a nested parameter. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)]);
  }

  return [];
}

describe('the inbox the mobile app reads is the inbox of its own caller and of nobody else (US-16-04 AC-2, US-05-15 AC-10, integration, real PostgreSQL)', () => {
  let alice: { employeeId: string; account: ApiAccount };
  let bob: { employeeId: string; account: ApiAccount };
  let head: { employeeId: string; account: ApiAccount };
  let noRole: { employeeId: string; account: ApiAccount };
  let aliceRequest: string;
  let aboutRequest: (page: Inbox) => string[];
  const runner = () => h.ctx.app.get(TransactionRunner, { strict: false });
  const notifications = () => h.ctx.app.get(NotificationsApi, { strict: false });
  /** A notice written for the person the way the services of the other modules write one. */
  const tell = (recipientEmployeeId: string, subjectId: string) =>
    runner().run((tx) =>
      notifications().notifyInApp(tx, {
        organizationId: h.seed.organizationId,
        recipientEmployeeId,
        code: 'REQUEST_GRANTED',
        subject: { type: 'ACCESS_REQUEST', id: subjectId },
        params: { requestId: subjectId, accessGuide: 'LOGIN_WITH_WORK_ACCOUNT', homepageUrl: null },
        eventKey: randomUUID(),
      }),
    );

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    const department = await h.departmentWithUnit('P-INB');
    head = await h.staff(department, 'INB-H1');
    await h.makeHead(department, head);
    alice = await h.staff(department, 'INB-A1', ['EMPLOYEE']);
    bob = await h.staff(department, 'INB-B1', ['EMPLOYEE']);
    noRole = await h.staff(department, 'INB-N1');
    // The notices of the real flow: alice sends a request, the projection tells her and her head.
    aliceRequest = (await h.sent(alice, await h.plan('K5'))).id;
    await h.project();
    aboutRequest = aboutRequestOf(aliceRequest);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('shows each person the notices addressed to them: alice her own, the head the step handed to them, bob and an account with no role none of hers', async () => {
    const mine = await inbox(alice.account);
    expect(mine.items.map((item) => item.code)).toEqual(['REQUEST_SUBMITTED']);
    expect(mine.items[0].subject).toEqual({ type: 'ACCESS_REQUEST', id: aliceRequest });
    expect(mine.pagination.totalItems).toBe(1);
    expect(await unread(alice.account)).toBe(1);

    // The head is also told of the people entered into their department: the notice about the request is the one handed to them.
    expect(aboutRequest(await inbox(head.account))).toEqual(['STEP_ASSIGNED']);
    expect(await unread(head.account)).toBeGreaterThanOrEqual(1);

    for (const stranger of [bob, noRole]) {
      expect(aboutRequest(await inbox(stranger.account))).toEqual([]);
      expect((await inbox(stranger.account)).items.filter((item) => item.code.startsWith('REQUEST_'))).toEqual([]);
    }
  });

  it('answers 404 to anyone who marks the notice of another person as read, whichever role they hold, and leaves it unread', async () => {
    const notice = (await inbox(alice.account)).items[0];
    const intruders = [bob.account, head.account, noRole.account, h.it1, h.finance];

    for (const intruder of intruders) {
      const refused = await h.markRead(notice.id, intruder).set(MOBILE).expect(404);
      expect(h.codeOf(refused)).toBe('NOTIFICATION.NOT_FOUND');
    }
    const asSuperAdmin = await request(h.server())
      .post(`/api/v1/notifications/${notice.id}/read`)
      .set({ Authorization: `Bearer ${h.admin}`, ...MOBILE })
      .expect(404);
    expect(h.codeOf(asSuperAdmin)).toBe('NOTIFICATION.NOT_FOUND');

    expect((await h.noticesOf(alice.employeeId))[0].read_at).toBeNull();
    expect(await unread(alice.account)).toBe(1);
  });

  it('keeps the unread count and the read moment of one person out of reach of what another reads, including read-all', async () => {
    await tell(bob.employeeId, randomUUID());
    await tell(bob.employeeId, randomUUID());
    expect(await unread(bob.account)).toBe(2);
    const headUnread = await unread(head.account);

    const marked = await h.markAllRead(bob.account).set(MOBILE).expect(200);
    expect(h.dataOf<{ updated: number }>(marked).updated).toBe(2);

    expect(await unread(bob.account)).toBe(0);
    expect(await unread(alice.account)).toBe(1);
    expect(await unread(head.account)).toBe(headUnread);
    expect((await inbox(alice.account, { unreadOnly: 'true' })).items).toHaveLength(1);
    expect((await inbox(bob.account, { unreadOnly: 'true' })).items).toEqual([]);
    expect((await inbox(bob.account)).items).toHaveLength(2);
  });

  it('gives every kind of account an inbox, and each exactly the notices written for their own person', async () => {
    const people = [
      ['IT Admin', h.it1],
      ['Finance', h.finance],
      ['a head', head.account],
      ['an account with no role', noRole.account],
    ] as const;
    const subjects = new Map<string, string>();
    for (const [name, account] of people) {
      const subject = randomUUID();
      subjects.set(name, subject);
      await tell(account.employeeId, subject);
    }

    for (const [name, account] of people) {
      const own = (await inbox(account)).items.filter((item) => item.code === 'REQUEST_GRANTED');
      expect([name, own.map((item) => item.subject?.id)]).toEqual([name, [subjects.get(name)]]);
    }
    // The Super Admin reads the inbox of the Super Admin, not a window onto the others.
    const superAdminNotice = randomUUID();
    await tell(h.seed.superAdmin.employeeId, superAdminNotice);
    const admin = h.dataOf<Inbox>(
      await request(h.server())
        .get('/api/v1/notifications')
        .query({ pageSize: 50 })
        .set({ Authorization: `Bearer ${h.admin}`, ...MOBILE })
        .expect(200),
    );
    expect(admin.items.filter((item) => item.code === 'REQUEST_GRANTED').map((item) => item.subject?.id)).toEqual([
      superAdminNotice,
    ]);
    expect(admin.items.map((item) => item.id)).not.toContain((await inbox(alice.account)).items[0].id);
  });

  it('keeps the inbox with the person, not with their roles: it opens with no role at all, and the notice survives the loss of every role', async () => {
    const holder = await h.staff(await h.departmentWithUnit('P-INB2'), 'INB-X1', ['IT_ADMIN']);
    const subject = randomUUID();
    await tell(holder.employeeId, subject);
    expect(await unread(holder.account)).toBe(1);

    await h.revokeRoleFrom(holder.account.appUserId, 'IT_ADMIN').expect(200);

    const afterwards = await inbox(holder.account);
    expect(afterwards.items.map((item) => item.subject?.id)).toEqual([subject]);
    expect(await unread(holder.account)).toBe(1);
  });

  it('shuts the inbox of a locked account at once, and gives it back unchanged after the unlock and a new sign-in', async () => {
    const holder = await h.staff(await h.departmentWithUnit('P-INB3'), 'INB-L1', ['EMPLOYEE']);
    const subject = randomUUID();
    await tell(holder.employeeId, subject);
    await inbox(holder.account);

    await request(h.server())
      .post(`/api/v1/app-users/${holder.account.appUserId}/lock`)
      .set({ Authorization: `Bearer ${h.admin}` })
      .send({ reason: 'Lock while the inbox is read' })
      .expect(200);
    for (const response of [await h.inbox(holder.account), await h.unread(holder.account)]) {
      expect(response.status).toBe(401);
    }
    await request(h.server())
      .post(`/api/v1/app-users/${holder.account.appUserId}/unlock`)
      .set({ Authorization: `Bearer ${h.admin}` })
      .send({ reason: 'The review is closed' })
      .expect(200);
    const signedIn = await request(h.server())
      .post('/api/v1/auth/login')
      .set(MOBILE)
      .send({ email: holder.account.email, password: 'a long enough passphrase' })
      .expect(200);
    const fresh = { ...holder.account, accessToken: h.dataOf<{ accessToken: string }>(signedIn).accessToken };

    expect((await inbox(fresh)).items.map((item) => item.subject?.id)).toEqual([subject]);
    expect(await unread(fresh)).toBe(1);
  });

  it('carries no secret and no figure of money in what any inbox returns, whoever reads it', async () => {
    const wires = [alice.account, head.account, bob.account, h.it1, h.finance].map((account) =>
      inbox(account, { pageSize: 50 }),
    );
    const keys = (await Promise.all(wires)).flatMap((page) => page.items.flatMap((item) => keysOf(item.params)));

    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((key) => FORBIDDEN_PARAM_KEY.test(key) || FIGURE_WORDS.test(key))).toEqual([]);
  });
});
