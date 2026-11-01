import request from 'supertest';
import { HR_BASIS } from '../../support/hr-basis';
import { DepartmentHarness, today, addDays } from '../../support/department-harness';

describe('department profiles, heads and the derived MANAGER role over HTTP (integration, real PostgreSQL): the contract the moves of the projects and the departments keep', () => {
  const h = new DepartmentHarness();
  const {
    asIt,
    asAdmin,
    api,
    unique,
    errorOf,
    departmentBody,
    createDepartment,
    newDepartment,
    getDepartment,
    enter,
    accountIn,
    assignHead,
    auditOf,
  } = h;

  beforeAll(async () => {
    await h.start();
  }, 120000);

  afterEach(() => h.afterEach());

  afterAll(async () => {
    await h.stop();
  });

  describe('project contract kept by the H4.2 move', () => {
    type ProjectWire = {
      id: string;
      name: string;
      description: string | null;
      status: string;
      departments: { id: string; code: string; name: string }[];
      createdAt: string;
      updatedAt: string;
    };
    const PROJECT_KEYS = ['createdAt', 'departments', 'description', 'id', 'name', 'status', 'updatedAt'];
    const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    const projectOf = (response: request.Response) => (response.body as { data: ProjectWire }).data;
    const itemsOf = (response: request.Response) => (response.body as { data: { items: ProjectWire[] } }).data.items;
    const createProject = async (body: object) =>
      projectOf(await api().post('/api/v1/projects').set(asAdmin()).send(body).expect(201));
    const byCode = (a: { code: string }, b: { code: string }) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);

    const expectWire = (project: ProjectWire) => {
      expect(Object.keys(project).sort()).toEqual(PROJECT_KEYS);
      expect(project.createdAt).toMatch(ISO_INSTANT);
      expect(project.updatedAt).toMatch(ISO_INSTANT);
      for (const department of project.departments)
        expect(Object.keys(department).sort()).toEqual(['code', 'id', 'name']);
      expect(project.departments).toEqual([...project.departments].sort(byCode));
    };

    it('answers the exact wire, departments ordered by code, with the creation and its audit', async () => {
      const first = await newDepartment();
      const second = await newDepartment();
      const project = await createProject({ name: unique('Wire'), departmentIds: [second.id, first.id] });

      expectWire(project);
      expect(project).toMatchObject({ description: null, status: 'RUNNING' });
      expect(project.departments).toEqual(
        [
          { id: first.id, code: first.code, name: first.name },
          { id: second.id, code: second.code, name: second.name },
        ].sort(byCode),
      );
      expect(await auditOf(project.id)).toEqual([
        {
          action: 'PROJECT.CREATED',
          before: null,
          after: { name: project.name, status: 'RUNNING', departmentIds: [second.id, first.id], hrBasis: HR_BASIS },
        },
      ]);
    });

    it('lists a page of projects by name, then id, without the description, when no department is named', async () => {
      const department = await newDepartment();
      const prefix = unique('Order');
      const later = await createProject({ name: `${prefix}-B`, departmentIds: [department.id] });
      const earlier = await createProject({ name: `${prefix}-A`, departmentIds: [] });

      const items = itemsOf(await api().get('/api/v1/projects').set(asAdmin()).expect(200));
      const ids = items.map((item) => item.id);

      for (const item of items) {
        expect(Object.keys(item).sort()).toEqual(['departments', 'id', 'name', 'status', 'updatedAt']);
        expect(item.updatedAt).toMatch(ISO_INSTANT);
      }
      expect(ids).toContain(later.id);
      expect(ids.indexOf(earlier.id)).toBeLessThan(ids.indexOf(later.id));
      expect(items.find((item) => item.id === earlier.id)?.departments).toEqual([]);
      expect(
        itemsOf(await api().get(`/api/v1/projects?departmentId=${department.id}`).set(asAdmin()).expect(200)).map(
          (item) => item.id,
        ),
      ).toEqual([later.id]);
    });

    it('composes and trims the name, keeps line breaks in the description, and stores a blank description as none', async () => {
      const department = await newDepartment();
      const ideographicSpace = String.fromCharCode(0x3000);
      const decomposed = 'Kế toán'.normalize('NFD');

      const project = await createProject({
        name: `${ideographicSpace}${decomposed}${ideographicSpace} ${ideographicSpace}plan `,
        description: `  ${decomposed}\n  second line  `,
        departmentIds: [department.id],
      });
      const blank = await createProject({ name: unique('Blank'), description: '   ', departmentIds: [] });

      expect(project.name).toBe('Kế toán plan');
      expect(project.description).toBe('Kế toán\n  second line');
      expect(blank.description).toBeNull();
    });

    it('writes nothing and audits nothing when an update changes nothing', async () => {
      const first = await newDepartment();
      const second = await newDepartment();
      const project = await createProject({
        name: unique('Still'),
        description: 'Same',
        departmentIds: [first.id, second.id],
      });

      const unchanged = projectOf(
        await api()
          .patch(`/api/v1/projects/${project.id}`)
          .set(asAdmin())
          .send({
            name: ` ${project.name} `,
            description: 'Same',
            status: 'RUNNING',
            departmentIds: [second.id, first.id],
          })
          .expect(200),
      );

      expect(unchanged).toEqual(project);
      expect(await auditOf(project.id)).toHaveLength(1);
    });

    it('records only what changed, and refuses a description that is too long or an unknown project', async () => {
      const department = await newDepartment();
      const project = await createProject({ name: unique('Change'), departmentIds: [department.id] });

      const renamed = projectOf(
        await api()
          .patch(`/api/v1/projects/${project.id}`)
          .set(asAdmin())
          .send({ name: `${project.name} v2`, status: 'RUNNING' })
          .expect(200),
      );

      expect(renamed.name).toBe(`${project.name} v2`);
      expect(Date.parse(renamed.updatedAt)).toBeGreaterThanOrEqual(Date.parse(project.updatedAt));
      expect((await auditOf(project.id)).at(-1)).toEqual({
        action: 'PROJECT.UPDATED',
        before: { name: project.name },
        after: { name: `${project.name} v2`, hrBasis: HR_BASIS },
      });
      expect(
        errorOf(
          await api()
            .patch(`/api/v1/projects/${project.id}`)
            .set(asAdmin())
            .send({ description: 'x'.repeat(2001) })
            .expect(422),
        ).code,
      ).toBe('PROJECT.INVALID_DESCRIPTION');
      expect(
        errorOf(
          await api()
            .patch('/api/v1/projects/3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11')
            .set(asAdmin())
            .send({ name: 'x' })
            .expect(404),
        ).code,
      ).toBe('PROJECT.NOT_FOUND');
    });

    it('shows the projects on a profile in the same wire as the project routes', async () => {
      const department = await newDepartment();
      const other = await newDepartment();
      const project = await createProject({ name: unique('Profile'), departmentIds: [other.id, department.id] });

      const profile = (await getDepartment(department.id)) as unknown as { projects: ProjectWire[] };

      profile.projects.forEach(expectWire);
      expect(profile.projects).toEqual([project]);
    });
  });

  describe('department contract kept by the Wave 3 move', () => {
    const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    const LIST_KEYS = [
      'code',
      'costCenter',
      'createdAt',
      'deactivatedAt',
      'function',
      'head',
      'id',
      'itAdmin',
      'memberCount',
      'name',
      'status',
      'updatedAt',
      'warnings',
    ];
    const PROFILE_KEYS = [
      ...LIST_KEYS,
      'headHistory',
      'headHistoryHasMore',
      'projects',
      'projectTotal',
      'successor',
    ].sort();
    const vacate = (departmentId: string, effectiveFrom: string) =>
      api().post(`/api/v1/departments/${departmentId}/head-vacancies`).set(asAdmin()).send({ effectiveFrom });

    it('answers a new department with the exact profile wire', async () => {
      const body = departmentBody({
        function: '  line one\nline two  ',
        itAdminEmployeeId: h.it2.employeeId,
      });

      const profile = (
        (await createDepartment(body).expect(201)).body as { data: Record<string, unknown> & { createdAt: string } }
      ).data;

      expect(Object.keys(profile).sort()).toEqual(PROFILE_KEYS);
      expect(profile).toEqual({
        id: expect.any(String) as unknown,
        code: body.code,
        name: 'Design',
        function: 'line one\nline two',
        status: 'ACTIVE',
        costCenter: null,
        itAdmin: {
          employeeId: h.it2.employeeId,
          employeeCode: 'E-IT2',
          fullName: expect.any(String) as unknown,
          usable: true,
        },
        head: null,
        memberCount: 0,
        warnings: ['MISSING_HEAD', 'MISSING_COST_CENTER'],
        createdAt: expect.stringMatching(ISO_INSTANT) as unknown,
        updatedAt: profile.createdAt,
        deactivatedAt: null,
        successor: null,
        headHistory: [],
        headHistoryHasMore: false,
        projects: [],
        projectTotal: 0,
      });
    });

    it('pages the list in code order with the exact pagination, and searches code and name ignoring case', async () => {
      const tag = unique('PG');
      const word = `Zulu${h.counter}x`;
      for (const suffix of ['C', 'A', 'B']) {
        await newDepartment({ code: `${tag}-${suffix}`, name: `${word} ${suffix}` });
      }

      const second = (
        (
          await api()
            .get(`/api/v1/departments?search=${tag.toLowerCase()}&page=2&pageSize=2`)
            .set(asAdmin())
            .expect(200)
        ).body as { message: string; data: { items: Record<string, unknown>[]; pagination: unknown } }
      ).data;
      expect(second.pagination).toEqual({ page: 2, pageSize: 2, totalItems: 3, totalPages: 2 });
      expect(second.items.map((item) => item.code)).toEqual([`${tag}-C`]);
      expect(Object.keys(second.items[0]).sort()).toEqual(LIST_KEYS);

      const byName = (
        (await api().get(`/api/v1/departments?search=${word.toUpperCase()}`).set(asAdmin()).expect(200)).body as {
          data: { items: { code: string }[]; pagination: unknown };
        }
      ).data;
      expect(byName.items.map((item) => item.code)).toEqual([`${tag}-A`, `${tag}-B`, `${tag}-C`]);
      expect(byName.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 3, totalPages: 1 });
    });

    it('pages the members in code order with the exact member wire', async () => {
      const department = await newDepartment();
      const withEmail = await enter(department.code);
      const withoutEmail = await enter(department.code, { workEmail: undefined });
      const [, second] = [withEmail, withoutEmail].sort((a, b) => (a.code < b.code ? -1 : 1));

      const page = (
        await api().get(`/api/v1/departments/${department.id}/employees?page=2&pageSize=1`).set(asAdmin()).expect(200)
      ).body as { message: string; data: unknown };

      expect(page.message).toBe('DEPARTMENT.MEMBERS_LISTED');
      expect(page.data).toEqual({
        items: [
          {
            employeeCode: second.code,
            fullName: `Person ${second.code}`,
            status: 'ACTIVE',
            workState: 'WORKING',
            hasWorkEmail: second === withEmail,
            memberSince: today(),
          },
        ],
        pagination: { page: 2, pageSize: 1, totalItems: 2, totalPages: 2 },
      });
    });

    it('records the exact head audit: the period ended, the plan cancelled, the vacancy', async () => {
      const department = await newDepartment();
      const first = await accountIn(department.code);
      const planned = await accountIn(department.code);
      const next = await accountIn(department.code);

      await assignHead(department.id, first.employeeId).expect(200);
      await assignHead(department.id, planned.employeeId, addDays(today(), 6)).expect(200);
      await assignHead(department.id, next.employeeId, addDays(today(), 3)).expect(200);
      await vacate(department.id, addDays(today(), 5)).expect(200);

      expect(await auditOf(department.id)).toEqual([
        expect.objectContaining({ action: 'DEPARTMENT.CREATED' }),
        {
          action: 'DEPARTMENT.HEAD_ASSIGNED',
          before: { head: null },
          after: { head: first.code, effectiveFrom: today(), endedPeriods: 0, cancelledPeriods: [] },
        },
        {
          action: 'DEPARTMENT.HEAD_ASSIGNED',
          before: { head: first.code },
          after: {
            head: planned.code,
            effectiveFrom: addDays(today(), 6),
            endedPeriods: 1,
            cancelledPeriods: [],
          },
        },
        {
          action: 'DEPARTMENT.HEAD_ASSIGNED',
          before: { head: first.code },
          after: {
            head: next.code,
            effectiveFrom: addDays(today(), 3),
            endedPeriods: 1,
            cancelledPeriods: [`${planned.code}@${addDays(today(), 6)}`],
          },
        },
        {
          action: 'DEPARTMENT.HEAD_VACATED',
          before: { head: next.code },
          after: { head: null, effectiveFrom: addDays(today(), 5), cancelledPeriods: [] },
        },
      ]);
      expect((await getDepartment(department.id)).headHistory).toEqual([
        expect.objectContaining({
          employeeCode: next.code,
          validFrom: addDays(today(), 3),
          validTo: addDays(today(), 5),
        }),
        expect.objectContaining({ employeeCode: first.code, validFrom: today(), validTo: addDays(today(), 3) }),
      ]);
    });

    it('records the exact retirement audit', async () => {
      const department = await newDepartment();

      await api().post(`/api/v1/departments/${department.id}/deactivate`).set(asAdmin()).expect(200);

      expect((await auditOf(department.id)).at(-1)).toEqual({
        action: 'DEPARTMENT.DEACTIVATED',
        before: { status: 'ACTIVE' },
        after: { status: 'INACTIVE' },
      });
    });

    it('names at most twenty members, in code order, when it refuses to retire a department', async () => {
      const department = await newDepartment();
      const codes: string[] = [];
      for (let index = 0; index < 21; index += 1) codes.push((await enter(department.code)).code);

      const error = errorOf(
        await api().post(`/api/v1/departments/${department.id}/deactivate`).set(asAdmin()).expect(409),
      );

      const listed = (error.details as { members: { employeeCode: string }[]; totalMembers: number }).members;
      expect(error.code).toBe('DEPARTMENT.IN_USE');
      expect((error.details as { totalMembers: number }).totalMembers).toBe(21);
      expect(listed.map((member) => member.employeeCode)).toEqual([...codes].sort().slice(0, 20));
    });

    it('lists the warnings in code order, a missing head before a missing IT Admin', async () => {
      await newDepartment();

      const items = (
        (await api().get('/api/v1/department-warnings').set(asIt()).expect(200)).body as {
          data: { items: { code: string; warning: string }[] };
        }
      ).data.items;

      const keys = items.map((item) => `${item.code}|${item.warning}`);
      expect(keys).toEqual(
        [...items]
          .sort((a, b) => (a.code === b.code ? a.warning.localeCompare(b.warning) : a.code < b.code ? -1 : 1))
          .map((item) => `${item.code}|${item.warning}`),
      );
      expect(items.length).toBeGreaterThan(1);
    });
  });

  it('leaves every employee with exactly the placements the invariant I-2 asks for', async () => {
    expect(await h.placementViolations()).toEqual([]);
  });
});
