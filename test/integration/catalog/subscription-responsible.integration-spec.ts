import request from 'supertest';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../../support/http-test-app';
import { declareApplication } from '../../support/builders/catalog.builder';

interface SubscriptionWire {
  id: string;
  responsibleItAdminEmployeeId: string | null;
  responsibleItAdmin: { employeeId: string } | null;
  changed?: boolean;
}

/**
 * Redesign wave 2, W2-27 H16 (Owner Q7): who answers for a subscription changes hands in one route, for the Super Admin only; the update of a
 * subscription no longer takes the field.
 */
describe('the IT Admin who answers for a subscription over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let admin: string;
  let it1: ApiAccount;
  let it2: ApiAccount;
  let finance: ApiAccount;
  let employee: ApiAccount;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', role: 'IT_ADMIN', admin });
    it2 = await createActivatedAccount(ctx, seed, { code: 'E-IT2', email: 'it2@acme.vn', role: 'IT_ADMIN', admin });
    finance = await createActivatedAccount(ctx, seed, { code: 'E-FIN', email: 'fin@acme.vn', role: 'FINANCE', admin });
    employee = await createActivatedAccount(ctx, seed, {
      code: 'E-EMP',
      email: 'emp@acme.vn',
      role: 'EMPLOYEE',
      admin,
    });
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  const unique = (prefix: string): string => `${prefix} ${(counter += 1)}`;
  const dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;
  const codeOf = (response: request.Response): string => (response.body as { error: { code: string } }).error.code;
  const change = (id: string, body: object, token: string) =>
    request(server())
      .post(`/api/v1/subscriptions/${id}/responsible-it-admin`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const subscription = async (): Promise<SubscriptionWire> => {
    const application = await declareApplication(ctx, it1.accessToken, {
      name: unique('Software'),
      kind: 'LICENSED',
      vendorName: unique('Vendor'),
      dataSensitivity: 'LOW',
    });
    const plan = dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/plans')
        .set(as(it1))
        .send({ applicationId: application, name: unique('Perpetual'), provisioningType: 'K4', controlLevel: 'FULL' })
        .expect(201),
    );

    return dataOf<SubscriptionWire>(
      await request(server())
        .post('/api/v1/subscriptions')
        .set(as(it1))
        .send({
          planId: plan.id,
          kind: 'PERPETUAL',
          purchasedQuantity: 3,
          unitPrice: { amount: '2000000', currency: 'VND' },
          startDate: '2026-03-15',
          responsibleItAdminEmployeeId: it1.employeeId,
        })
        .expect(201),
    );
  };
  const auditOf = async (id: string) =>
    (
      await ctx.sql.query<{ action: string; before: unknown; after: unknown }>(
        `SELECT action, before, after FROM audit_events WHERE resource_id = $1 AND action = 'SUBSCRIPTION.RESPONSIBLE_CHANGED' ORDER BY occurred_at, id`,
        [id],
      )
    ).rows;

  it('lets the Super Admin name another IT Admin, answers the subscription with changed true, and audits from whom to whom and why', async () => {
    const created = await subscription();
    expect(created.responsibleItAdminEmployeeId).toBe(it1.employeeId);

    const response = await change(
      created.id,
      { employeeId: it2.employeeId, reason: 'IT 1 moves to another project' },
      admin,
    ).expect(200);

    expect(dataOf<SubscriptionWire>(response)).toMatchObject({
      id: created.id,
      responsibleItAdminEmployeeId: it2.employeeId,
      responsibleItAdmin: { employeeId: it2.employeeId },
      changed: true,
    });
    expect(await auditOf(created.id)).toEqual([
      {
        action: 'SUBSCRIPTION.RESPONSIBLE_CHANGED',
        before: { responsibleItAdminEmployeeId: it1.employeeId },
        after: { responsibleItAdminEmployeeId: it2.employeeId, reason: 'IT 1 moves to another project' },
      },
    ]);
  });

  it('changes nothing, writes nothing and audits nothing when the IT Admin named already answers for it', async () => {
    const created = await subscription();

    const response = await change(created.id, { employeeId: it1.employeeId, reason: 'No change' }, admin).expect(200);

    expect(dataOf<SubscriptionWire>(response)).toMatchObject({
      responsibleItAdminEmployeeId: it1.employeeId,
      changed: false,
    });
    expect(await auditOf(created.id)).toEqual([]);
  });

  it('refuses every IT Admin, even the one who answers for the subscription, and Finance and an employee (403)', async () => {
    const created = await subscription();
    const body = { employeeId: it2.employeeId, reason: 'Take it' };

    for (const account of [it1, it2, finance, employee]) {
      expect(codeOf(await change(created.id, body, account.accessToken).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
    }
    expect(await auditOf(created.id)).toEqual([]);
  });

  it('refuses a person who is not an IT Admin who works now (422) and leaves the subscription as it was', async () => {
    const created = await subscription();

    const response = await change(
      created.id,
      { employeeId: employee.employeeId, reason: 'Wrong person' },
      admin,
    ).expect(422);

    expect(codeOf(response)).toBe('SUBSCRIPTION.RESPONSIBLE_NOT_IT_ADMIN');
    expect(await auditOf(created.id)).toEqual([]);
    const after = dataOf<SubscriptionWire>(
      await request(server()).get(`/api/v1/subscriptions/${created.id}`).set(as(it1)).expect(200),
    );
    expect(after.responsibleItAdminEmployeeId).toBe(it1.employeeId);
  });

  it('answers 404 for a subscription that does not exist and 422 for a body that is missing a field or has a blank reason', async () => {
    const created = await subscription();

    await change('00000000-0000-4000-8000-000000000000', { employeeId: it2.employeeId, reason: 'Gone' }, admin).expect(
      404,
    );
    expect(codeOf(await change(created.id, { employeeId: it2.employeeId }, admin).expect(422))).toBe(
      'VALIDATION_ERROR',
    );
    expect(codeOf(await change(created.id, { employeeId: it2.employeeId, reason: '   ' }, admin).expect(422))).toBe(
      'VALIDATION_ERROR',
    );
    expect(codeOf(await change(created.id, { reason: 'No one' }, admin).expect(422))).toBe('VALIDATION_ERROR');
  });

  it('no longer takes the field in the update of a subscription (422), for any IT Admin', async () => {
    const created = await subscription();

    const response = await request(server())
      .patch(`/api/v1/subscriptions/${created.id}`)
      .set(as(it1))
      .send({ responsibleItAdminEmployeeId: it2.employeeId })
      .expect(422);

    expect(codeOf(response)).toBe('VALIDATION_ERROR');
    const after = dataOf<SubscriptionWire>(
      await request(server()).get(`/api/v1/subscriptions/${created.id}`).set(as(it1)).expect(200),
    );
    expect(after.responsibleItAdminEmployeeId).toBe(it1.employeeId);
  });

  it('keeps the field in the declaration of a subscription', async () => {
    const created = await subscription();

    expect(created.responsibleItAdminEmployeeId).toBe(it1.employeeId);
  });
});
