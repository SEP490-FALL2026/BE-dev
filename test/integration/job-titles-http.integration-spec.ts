import request from 'supertest';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { OrganizationService } from '../../src/modules/organization/organization.service';
import { bodyOf } from '../support/api-body';
import { ApiAccount, adminToken, createActivatedAccount } from '../support/api-accounts';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../support/http-test-app';
import { findPlacementCoverageViolations } from '../support/placement-coverage';

interface JobTitleWire {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

interface ErrorWire {
  error: { code: string; details?: { conflict?: { id: string; name: string; status: string } } };
}

interface PageWire {
  items: JobTitleWire[];
  pagination: { totalItems: number; totalPages: number };
}

describe('job title catalogue over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let it1: ApiAccount;
  let finance: ApiAccount;
  let employee: ApiAccount;
  let admin: string;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const asIt = () => ({ Authorization: `Bearer ${it1.accessToken}` });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', roles: ['IT_ADMIN'], admin });
    finance = await createActivatedAccount(ctx, seed, {
      code: 'E-FIN',
      email: 'fin@acme.vn',
      roles: ['FINANCE'],
      admin,
    });
    employee = await createActivatedAccount(ctx, seed, {
      code: 'E-EMP',
      email: 'emp@acme.vn',
      roles: ['EMPLOYEE'],
      admin,
    });
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  const create = (name: unknown, headers: Record<string, string> = asIt()) =>
    request(server()).post('/api/v1/job-titles').set(headers).send({ name });
  const rename = (id: string, name: unknown, headers: Record<string, string> = asIt()) =>
    request(server()).patch(`/api/v1/job-titles/${id}`).set(headers).send({ name });
  const post = (path: string, headers: Record<string, string> = asIt()) => request(server()).post(path).set(headers);
  const codeOf = (response: request.Response) => (response.body as ErrorWire).error.code;
  const dataOf = (response: request.Response) => (response.body as { data: JobTitleWire }).data;
  const messageOf = (response: request.Response) => (response.body as { message: string }).message;

  const created = async (name: string): Promise<JobTitleWire> => dataOf(await create(name).expect(201));
  const unique = (prefix: string) => {
    counter += 1;

    return `${prefix} ${counter}`;
  };

  const rowOf = async (id: string) =>
    (
      await ctx.sql.query<{ name: string; normalized_name: string; status: string; version: number }>(
        'SELECT name, normalized_name, status, version FROM job_titles WHERE id = $1',
        [id],
      )
    ).rows[0];

  const auditOf = async (id: string) =>
    (
      await ctx.sql.query<{
        action: string;
        actor_kind: string;
        actor_app_user_id: string;
        actor_roles: string[];
        before: Record<string, unknown> | null;
        after: Record<string, unknown> | null;
      }>(
        `SELECT action, actor_kind, actor_app_user_id, actor_roles, before, after FROM audit_events
          WHERE resource_type = 'JobTitle' AND resource_id = $1 ORDER BY occurred_at, id`,
        [id],
      )
    ).rows;

  const actionsOf = async (id: string) => (await auditOf(id)).map((event) => event.action);

  /** Hires `count` people into the title, through the facade the installation and the import will use. */
  const hireInto = async (jobTitleId: string, count: number): Promise<string[]> => {
    const runner = ctx.app.get(TransactionRunner);
    const organization = ctx.app.get(OrganizationService);
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      counter += 1;
      const { id } = await runner.run((tx) =>
        organization.createEmployeeWithPlacement(tx, {
          organizationId: seed.organizationId,
          employeeCode: `E-JT${counter}`,
          fullName: `Holder ${counter}`,
          workEmail: `holder.${counter}@acme.vn`,
          employmentType: 'STAFF',
          hireDate: '2026-01-05',
          departmentId: seed.departmentId,
          jobTitleId,
        }),
      );
      ids.push(id);
    }

    return ids;
  };

  const placementsOf = async (people: string[]) =>
    (
      await ctx.sql.query<{ id: string; job_title_id: string }>(
        'SELECT id, job_title_id FROM employee_placements WHERE employee_id = ANY($1::uuid[]) ORDER BY id',
        [people],
      )
    ).rows;

  describe('adding a title (US-02-07 AC-1 → AC-3)', () => {
    it('adds "Kế toán" as an ACTIVE title and records who did it', async () => {
      const response = await create('Kế toán').expect(201);

      expect(messageOf(response)).toBe('JOB_TITLE.CREATED');
      expect(dataOf(response)).toMatchObject({ name: 'Kế toán', status: 'ACTIVE' });
      expect(Object.keys(dataOf(response)).sort()).toEqual(['createdAt', 'id', 'name', 'status', 'updatedAt']);
      const [event] = await auditOf(dataOf(response).id);
      expect(event).toMatchObject({
        action: 'JOB_TITLE.CREATED',
        actor_kind: 'USER',
        actor_app_user_id: it1.appUserId,
        actor_roles: ['IT_ADMIN'],
        before: null,
        after: { name: 'Kế toán', status: 'ACTIVE' },
      });
    });

    it('stores the name as it is shown: trimmed, with the whitespace inside collapsed', async () => {
      const title = await created('  Senior    Designer \t');

      expect(title.name).toBe('Senior Designer');
      expect(await rowOf(title.id)).toMatchObject({
        name: 'Senior Designer',
        normalized_name: 'senior designer',
        version: 1,
      });
    });

    it('answers 409 naming the existing title when the same name is typed another way (AC-2)', async () => {
      const first = await created('Senior Tester');

      const response = await create('senior tester ').expect(409);

      const body = response.body as ErrorWire;
      expect(body.error.code).toBe('JOB_TITLE.NAME_TAKEN');
      expect(body.error.details?.conflict).toEqual({ id: first.id, name: 'Senior Tester', status: 'ACTIVE' });
    });

    it('also names a deactivated title as the conflict: the name stays taken', async () => {
      const first = await created('Retired Role');
      await post(`/api/v1/job-titles/${first.id}/deactivate`).expect(200);

      const response = await create('RETIRED ROLE').expect(409);

      expect((response.body as ErrorWire).error.details?.conflict).toEqual({
        id: first.id,
        name: 'Retired Role',
        status: 'INACTIVE',
      });
    });

    it('does not guess a spelling or add accents: "Desginer" and "Ke toan" are new titles (AC-2)', async () => {
      await created('Designer');
      await created('Kế toán B');

      await create('Desginer').expect(201);
      await create('Ke toan B').expect(201);
    });

    it.each([[''], ['   '], [' \t\n']])(
      'refuses the name %j as empty, 422 JOB_TITLE.NAME_REQUIRED (AC-3)',
      async (name) => {
        expect(codeOf(await create(name).expect(422))).toBe('JOB_TITLE.NAME_REQUIRED');
      },
    );

    it('refuses a name longer than 100 characters after normalization, and accepts exactly 100', async () => {
      expect(codeOf(await create(`x${'y'.repeat(100)}`).expect(422))).toBe('JOB_TITLE.NAME_TOO_LONG');
      await create(`  ${'z'.repeat(100)}  `).expect(201);
    });

    it('writes nothing when the name is refused', async () => {
      const titles = (await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM job_titles')).rows[0];
      const events = (await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM audit_events')).rows[0];

      await create('  ').expect(422);
      await create('Administrator').expect(409);

      expect((await ctx.sql.query('SELECT count(*)::int AS n FROM job_titles')).rows[0]).toEqual(titles);
      expect((await ctx.sql.query('SELECT count(*)::int AS n FROM audit_events')).rows[0]).toEqual(events);
    });
  });

  describe('renaming (AC-4, AC-5)', () => {
    it('fixes a typo in place: the same three people keep the same title, nobody is moved, and it is audited', async () => {
      const typo = await created(unique('Desginer'));
      const fixed = typo.name.replace('Desginer', 'Designer');
      const people = await hireInto(typo.id, 3);
      const placementsBefore = await placementsOf(people);

      const response = await rename(typo.id, fixed).expect(200);

      expect(messageOf(response)).toBe('JOB_TITLE.RENAMED');
      expect(dataOf(response)).toMatchObject({ id: typo.id, name: fixed });
      const placementsAfter = await placementsOf(people);
      expect(placementsAfter).toEqual(placementsBefore);
      expect(placementsAfter).toHaveLength(3);
      const events = await auditOf(typo.id);
      expect(events.map((event) => event.action)).toEqual(['JOB_TITLE.CREATED', 'JOB_TITLE.RENAMED']);
      expect(events[1]).toMatchObject({
        actor_roles: ['IT_ADMIN'],
        before: { name: typo.name },
        after: { name: fixed },
      });
      expect((await rowOf(typo.id)).version).toBe(2);
    });

    it('refuses a name another title already has, naming that title, and changes nothing (AC-5)', async () => {
      const other = await created(unique('Taken Name'));
      const mine = await created(unique('Mine'));

      const response = await rename(mine.id, other.name.toUpperCase()).expect(409);

      const body = response.body as ErrorWire;
      expect(body.error.code).toBe('JOB_TITLE.NAME_TAKEN');
      expect(body.error.details?.conflict?.id).toBe(other.id);
      expect(await rowOf(mine.id)).toMatchObject({ name: mine.name, version: 1 });
      expect(await actionsOf(mine.id)).toEqual(['JOB_TITLE.CREATED']);
    });

    it('lets a title change only its own case or whitespace, and audits it (T-13)', async () => {
      const title = await created(unique('Product Owner'));

      await rename(title.id, `  ${title.name.toUpperCase()}  `).expect(200);

      expect((await rowOf(title.id)).name).toBe(title.name.toUpperCase());
      expect(await actionsOf(title.id)).toEqual(['JOB_TITLE.CREATED', 'JOB_TITLE.RENAMED']);
    });

    it('treats renaming to the name it already has as nothing: no audit, no new version', async () => {
      const title = await created(unique('Unchanged'));

      await rename(title.id, `  ${title.name}  `).expect(200);

      expect(await rowOf(title.id)).toMatchObject({ version: 1 });
      expect(await actionsOf(title.id)).toEqual(['JOB_TITLE.CREATED']);
    });

    it('refuses an empty or oversized new name, and answers 404 for a title that does not exist', async () => {
      const title = await created(unique('Renamable'));

      expect(codeOf(await rename(title.id, ' ').expect(422))).toBe('JOB_TITLE.NAME_REQUIRED');
      expect(codeOf(await rename(title.id, 'x'.repeat(101)).expect(422))).toBe('JOB_TITLE.NAME_TOO_LONG');
      const missing = await rename('4f24d10d-63ad-49b1-a7a1-c988765990ae', 'Anything').expect(404);
      expect(codeOf(missing)).toBe('JOB_TITLE.NOT_FOUND');
    });
  });

  describe('deactivating and reactivating (AC-6 → AC-8)', () => {
    it('stops a title being chosen without touching anyone who holds it, and brings it back', async () => {
      const title = await created(unique('Seasonal'));
      const people = await hireInto(title.id, 2);

      const off = await post(`/api/v1/job-titles/${title.id}/deactivate`).expect(200);
      expect(messageOf(off)).toBe('JOB_TITLE.DEACTIVATED');
      expect(dataOf(off)).toMatchObject({ id: title.id, status: 'INACTIVE' });

      const holders = await ctx.sql.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM employee_placements
          WHERE job_title_id = $1 AND employee_id = ANY($2::uuid[]) AND valid_to IS NULL`,
        [title.id, people],
      );
      expect(holders.rows[0].n).toBe(2);

      const on = await post(`/api/v1/job-titles/${title.id}/reactivate`).expect(200);
      expect(messageOf(on)).toBe('JOB_TITLE.REACTIVATED');
      expect(dataOf(on)).toMatchObject({ status: 'ACTIVE' });
      const events = await auditOf(title.id);
      expect(events.map((event) => event.action)).toEqual([
        'JOB_TITLE.CREATED',
        'JOB_TITLE.DEACTIVATED',
        'JOB_TITLE.REACTIVATED',
      ]);
      expect(events[1]).toMatchObject({ before: { status: 'ACTIVE' }, after: { status: 'INACTIVE' } });
      expect((await rowOf(title.id)).version).toBe(3);
    });

    it('answers the current state, with no audit and no new version, when it is already so (T-13)', async () => {
      const title = await created(unique('Idempotent'));

      await post(`/api/v1/job-titles/${title.id}/reactivate`).expect(200);
      await post(`/api/v1/job-titles/${title.id}/deactivate`).expect(200);
      await post(`/api/v1/job-titles/${title.id}/deactivate`).expect(200);

      expect(await actionsOf(title.id)).toEqual(['JOB_TITLE.CREATED', 'JOB_TITLE.DEACTIVATED']);
      expect((await rowOf(title.id)).version).toBe(2);
    });

    it('answers 404 JOB_TITLE.NOT_FOUND for a title that does not exist', async () => {
      const missing = '4f24d10d-63ad-49b1-a7a1-c988765990ae';

      for (const action of ['deactivate', 'reactivate']) {
        expect(codeOf(await post(`/api/v1/job-titles/${missing}/${action}`).expect(404))).toBe('JOB_TITLE.NOT_FOUND');
      }
    });
  });

  describe('listing', () => {
    it('lists by normalized name, filters by status and by a literal search, and pages with the true total', async () => {
      counter += 1;
      const marker = `Lst${counter}`;
      const titles: JobTitleWire[] = [];
      for (const name of [`${marker} Zeta`, `${marker} alpha`, `${marker} Beta`, `${marker} 100% Remote`]) {
        titles.push(await created(name));
      }
      await post(`/api/v1/job-titles/${titles[2].id}/deactivate`).expect(200);
      const list = async (query: string) =>
        (await request(server()).get(`/api/v1/job-titles?${query}`).set(asIt()).expect(200)).body as { data: PageWire };
      const search = `search=${encodeURIComponent(marker)}`;

      const all = (await list(`${search}&pageSize=100`)).data;
      const inactive = (await list(`${search}&status=INACTIVE`)).data;
      const percent = (await list(`search=${encodeURIComponent('100%')}`)).data;
      const paged = (await list(`${search}&pageSize=3&page=2`)).data;

      expect(all.items.map((item) => item.name)).toEqual([
        `${marker} 100% Remote`,
        `${marker} alpha`,
        `${marker} Beta`,
        `${marker} Zeta`,
      ]);
      expect(inactive.items.map((item) => item.id)).toEqual([titles[2].id]);
      // "%" is a character, not a wildcard.
      expect(percent.items.map((item) => item.name)).toEqual([`${marker} 100% Remote`]);
      expect(paged.items).toHaveLength(1);
      expect(paged.pagination).toMatchObject({ totalItems: 4, totalPages: 2 });
    });
  });

  describe('who may maintain it (AC-10, AC-11)', () => {
    it.each([
      ['the Super Admin', () => ({ Authorization: `Bearer ${admin}` })],
      ['the finance officer', () => ({ Authorization: `Bearer ${finance.accessToken}` })],
      ['an employee', () => ({ Authorization: `Bearer ${employee.accessToken}` })],
    ])('refuses %s on every route and changes nothing', async (_name, headers) => {
      const title = await created(unique('Guarded'));
      const before = await rowOf(title.id);

      await create('Intruder', headers()).expect(403);
      await rename(title.id, 'Renamed By Intruder', headers()).expect(403);
      await post(`/api/v1/job-titles/${title.id}/deactivate`, headers()).expect(403);
      await post(`/api/v1/job-titles/${title.id}/reactivate`, headers()).expect(403);
      await request(server()).get('/api/v1/job-titles').set(headers()).expect(403);

      expect(await rowOf(title.id)).toEqual(before);
      expect((await ctx.sql.query(`SELECT 1 FROM job_titles WHERE name = 'Intruder'`)).rows).toEqual([]);
    });

    it('lets an IT Admin rename the title the installation created, as a user and not as an operator', async () => {
      await rename(seed.jobTitleId, 'Administrators').expect(200);

      const renamed = (await auditOf(seed.jobTitleId)).find((event) => event.action === 'JOB_TITLE.RENAMED');
      expect(renamed).toMatchObject({
        actor_kind: 'USER',
        actor_app_user_id: it1.appUserId,
        actor_roles: ['IT_ADMIN'],
        before: { name: 'Administrator' },
        after: { name: 'Administrators' },
      });
    });
  });

  it('leaves every employee with exactly one placement at the end (I-2 coverage)', async () => {
    await expect(findPlacementCoverageViolations(ctx.sql)).resolves.toEqual([]);
  });

  it('serves the catalogue with the standard envelope', async () => {
    const response = await request(server()).get('/api/v1/job-titles').set(asIt()).expect(200);

    expect(bodyOf(response).success).toBe(true);
    expect(messageOf(response)).toBe('JOB_TITLE.LISTED');
  });
});
