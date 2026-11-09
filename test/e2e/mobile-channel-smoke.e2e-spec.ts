import request from 'supertest';
import { ACCOUNT_PASSWORD } from '../support/api-accounts';
import { type AccessRequestWire, type Department, type Person } from '../support/request-harness';
import { StatusHarness, type NoticeWire } from '../support/status-harness';

const h = new StatusHarness();
const MOBILE = { 'User-Agent': 'SLM-Mobile/1.0 (iOS 19)', 'X-Client': 'mobile' } as const;

interface Session {
  accessToken: string;
  refreshToken: string;
}
interface Inbox {
  items: NoticeWire[];
}

/**
 * E2E smoke of the mobile channel: the app signs in, reads a list, acts, and finds the outcome in the inbox, on the same routes
 * as the web with nothing but a client label of its own. Real HTTP, real PostgreSQL. It proves the BE sequence only: the native
 * client, push, offline and the screens are the Mobile developer's and are not verified here.
 */
describe('mobile channel: sign in, list, act, inbox, sign out (e2e)', () => {
  let design: Department;
  let head: Person;
  let employee: Person;
  let colleague: Person;
  let planId: string;
  let requestId: string;
  let employeeSession: Session;
  let headSession: Session;

  const bearer = (session: Session) => ({ Authorization: `Bearer ${session.accessToken}`, ...MOBILE });
  const get = (path: string, session: Session) => request(h.server()).get(path).set(bearer(session));
  const post = (path: string, session: Session, body?: object) =>
    request(h.server()).post(path).set(bearer(session)).send(body);
  const signIn = async (person: Person): Promise<Session> =>
    h.dataOf<Session>(
      await request(h.server())
        .post('/api/v1/auth/login')
        .set(MOBILE)
        .send({ email: person.account.email, password: ACCOUNT_PASSWORD })
        .expect(200),
    );
  const inbox = async (session: Session): Promise<NoticeWire[]> =>
    h.dataOf<Inbox>(await get('/api/v1/notifications', session).expect(200)).items;
  const unread = async (session: Session): Promise<number> =>
    h.dataOf<{ unread: number }>(await get('/api/v1/notifications/unread-count', session).expect(200)).unread;
  const codesAbout = (items: NoticeWire[], id: string) =>
    items.filter((item) => item.subject?.id === id).map((item) => item.code);

  beforeAll(async () => {
    await h.start();
    design = await h.departmentWithUnit('P-MOB');
    head = await h.staff(design, 'MOB-H1', 'EMPLOYEE');
    await h.makeHead(design, head);
    employee = await h.staff(design, 'MOB-E1', 'EMPLOYEE');
    colleague = await h.staff(design, 'MOB-E2', 'EMPLOYEE');
    // An internal application (K5): no price and no spend step, the shortest chain a request has.
    planId = await h.plan('K5');
  }, 180000);

  afterAll(async () => {
    await h.stop();
  });

  it('signs the employee in, and /me gives the roles the web would give', async () => {
    employeeSession = await signIn(employee);

    const me = h.dataOf<{ roles: string[] }>(await get('/api/v1/me', employeeSession).expect(200));
    expect(me).toMatchObject({ roles: ['EMPLOYEE'] });
  });

  it('lists the software and the drafts of the employee (none yet), finds the plan in the catalog, previews the request and sends it: it is the one the web would make', async () => {
    const rights = h.dataOf<{ items: unknown[] }>(await get('/api/v1/me/software-rights', employeeSession).expect(200));
    expect(rights.items).toEqual([]);
    const drafts = h.dataOf<{ items: unknown[] }>(
      await get('/api/v1/access-requests/drafts', employeeSession).expect(200),
    );
    expect(drafts.items).toEqual([]);
    // The catalog of what a person may request (A-01), not the catalog of the IT Admin.
    const plans = h.dataOf<{ items: Array<{ id: string }> }>(
      await get('/api/v1/requestable-plans?pageSize=100', employeeSession).expect(200),
    );
    expect(plans.items.map((plan) => plan.id)).toContain(planId);
    await get(`/api/v1/requestable-plans/${planId}`, employeeSession).expect(200);

    const preview = await post('/api/v1/access-requests/preview', employeeSession, { planId }).expect(200);
    expect(h.dataOf<{ preview: { canSubmit: boolean } }>(preview).preview.canSubmit).toBe(true);

    const sent = await post('/api/v1/access-requests', employeeSession, h.form(planId)).expect(201);
    const wire = h.dataOf<{ request: AccessRequestWire }>(sent).request;
    requestId = wire.id;
    expect(wire).toMatchObject({
      branch: 'INTERNAL_FREE',
      state: 'PENDING',
      requester: { employeeId: employee.employeeId },
      needStep: { state: 'PENDING', assignee: { employeeId: head.employeeId } },
    });
  });

  it('tells the employee in the inbox, and tells the head the step is theirs: each reads only their own notice', async () => {
    await h.project();
    headSession = await signIn(head);

    const mine = await inbox(employeeSession);
    expect(codesAbout(mine, requestId)).toEqual(['REQUEST_SUBMITTED']);
    expect(mine.find((item) => item.subject?.id === requestId)?.params).toEqual({
      requestId,
      stage: 'WAITING_NEED_DECISION',
    });
    expect(await unread(employeeSession)).toBe(1);
    expect(codesAbout(await inbox(headSession), requestId)).toEqual(['STEP_ASSIGNED']);
    // Neither the colleague of the same department nor an IT Admin is told anything about it.
    expect(codesAbout(await inbox(await signIn(colleague)), requestId)).toEqual([]);
    expect(codesAbout(await inbox(await signIn({ employeeId: h.it1.employeeId, account: h.it1 })), requestId)).toEqual(
      [],
    );
  });

  it('lets only the head decide the step, and the employee finds the outcome in the inbox, reads it once and nobody else can mark it', async () => {
    // The colleague of the same department has no part in the request: they cannot open it, decide it or learn it exists.
    const colleagueSession = await signIn(colleague);
    const hidden = await get(`/api/v1/access-requests/${requestId}`, colleagueSession).expect(404);
    expect(h.codeOf(hidden)).toBe('ACCESS_REQUEST.NOT_FOUND');
    await post(`/api/v1/access-requests/${requestId}/need-decision`, colleagueSession, { decision: 'APPROVE' }).expect(
      404,
    );
    await post(`/api/v1/access-requests/${requestId}/need-decision`, headSession, { decision: 'APPROVE' }).expect(200);
    await h.project();

    const notices = await inbox(employeeSession);
    expect(codesAbout(notices, requestId)).toEqual(['REQUEST_NEED_APPROVED', 'REQUEST_SUBMITTED']);
    expect(await unread(employeeSession)).toBe(2);

    const outcome = notices.find((item) => item.code === 'REQUEST_NEED_APPROVED');
    if (!outcome) throw new Error('the outcome notice is missing');
    await post(`/api/v1/notifications/${outcome.id}/read`, headSession).expect(404);
    const read = h.dataOf<{ notification: NoticeWire }>(
      await post(`/api/v1/notifications/${outcome.id}/read`, employeeSession).expect(200),
    );
    expect(read.notification.readAt).not.toBeNull();
    const again = h.dataOf<{ notification: NoticeWire }>(
      await post(`/api/v1/notifications/${outcome.id}/read`, employeeSession).expect(200),
    );
    expect(again.notification.readAt).toBe(read.notification.readAt);
    expect(await unread(employeeSession)).toBe(1);
  });

  it('lets the employee withdraw a second request from the phone, and the head reads the closing of the step in their inbox', async () => {
    const second = h.dataOf<{ request: AccessRequestWire }>(
      await post('/api/v1/access-requests', employeeSession, h.form(planId)).expect(201),
    ).request;
    await h.project();
    // Somebody else's request is not the employee's to withdraw, and is not found for them.
    await post(`/api/v1/access-requests/${second.id}/withdraw`, await signIn(colleague), {}).expect(404);

    const withdrawn = await post(`/api/v1/access-requests/${second.id}/withdraw`, employeeSession, {}).expect(200);
    expect(h.dataOf<{ request: AccessRequestWire }>(withdrawn).request.state).toBe('WITHDRAWN');
    await h.project();

    // The inbox lists the newest first.
    expect(codesAbout(await inbox(headSession), second.id)).toEqual(['STEP_CLOSED_BY_WITHDRAWAL', 'STEP_ASSIGNED']);
  });

  it('ends the employee at the next operation when the account is locked, and ends the head at sign out', async () => {
    await request(h.server())
      .post(`/api/v1/app-users/${employee.account.appUserId}/lock`)
      .set({ Authorization: `Bearer ${h.admin}` })
      .send({ reason: 'End of the mobile smoke run' })
      .expect(200);
    await get('/api/v1/notifications', employeeSession).expect(401);
    await post('/api/v1/auth/refresh', employeeSession, { refreshToken: employeeSession.refreshToken }).expect(401);

    await post('/api/v1/auth/logout', headSession, { refreshToken: headSession.refreshToken }).expect(204);
    await get('/api/v1/notifications', headSession).expect(401);
    await post('/api/v1/auth/refresh', headSession, { refreshToken: headSession.refreshToken }).expect(401);
  });
});
