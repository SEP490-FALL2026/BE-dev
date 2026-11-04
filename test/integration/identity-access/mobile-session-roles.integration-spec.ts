import request from 'supertest';
import { ACCOUNT_PASSWORD, activateInvitedAccount, type ApiAccount } from '../../support/api-accounts';
import { StatusHarness } from '../../support/status-harness';

const h = new StatusHarness();

/** What a client may say about itself: nothing here is read by the server, which is what the specs prove. */
const WEB = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0)', 'X-Client': 'web' } as const;
const MOBILE = { 'User-Agent': 'SLM-Mobile/1.0 (iOS 19)', 'X-Client': 'mobile' } as const;
const CHANNELS = [
  ['web', WEB],
  ['mobile', MOBILE],
] as const;
type Label = Record<string, string>;

const bearer = (token: string, label: Label = MOBILE) => ({ Authorization: `Bearer ${token}`, ...label });
const login = (email: string, password: string, label: Label = MOBILE) =>
  request(h.server()).post('/api/v1/auth/login').set(label).send({ email, password });
const me = (token: string, label: Label = MOBILE) => request(h.server()).get('/api/v1/me').set(bearer(token, label));
const get = (path: string, token: string, label: Label = MOBILE) =>
  request(h.server()).get(path).set(bearer(token, label));
const adminPost = (path: string, body?: object) =>
  request(h.server())
    .post(path)
    .set({ Authorization: `Bearer ${h.admin}` })
    .send(body);

interface MeData {
  appUserId: string;

  roles: string[];
  managerScope: { departmentId: string; departmentCode: string; departmentName: string } | null;
}
const meOf = async (token: string, label: Label = MOBILE): Promise<MeData> =>
  h.dataOf<MeData>(await me(token, label).expect(200));

/** An error answer with the one field that differs from one call to the next removed. */
const answerOf = (response: request.Response) => {
  const error = (response.body as { error: Record<string, unknown> }).error;

  return { status: response.status, error: { ...error, requestId: 'x' } };
};

describe('the mobile channel signs in, keeps its session and reads its roles exactly as the web does (US-16-04, integration, real PostgreSQL)', () => {
  let department: Awaited<ReturnType<StatusHarness['departmentWithUnit']>>;
  let counter = 0;

  /** A person with an activated account holding exactly `roles`; `P-MOB` is the department they belong to. */
  const person = (roles: string[] = []) => {
    counter += 1;

    return h.staff(department, `MOB-${counter}`, roles);
  };
  const passwordOf = () => ACCOUNT_PASSWORD;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    department = await h.departmentWithUnit('P-MOB');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  afterEach(async () => {
    await h.ctx.sql.query('DELETE FROM login_throttles');
  });

  describe('one login, one refresh, one logout (US-16-04 AC-1)', () => {
    it.each(CHANNELS)(
      'gives the %s client the same session wire and the same effective roles',
      async (_name, label) => {
        const employee = await person(['EMPLOYEE']);

        const signedIn = await login(employee.account.email, passwordOf(), label).expect(200);
        const data = h.dataOf<Record<string, string>>(signedIn);
        expect(Object.keys(data).sort()).toEqual(
          ['accessToken', 'expiresAt', 'refreshExpiresAt', 'refreshToken', 'tokenType'].sort(),
        );
        expect(data.tokenType).toBe('Bearer');
        expect((signedIn.body as { message: string }).message).toBe('AUTH.LOGGED_IN');

        const roles = (await meOf(data.accessToken, label)).roles;
        expect(roles).toEqual(['EMPLOYEE']);

        const refreshed = await request(h.server())
          .post('/api/v1/auth/refresh')
          .set(label)
          .send({ refreshToken: data.refreshToken })
          .expect(200);
        expect((refreshed.body as { message: string }).message).toBe('AUTH.SESSION_REFRESHED');
        const next = h.dataOf<Record<string, string>>(refreshed);
        expect(next.refreshToken).not.toBe(data.refreshToken);

        await request(h.server())
          .post('/api/v1/auth/logout')
          .set(label)
          .send({ refreshToken: next.refreshToken })
          .expect(204);
        const afterLogout = await request(h.server())
          .post('/api/v1/auth/refresh')
          .set(label)
          .send({ refreshToken: next.refreshToken })
          .expect(401);
        expect(h.codeOf(afterLogout)).toBe('AUTH.SESSION_INVALID');
        await me(next.accessToken, label).expect(401);
      },
    );

    it('answers the two channels with the same effective roles for the same account, and one session row per sign-in', async () => {
      const head = await person();
      await h.makeHead(department, head);
      const web = h.dataOf<{ accessToken: string }>(await login(head.account.email, passwordOf(), WEB).expect(200));
      const mobile = h.dataOf<{ accessToken: string }>(
        await login(head.account.email, passwordOf(), MOBILE).expect(200),
      );

      expect((await meOf(mobile.accessToken)).roles).toEqual((await meOf(web.accessToken, WEB)).roles);
      const sessions = await h.ctx.sql.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM auth_sessions WHERE app_user_id = $1 AND revoked_at IS NULL`,
        [head.account.appUserId],
      );
      // The account's own token of the harness, the two above: sessions differ only by their id.
      expect(sessions.rows[0].n).toBeGreaterThanOrEqual(2);
      await h.vacateHead(department.id).expect(200);
    });

    it('takes only an email and a password: a device token, a channel or a biometric proof is a validation error and nothing is stored', async () => {
      const employee = await person(['EMPLOYEE']);
      const before = await h.count('auth_sessions');

      for (const extra of [{ deviceToken: 'abc' }, { channel: 'mobile' }, { biometric: 'fingerprint-ok' }]) {
        const refused = await request(h.server())
          .post('/api/v1/auth/login')
          .set(MOBILE)
          .send({ email: employee.account.email, password: passwordOf(), ...extra })
          .expect(422);
        expect(h.codeOf(refused)).toBe('VALIDATION_ERROR');
      }

      expect(await h.count('auth_sessions')).toBe(before);
    });

    it('keeps no push token, device identity or client channel in the tables of accounts, sessions and the inbox (US-16-04 AC-3)', async () => {
      const identityAndInbox = [
        'app_users',
        'auth_sessions',
        'refresh_tokens',
        'password_credentials',
        'login_throttles',
        'account_action_tokens',
        'in_app_notifications',
        'email_outbox',
      ];
      const { rows } = await h.ctx.sql.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public'
            AND (column_name ~* '(push|fcm|apns|device_token|device_id|biometric)'
                 OR table_name ~* '(push|fcm|apns|device_token)'
                 OR (table_name = ANY($1) AND column_name ~* '(device|channel|user_agent|client)'))`,
        [identityAndInbox],
      );

      expect(rows).toEqual([]);
    });

    it('does not let a client-supplied label narrow or widen the web API', async () => {
      // An operation the mobile app does not offer is still answered by role alone, whatever the client says it is.
      for (const [, label] of CHANNELS) {
        await get('/api/v1/provisioning-tasks', h.it1.accessToken, label).expect(200);
        await get('/api/v1/finance-reviews', h.it1.accessToken, label).expect(403);
        await get('/api/v1/finance-reviews', h.finance.accessToken, label).expect(200);
      }
    });
  });

  describe('one answer for every failed sign-in (US-16-04 AC-1; US-01-10 AC-3, AC-6)', () => {
    it.each(CHANNELS)(
      'answers a %s client identically for an unknown, wrong, locked, invited and departed account',
      async (_name, label) => {
        const locked = await person(['EMPLOYEE']);
        const departed = await person(['EMPLOYEE']);
        const active = await person(['EMPLOYEE']);
        const invited = await h.member(department.code, `MOB-INV-${label['X-Client']}`, await h.title());
        await adminPost('/api/v1/app-users', { employeeId: invited, roles: ['EMPLOYEE'] }).expect(201);

        await adminPost(`/api/v1/app-users/${locked.account.appUserId}/lock`, {
          reason: 'Mobile uniform answer test',
        }).expect(200);
        await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [departed.employeeId]);

        const answers = [
          await login('nobody-at-all@acme.vn', passwordOf(), label),
          await login(active.account.email, 'not the password at all', label),
          await login(locked.account.email, passwordOf(), label),
          await login(departed.account.email, passwordOf(), label),
          await login(`mob-inv-${label['X-Client']}@acme.vn`, passwordOf(), label),
        ];

        for (const answer of answers) {
          expect(answer.status).toBe(401);
          expect(h.codeOf(answer)).toBe('AUTH.INVALID_CREDENTIALS');
          expect(answer.headers['set-cookie']).toBeUndefined();
          expect(answerOf(answer)).toEqual(answerOf(answers[0]));
        }
      },
    );

    it('answers a refresh token that is unknown, spent, of a locked account or of an ended session in one way', async () => {
      const victim = await person(['EMPLOYEE']);
      const first = h.dataOf<{ refreshToken: string }>(await login(victim.account.email, passwordOf()).expect(200));
      const spent = h.dataOf<{ refreshToken: string }>(await login(victim.account.email, passwordOf()).expect(200));
      await request(h.server()).post('/api/v1/auth/logout').send({ refreshToken: spent.refreshToken }).expect(204);
      const tokens = ['x'.repeat(43), spent.refreshToken];

      await adminPost(`/api/v1/app-users/${victim.account.appUserId}/lock`, {
        reason: 'Mobile refresh answer test',
      }).expect(200);
      tokens.push(first.refreshToken);

      const answers = [] as request.Response[];
      for (const refreshToken of tokens) {
        answers.push(await request(h.server()).post('/api/v1/auth/refresh').set(MOBILE).send({ refreshToken }));
      }
      for (const answer of answers) {
        expect(answer.status).toBe(401);
        expect(h.codeOf(answer)).toBe('AUTH.SESSION_INVALID');
        expect(answerOf(answer)).toEqual(answerOf(answers[0]));
      }
    });
  });

  describe('a locked account stops at the very next operation (US-16-04 AC-6; US-01-10 AC-6)', () => {
    it('refuses every mobile operation of the account after the lock, writes nothing, and works again after the unlock with a new sign-in', async () => {
      const employee = await person(['EMPLOYEE']);
      const planId = await h.plan('K5');
      const token = employee.account.accessToken;
      await get('/api/v1/notifications', token).expect(200);
      await request(h.server())
        .post('/api/v1/access-requests/preview')
        .set(bearer(token))
        .send({ planId, termMonths: 6 })
        .expect(200);
      const requests = await h.requestRows();

      await adminPost(`/api/v1/app-users/${employee.account.appUserId}/lock`, {
        reason: 'Contain the account now',
      }).expect(200);

      const operations = [
        get('/api/v1/me', token),
        get('/api/v1/notifications', token),
        get('/api/v1/notifications/unread-count', token),
        get('/api/v1/access-requests/drafts', token),
        request(h.server()).post('/api/v1/access-requests/preview').set(bearer(token)).send({ planId, termMonths: 6 }),
        request(h.server()).post('/api/v1/access-requests').set(bearer(token)).send(h.form(planId)),
        request(h.server()).post('/api/v1/notifications/read-all').set(bearer(token)),
      ];
      for (const response of await Promise.all(operations)) {
        expect(response.status).toBe(401);
        expect(h.codeOf(response)).toBe('INVALID_ACCESS_TOKEN');
      }
      expect(await h.requestRows()).toBe(requests);
      await login(employee.account.email, passwordOf()).expect(401);

      await adminPost(`/api/v1/app-users/${employee.account.appUserId}/unlock`, {
        reason: 'The review is closed',
      }).expect(200);
      // The locked session stays ended: the unlock does not bring the old token back.
      await me(token).expect(401);
      const again = h.dataOf<{ accessToken: string }>(await login(employee.account.email, passwordOf()).expect(200));
      expect((await meOf(again.accessToken)).roles).toEqual(['EMPLOYEE']);
    });

    it('refuses the next operation of an employee who has left, without waiting for the token to expire', async () => {
      const leaver = await person(['EMPLOYEE']);
      await get('/api/v1/notifications/unread-count', leaver.account.accessToken).expect(200);

      await h.leave(leaver.employeeId);

      const refused = await get('/api/v1/notifications/unread-count', leaver.account.accessToken).expect(401);
      expect(h.codeOf(refused)).toBe('INVALID_ACCESS_TOKEN');
    });
  });

  describe('a change of role takes effect at the very next operation (US-16-04 AC-6; US-01-01 AC-17)', () => {
    it('stops a head from the queue of a manager the moment the head period ends, and refuses their decision on the step', async () => {
      const head = await person();
      await h.makeHead(department, head);
      const member = await person(['EMPLOYEE']);
      const sent = await h.sent(member, await h.plan('K5'));
      const token = head.account.accessToken;
      // The head holds MANAGER as a grant (the fixture gives it before naming the head) and heads this department today.
      expect(await meOf(token)).toMatchObject({
        roles: ['MANAGER'],
        managerScope: { departmentId: department.id },
      });
      await get('/api/v1/spend-queue', token).expect(200);

      await h.vacateHead(department.id).expect(200);

      // The grant stays and the scope goes: MANAGER without a department authorizes nothing as a MANAGER (US-01-02 AC-3).
      expect(await meOf(token)).toMatchObject({ roles: ['MANAGER'], managerScope: null });
      await get('/api/v1/spend-queue', token).expect(403);
      // The step is no longer the ex-head's: the request is answered as one the caller has no part in, and nothing moved.
      const decided = await h.decide(sent.id, { decision: 'APPROVE' }, head.account).expect(404);
      expect(h.codeOf(decided)).toBe('ACCESS_REQUEST.NOT_FOUND');
      const state = h.dataOf<{ request: { state: string } }>(await h.fetch(sent.id, member.account).expect(200)).request
        .state;
      expect(['PENDING', 'WAITING_CONTROLLED']).toContain(state);
    });

    it('applies a grant and a revocation of a direct role to the next call, and keeps EMPLOYEE only for who holds it', async () => {
      const it2 = await person(['IT_ADMIN']);
      const token = it2.account.accessToken;
      await get('/api/v1/provisioning-tasks', token).expect(200);
      expect((await meOf(token)).roles).toEqual(['IT_ADMIN']);

      await h.grantRoleTo(it2.account.appUserId, 'EMPLOYEE').expect(201);
      expect((await meOf(token)).roles).toEqual(['EMPLOYEE', 'IT_ADMIN']);

      await h.revokeRoleFrom(it2.account.appUserId, 'IT_ADMIN').expect(200);
      await get('/api/v1/provisioning-tasks', token).expect(403);
      const afterwards = await meOf(token);
      expect(afterwards.roles).toEqual(['EMPLOYEE']);
      expect(afterwards).not.toHaveProperty('selfServiceOnly');

      await h.revokeRoleFrom(it2.account.appUserId, 'EMPLOYEE').expect(200);
      expect(await meOf(token)).not.toHaveProperty('selfServiceOnly');
      // Revoking the last role leaves the account signed in: the inbox and /me are self-service, open to every account.
      await get('/api/v1/notifications', token).expect(200);
    });
  });

  describe('who gets the Employee tasks (US-16-04 AC-5, AC-6; US-01-01 AC-16, AC-17)', () => {
    it('gives IT Admin, Finance and Super Admin no EMPLOYEE role by default, and an account made with no role none at all', async () => {
      const superAdmin = h.dataOf<{ accessToken: string }>(
        await login(h.seed.superAdmin.email, h.seed.superAdmin.password).expect(200),
      );
      const itOnly = await accountMadeThroughTheApi(['IT_ADMIN']);
      const itWithEmployee = await accountMadeThroughTheApi(['IT_ADMIN']);
      const noRole = await accountMadeThroughTheApi([]);

      expect((await meOf(superAdmin.accessToken)).roles).toEqual(['SUPER_ADMIN']);
      expect((await meOf(h.finance.accessToken)).roles).toEqual(['FINANCE']);
      expect((await meOf(itOnly.accessToken)).roles).toEqual(['IT_ADMIN']);
      // Roles add up and are not inherited: the IT Admin who also holds EMPLOYEE has exactly those two.
      expect((await meOf(itWithEmployee.accessToken)).roles).toEqual(['IT_ADMIN']);
      const none = await meOf(noRole.accessToken);
      expect(none.roles).toEqual(['EMPLOYEE']);
      expect(none).not.toHaveProperty('selfServiceOnly');
    });

    it('refuses the Super Admin a request of their own with its own code, whichever client asks', async () => {
      const planId = await h.plan('K5');
      const token = h.dataOf<{ accessToken: string }>(
        await login(h.seed.superAdmin.email, h.seed.superAdmin.password).expect(200),
      ).accessToken;
      const requests = await h.requestRows();

      for (const [, label] of CHANNELS) {
        const refused = await request(h.server())
          .post('/api/v1/access-requests')
          .set(bearer(token, label))
          .send(h.form(planId))
          .expect(403);
        expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST');
      }
      expect(await h.requestRows()).toBe(requests);
    });

    // Role-gated operations, one per role, read from the guard of each route: what each kind of account may open.
    const GATED: [string, string, string][] = [
      ['IT_ADMIN', 'GET', '/api/v1/provisioning-tasks'],
      ['FINANCE', 'GET', '/api/v1/finance-reviews'],
      ['MANAGER', 'GET', '/api/v1/spend-queue'],
      ['SUPER_ADMIN', 'GET', '/api/v1/app-users'],
    ];
    const SELF_SERVICE = [
      '/api/v1/me',
      '/api/v1/notifications',
      '/api/v1/notifications/unread-count',
      '/api/v1/me/software-rights',
      '/api/v1/me/access-requests',
      '/api/v1/dashboards/employee',
    ];

    it.each([
      ['an account with no role', async () => (await person()).account.accessToken, []],
      ['an Employee', async () => (await person(['EMPLOYEE'])).account.accessToken, []],
      ['an IT Admin', async () => (await person(['IT_ADMIN'])).account.accessToken, ['IT_ADMIN']],
      ['the Finance', () => Promise.resolve(h.finance.accessToken), ['FINANCE']],
      [
        'the Super Admin',
        async () =>
          h.dataOf<{ accessToken: string }>(
            await login(h.seed.superAdmin.email, h.seed.superAdmin.password).expect(200),
          ).accessToken,
        ['SUPER_ADMIN'],
      ],
      [
        'a head of department',
        async () => {
          counter += 1;
          const own = await h.departmentWithUnit(`P-MH${counter}`);
          const head = await h.staff(own, `MOB-H${counter}`);
          await h.makeHead(own, head);

          return head.account.accessToken;
        },
        ['MANAGER'],
      ],
    ] as [string, () => Promise<string>, string[]][])(
      'opens to %s only the operations of the roles it holds, and the self-service ones to everybody',
      async (_name, tokenOf, held) => {
        const token = await tokenOf();

        for (const [role, , path] of GATED) {
          const answer = await get(path, token);
          expect([path, answer.status]).toEqual([path, held.includes(role) ? 200 : 403]);
        }
        for (const path of SELF_SERVICE) await get(path, token).expect(200);
      },
    );
  });

  it('lets IT Admin and Finance send and withdraw through mobile labels', async () => {
    const planId = await h.plan('K5');
    for (const account of [(await person(['IT_ADMIN'])).account, h.finance]) {
      const sent = await request(h.server())
        .post('/api/v1/access-requests')
        .set(bearer(account.accessToken))
        .send(h.form(planId))
        .expect(201);
      const id = h.dataOf<{ request: { id: string } }>(sent).request.id;
      await request(h.server())
        .post(`/api/v1/access-requests/${id}/withdraw`)
        .set(bearer(account.accessToken))
        .send({ reason: 'Mobile request cancelled' })
        .expect(200);
    }
  });

  it('gives a mobile MANAGER the need queue and own self-service without EMPLOYEE, and routes their request away', async () => {
    const own = await h.departmentWithUnit(`P-MSELF${++counter}`);
    const head = await h.staff(own, `MOB-SELF${counter}`, ['MANAGER']);
    await h.makeHead(own, head);
    const token = head.account.accessToken;
    expect((await meOf(token)).roles).toEqual(['MANAGER']);
    for (const path of [
      '/api/v1/need-decisions',
      '/api/v1/me/software-rights',
      '/api/v1/me/access-requests',
      '/api/v1/dashboards/employee',
    ]) {
      await get(path, token).expect(200);
    }
    const sent = await request(h.server())
      .post('/api/v1/access-requests')
      .set(bearer(token))
      .send(h.form(await h.plan('K5')))
      .expect(201);
    const wire = h.dataOf<{ request: { needStep: { assignee: { employeeId: string } | null } } }>(sent).request;
    expect(wire.needStep.assignee?.employeeId).toBe(h.boss.employeeId);
    expect(wire.needStep.assignee?.employeeId).not.toBe(head.employeeId);
  });

  describe('the roles that unlock the approver tasks follow the data as well (US-16-04 AC-6; US-01-03 AC-2)', () => {
    it('shows the spending approver the granted role while they hold it and drops it at the next call when the grant ends', async () => {
      const token = h.boss.account.accessToken;
      // The approver heads no department (QĐ-93b) and holds the role as a grant (QĐ-93a); nothing derives it.
      expect(await meOf(token)).toMatchObject({ roles: ['SPENDING_APPROVER'], managerScope: null });

      await h.clearRole('SPENDING_APPROVER');

      expect((await meOf(token)).roles).toEqual([]);
    });
  });

  /** Creates an account through `POST /app-users` with exactly `roles`, activates it through its invitation and signs it in. */
  async function accountMadeThroughTheApi(roles: string[]): Promise<ApiAccount> {
    counter += 1;
    const code = `MOB-API-${counter}`;
    const employeeId = await h.member(department.code, code, await h.title());
    const created = await adminPost('/api/v1/app-users', { employeeId, roles }).expect(201);
    const appUserId = h.dataOf<{ id: string }>(created).id;
    await activateInvitedAccount(h.ctx, appUserId);
    const email = `${code.toLowerCase()}@acme.vn`;
    const signedIn = await login(email, passwordOf()).expect(200);

    return { appUserId, employeeId, email, accessToken: h.dataOf<{ accessToken: string }>(signedIn).accessToken };
  }
});
