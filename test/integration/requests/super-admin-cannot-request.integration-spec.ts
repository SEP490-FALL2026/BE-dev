import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ReturnHarness } from '../../support/return-harness';

/**
 * `g0-g6-final-business-baseline-remediation`, Task 4.1 (F30, spec L.1): the Super Admin administers the installation and sends no request
 * of their own. Every operation that sends a request, and every one that keeps a draft of one, answers 403
 * `ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST` and writes nothing; the answer comes from the service, so a caller that is not a route (the
 * drafts, the sending of one) is judged the same. A person who is not the Super Admin is not touched by it.
 */
const h = new ReturnHarness();

describe('the Super Admin sends no request (integration, real PostgreSQL)', () => {
  let plan: string;
  const admin = () => ({ Authorization: `Bearer ${h.admin}` });
  const post = (path: string, body: object) => request(h.server()).post(`/api/v1${path}`).set(admin()).send(body);

  beforeAll(async () => {
    await h.start();
    plan = await h.plan('K2');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const count = async (table: string): Promise<number> =>
    Number((await h.ctx.sql.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);

  /** Every operation that sends a request, with a body that is valid for it: what is refused is the person, never the content. */
  const submitOperations = (): Array<[string, () => request.Test]> => [
    ['accessRequestSubmit', () => post('/access-requests', h.form(plan))],
    ['accessRequestPropose', () => post('/access-requests/proposals', h.proposeBody())],
    [
      'groupRequestSubmit',
      () =>
        post('/group-requests', {
          planId: plan,
          lines: [{ employeeId: randomUUID() }],
          businessReason: 'The new brand needs the shared workspace',
          termMonths: 6,
        }),
    ],
    [
      'accessRequestServiceAccountSubmit',
      () =>
        post('/access-requests/service-accounts', {
          planId: plan,
          purpose: 'Build bot of the CI pipeline',
          expectedIdentifier: 'ci-bot-admin',
          businessReason: 'Run the builds of the product',
          termMonths: 1,
        }),
    ],
    [
      'accessRequestRenewalSubmit',
      () =>
        post('/access-requests/renewals', {
          assignmentId: randomUUID(),
          extensionMonths: 3,
          businessReason: 'The work goes on',
        }),
    ],
  ];
  /** Every operation of the drafts. */
  const draftOperations = (): Array<[string, () => request.Test]> => [
    [
      'accessRequestDraftSave (individual)',
      () => post('/access-requests/drafts', { kind: 'INDIVIDUAL', ...h.form(plan) }),
    ],
    [
      'accessRequestDraftSave (group)',
      () =>
        post('/access-requests/drafts', {
          kind: 'GROUP',
          planId: plan,
          lines: [{ employeeId: randomUUID() }],
          businessReason: 'The new brand needs the shared workspace',
          termMonths: 6,
        }),
    ],
    [
      'accessRequestDraftSave (service account)',
      () =>
        post('/access-requests/drafts', {
          kind: 'SERVICE_ACCOUNT',
          planId: plan,
          purpose: 'Build bot of the CI pipeline',
          expectedIdentifier: 'ci-bot-admin',
          businessReason: 'Run the builds of the product',
          termMonths: 1,
        }),
    ],
    ['accessRequestDraftList', () => request(h.server()).get('/api/v1/access-requests/drafts').set(admin())],
    ['accessRequestDraftSubmit', () => post(`/access-requests/drafts/${randomUUID()}/submission`, {})],
    [
      'accessRequestDraftDelete',
      () => request(h.server()).delete(`/api/v1/access-requests/drafts/${randomUUID()}`).set(admin()),
    ],
  ];

  it('answers 403 ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST to each operation that sends a request, and writes nothing', async () => {
    const rows = [await count('access_requests'), await count('audit_events'), await count('access_request_steps')];

    for (const [operation, call] of submitOperations()) {
      const response = await call();

      expect([operation, response.status, h.codeOf(response)]).toEqual([
        operation,
        403,
        'ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST',
      ]);
    }
    expect([await count('access_requests'), await count('audit_events'), await count('access_request_steps')]).toEqual(
      rows,
    );
  });

  it('answers 403 ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST to each operation of the drafts, before anything is looked up, and keeps no draft', async () => {
    const rows = [await count('access_requests'), await count('audit_events')];

    for (const [operation, call] of draftOperations()) {
      const response = await call();

      expect([operation, response.status, h.codeOf(response)]).toEqual([
        operation,
        403,
        'ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST',
      ]);
    }
    expect([await count('access_requests'), await count('audit_events')]).toEqual(rows);
  });

  it('is not what stops a person who is not the Super Admin: the same operations take them as they always did', async () => {
    const department = await h.departmentWithUnit('P-F30');
    const person = await h.staff(department, 'F30-E1');

    const sent = await h.submit(h.form(plan), person.account);

    expect(sent.status).toBe(201);
  });

  it('refuses even the Super Admin own seat and leaves the seat and audit unchanged', async () => {
    const account = { ...h.seed.superAdmin, accessToken: h.admin };
    const assignmentId = await h.seatOf({ employeeId: account.employeeId, account }, { planId: await h.plan('K5') });
    const before = [await count('return_requests'), await count('provisioning_tasks'), await count('audit_events')];
    const response = await h.returnSeat({ assignmentId, reason: 'No longer needed' }, account).expect(403);
    expect(h.codeOf(response)).toBe('ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST');
    expect([await count('return_requests'), await count('provisioning_tasks'), await count('audit_events')]).toEqual(
      before,
    );
    expect((await h.seatRow(assignmentId)).valid_until).toBeNull();
  });
});
