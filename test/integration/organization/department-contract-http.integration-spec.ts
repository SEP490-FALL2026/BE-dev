import request from 'supertest';
import { DepartmentHarness, today, addDays } from '../../support/department-harness';

describe('department profiles, heads and the MANAGER role over HTTP (integration, real PostgreSQL): the contract the moves of the projects and the departments keep', () => {
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
    const PROFILE_KEYS = [...LIST_KEYS, 'headHistory', 'headHistoryHasMore', 'successor'].sort();
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
