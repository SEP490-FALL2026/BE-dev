import request from 'supertest';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import { declareApplication, declarePlan } from '../../support/builders/catalog.builder';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../../support/http-test-app';

interface PlanWire {
  name: string;
}

/**
 * CT-1.6: the plan list the IT Admin filters by the functional group and the catalog status of the application, and searches by the name of the plan or
 * of the application, over HTTP and real PostgreSQL.
 */
describe('GET /plans: the filters of the list (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let it1: ApiAccount;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    const admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', role: 'IT_ADMIN', admin });
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  const unique = (prefix: string): string => `${prefix} ${(counter += 1)}`;
  const dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;
  const codeOf = (response: request.Response): string => (response.body as { error: { code: string } }).error.code;
  const plan = (applicationId: string, input: { name: string }) =>
    declarePlan(ctx, it1.accessToken, {
      applicationId,
      name: input.name,
      provisioningType: 'K2',
      controlLevel: 'FULL',
    });

  it('CT-1.6: filters the plan list by the functional group of the application, its catalog status and a search over plan and application names', async () => {
    const tag = unique('Filter').replace(/ /g, '-');
    const group = async (name: string): Promise<string> =>
      dataOf<{ id: string }>(
        await request(server()).post('/api/v1/functional-groups').set(as(it1)).send({ name }).expect(201),
      ).id;
    const design = await group(`${tag} Design`);
    const writing = await group(`${tag} Writing`);
    const declare = (name: string, functionalGroupId: string) =>
      declareApplication(ctx, it1.accessToken, {
        name,
        kind: 'SAAS',
        vendorName: `${name} vendor`,
        dataSensitivity: 'LOW',
        functionalGroupId,
      });
    const figma = await declare(`${tag} Fígma`, design);
    const notion = await declare(`${tag} Notion`, writing);
    await plan(figma, { name: 'Organization' });
    await plan(figma, { name: 'Professional' });
    await plan(figma, { name: 'Pay_as%you' });
    await plan(notion, { name: 'Team' });
    await ctx.sql.query(`UPDATE applications SET catalog_status = 'RETIRED', retired_at = now() WHERE id = $1`, [
      notion,
    ]);
    const list = async (query: object) =>
      dataOf<{ items: PlanWire[]; pagination: { totalItems: number } }>(
        await request(server()).get('/api/v1/plans').query(query).set(as(it1)).expect(200),
      );
    const names = (page: { items: PlanWire[] }) => page.items.map((item) => item.name);

    expect(names(await list({ functionalGroupId: design }))).toEqual(['Organization', 'Pay_as%you', 'Professional']);
    expect(names(await list({ functionalGroupId: writing }))).toEqual(['Team']);
    expect(names(await list({ functionalGroupId: design, status: 'APPROVED' }))).toEqual([
      'Organization',
      'Pay_as%you',
      'Professional',
    ]);
    expect(names(await list({ functionalGroupId: design, status: 'RETIRED' }))).toEqual([]);
    expect(names(await list({ functionalGroupId: writing, status: 'RETIRED' }))).toEqual(['Team']);
    // The search reads the plan name and the application name, ignoring case and accents.
    expect(names(await list({ functionalGroupId: design, search: 'PROFESS' }))).toEqual(['Professional']);
    expect(names(await list({ functionalGroupId: design, search: `${tag} figma` }))).toEqual([
      'Organization',
      'Pay_as%you',
      'Professional',
    ]);
    expect(names(await list({ functionalGroupId: design, search: 'zzz-no-such' }))).toEqual([]);
    // The characters of a pattern in the search are taken as text: they find the name that holds them and nothing else.
    expect(names(await list({ functionalGroupId: design, search: '_as%y' }))).toEqual(['Pay_as%you']);
    expect(names(await list({ functionalGroupId: design, search: 'o_g' }))).toEqual([]);
    // A search is text, not a pattern: a percent sign matches nothing.
    expect((await list({ functionalGroupId: design, search: '%x' })).pagination.totalItems).toBe(0);
    const paged = await list({ functionalGroupId: design, page: 2, pageSize: 1 });
    expect(names(paged)).toEqual(['Pay_as%you']);
    expect(paged.pagination.totalItems).toBe(3);
  });

  it('CT-1.6: refuses a functional group that is not a uuid and a status that is not one: 422 VALIDATION_ERROR', async () => {
    for (const query of [{ functionalGroupId: 'not-a-uuid' }, { status: 'ACTIVE' }, { search: 'x'.repeat(101) }]) {
      const response = await request(server()).get('/api/v1/plans').query(query).set(as(it1)).expect(422);
      expect(codeOf(response)).toBe('VALIDATION_ERROR');
    }
  });
});
