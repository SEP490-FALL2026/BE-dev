import request from 'supertest';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../../support/http-test-app';
import { ensureManagerGrant } from '../../support/builders/account.builder';

const ORG_TIME_ZONE = 'Asia/Ho_Chi_Minh';

function today(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ORG_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';

  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

describe('the Super Admin role cannot be handed over in the application (integration, real PostgreSQL): the route is gone', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let admin: string;
  const server = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    admin = await adminToken(ctx, seed);
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  const roleState = async () => ({
    grants: (
      await ctx.sql.query<{ app_user_id: string; role: string; revoked_at: Date | null }>(
        'SELECT app_user_id, role, revoked_at FROM role_grants ORDER BY app_user_id, role, granted_at',
      )
    ).rows,
    audit: Number((await ctx.sql.query<{ n: string }>('SELECT count(*) AS n FROM audit_events')).rows[0].n),
  });

  it('answers 404 to the removed transfer route and changes nothing', async () => {
    const successor = await createActivatedAccount(ctx, seed, {
      code: 'E-SU1',
      email: 'su1@acme.vn',
      role: 'EMPLOYEE',
      admin,
    });
    const itAdmin = await createActivatedAccount(ctx, seed, {
      code: 'E-IT1',
      email: 'it1@acme.vn',
      role: 'IT_ADMIN',
      admin,
    });
    const finance = await createActivatedAccount(ctx, seed, {
      code: 'E-FI1',
      email: 'fi1@acme.vn',
      role: 'FINANCE',
      admin,
    });
    const head: ApiAccount = await createActivatedAccount(ctx, seed, {
      code: 'E-HD1',
      email: 'hd1@acme.vn',
      role: 'EMPLOYEE',
      admin,
    });
    await ensureManagerGrant(ctx, admin, head.employeeId);
    await request(server())
      .post(`/api/v1/departments/${seed.departmentId}/head-assignments`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ employeeId: head.employeeId, effectiveFrom: today() })
      .expect(200);
    const employee = await createActivatedAccount(ctx, seed, {
      code: 'E-EM1',
      email: 'em1@acme.vn',
      role: 'EMPLOYEE',
      admin,
    });
    const before = await roleState();

    const callers: [string, string | null][] = [
      ['the holder', admin],
      ['an IT Admin', itAdmin.accessToken],
      ['Finance', finance.accessToken],
      ['a department head', head.accessToken],
      ['an employee', employee.accessToken],
      ['nobody signed in', null],
    ];
    for (const [caller, token] of callers) {
      const call = request(server()).post('/api/v1/super-admin-transfers');
      const response = await (token ? call.set('Authorization', `Bearer ${token}`) : call).send({
        successorAppUserId: successor.appUserId,
      });

      expect([caller, response.status]).toEqual([caller, 404]);
    }

    expect(await roleState()).toEqual(before);
    const holders = await ctx.sql.query<{ app_user_id: string }>(
      `SELECT app_user_id FROM role_grants WHERE role = 'SUPER_ADMIN' AND revoked_at IS NULL`,
    );
    expect(holders.rows).toEqual([{ app_user_id: seed.superAdmin.appUserId }]);
    await request(server()).get('/api/v1/app-users').set('Authorization', `Bearer ${admin}`).expect(200);
  });
});
