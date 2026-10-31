import request from 'supertest';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../../support/http-test-app';

interface GroupWire {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}

describe('functional groups over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let it1: ApiAccount;
  let finance: ApiAccount;
  let employee: ApiAccount;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    const admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', roles: ['IT_ADMIN'], admin });
    finance = await createActivatedAccount(ctx, seed, {
      code: 'E-FIN',
      email: 'fin@acme.vn',
      roles: ['FINANCE'],
      admin,
    });
    employee = await createActivatedAccount(ctx, seed, { code: 'E-EMP', email: 'emp@acme.vn', roles: [], admin });
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  const unique = (prefix: string): string => `${prefix} ${(counter += 1)}`;
  const dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;
  const codeOf = (response: request.Response): string => (response.body as { error: { code: string } }).error.code;
  const create = (body: object, account: ApiAccount = it1) =>
    request(server()).post('/api/v1/functional-groups').set(as(account)).send(body);
  const patch = (id: string, body: object, account: ApiAccount = it1) =>
    request(server()).patch(`/api/v1/functional-groups/${id}`).set(as(account)).send(body);
  const auditOf = async (resourceId: string) =>
    (
      await ctx.sql.query<{ action: string; before: unknown; after: unknown; actor_roles: string[] }>(
        'SELECT action, before, after, actor_roles FROM audit_events WHERE resource_id = $1 ORDER BY occurred_at, id',
        [resourceId],
      )
    ).rows;
  const count = async (): Promise<number> =>
    (await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM functional_groups')).rows[0].n;

  it('creates a group, active, and records who did it', async () => {
    const created = dataOf<GroupWire>(await create({ name: '  Thiết kế   giao diện ' }).expect(201));

    expect(created).toMatchObject({ name: 'Thiết kế giao diện', status: 'ACTIVE' });
    expect(await auditOf(created.id)).toEqual([
      {
        action: 'FUNCTIONAL_GROUP.CREATED',
        before: null,
        after: { name: 'Thiết kế giao diện', status: 'ACTIVE' },
        actor_roles: ['IT_ADMIN'],
      },
    ]);
  });

  it('refuses a name equal to another once case, accents and spacing are ignored: 409, one row', async () => {
    const name = unique('Giao tiếp');
    await create({ name }).expect(201);
    const before = await count();

    expect(codeOf(await create({ name: `  ${name.toUpperCase()} ` }).expect(409))).toBe('FUNCTIONAL_GROUP.NAME_TAKEN');
    expect(await count()).toBe(before);
  });

  it('refuses an empty name or one over 200 characters: 422 FUNCTIONAL_GROUP.NAME_INVALID', async () => {
    expect(codeOf(await create({ name: '   ' }).expect(422))).toBe('FUNCTIONAL_GROUP.NAME_INVALID');
    expect(codeOf(await create({ name: 'N'.repeat(201) }).expect(422))).toBe('FUNCTIONAL_GROUP.NAME_INVALID');
  });

  it('lets exactly one of two simultaneous groups with the same name succeed', async () => {
    const name = unique('Race');

    const results = await Promise.all([create({ name }), create({ name })]);

    expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
  });

  it('renames and deactivates a group, audits before and after, and leaves a no-op unaudited', async () => {
    const created = dataOf<GroupWire>(await create({ name: unique('Old name') }).expect(201));

    const renamed = dataOf<GroupWire>(await patch(created.id, { name: unique('New name') }).expect(200));
    const off = dataOf<GroupWire>(await patch(created.id, { status: 'INACTIVE' }).expect(200));
    await patch(created.id, { status: 'INACTIVE' }).expect(200);

    expect(renamed.name).toMatch(/^New name/);
    expect(off.status).toBe('INACTIVE');
    const events = await auditOf(created.id);
    expect(events.map((event) => event.action)).toEqual([
      'FUNCTIONAL_GROUP.CREATED',
      'FUNCTIONAL_GROUP.UPDATED',
      'FUNCTIONAL_GROUP.UPDATED',
    ]);
    expect(events[2]).toMatchObject({
      before: { name: renamed.name, status: 'ACTIVE' },
      after: { name: renamed.name, status: 'INACTIVE' },
    });
  });

  it('refuses a rename onto another group name with 409, answers 404 for a missing group and 422 for an empty update', async () => {
    const a = dataOf<GroupWire>(await create({ name: unique('Alpha') }).expect(201));
    const b = dataOf<GroupWire>(await create({ name: unique('Beta') }).expect(201));

    expect(codeOf(await patch(b.id, { name: a.name.toUpperCase() }).expect(409))).toBe('FUNCTIONAL_GROUP.NAME_TAKEN');
    expect(codeOf(await patch('3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11', { name: 'x' }).expect(404))).toBe(
      'FUNCTIONAL_GROUP.NOT_FOUND',
    );
    expect(codeOf(await patch(a.id, {}).expect(422))).toBe('FUNCTIONAL_GROUP.UPDATE_EMPTY');
  });

  it('lists groups by name, filtered by status, in pages from one snapshot', async () => {
    const tag = unique('Listing');
    const first = dataOf<GroupWire>(await create({ name: `${tag} B` }).expect(201));
    await create({ name: `${tag} A` }).expect(201);
    await patch(first.id, { status: 'INACTIVE' }).expect(200);

    const all = dataOf<{ items: GroupWire[]; pagination: { totalItems: number } }>(
      await request(server()).get('/api/v1/functional-groups').query({ pageSize: 100 }).set(as(it1)).expect(200),
    );
    const mine = all.items.filter((item) => item.name.startsWith(tag));
    expect(mine.map((item) => item.name)).toEqual([`${tag} A`, `${tag} B`]);

    const inactive = dataOf<{ items: GroupWire[] }>(
      await request(server())
        .get('/api/v1/functional-groups')
        .query({ status: 'INACTIVE', pageSize: 100 })
        .set(as(finance))
        .expect(200),
    );
    expect(inactive.items.map((item) => item.name)).toContain(`${tag} B`);
    expect(inactive.items.map((item) => item.name)).not.toContain(`${tag} A`);

    const paged = dataOf<{ items: GroupWire[]; pagination: { page: number; pageSize: number } }>(
      await request(server()).get('/api/v1/functional-groups').query({ page: 2, pageSize: 1 }).set(as(it1)).expect(200),
    );
    expect(paged.items).toHaveLength(1);
    expect(paged.pagination).toMatchObject({ page: 2, pageSize: 1 });
  });

  it('lets Finance read but not write, and turns an employee away from both', async () => {
    const before = await count();

    await request(server()).get('/api/v1/functional-groups').set(as(finance)).expect(200);
    await create({ name: unique('Nope') }, finance).expect(403);
    await patch('3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11', { name: 'x' }, finance).expect(403);
    await request(server()).get('/api/v1/functional-groups').set(as(employee)).expect(403);
    await create({ name: unique('Nope') }, employee).expect(403);

    expect(await count()).toBe(before);
  });
});
