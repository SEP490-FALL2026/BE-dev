import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createActivatedAccount } from '../../support/api-accounts';
import { DepartmentHarness, addDays } from '../../support/department-harness';
import { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';
import { PgRelay } from '../../support/pg-relay';
import { dataStatements, QueryCounter } from '../../support/query-count';

interface EmployeeItemWire {
  id: string;
  employeeCode: string;
  fullName: string;
  workEmail: string | null;
  employmentType: string;
  status: string;
  workState: string;
  hireDate: string;
  jobTitle: string | null;
  department: { id: string; code: string; name: string } | null;
  unplaced: boolean;
  account: {
    id: string;
    status: string;
    activationState: string;
    employeeLeft: boolean;
  } | null;
}

interface EmployeeListPageWire {
  items: EmployeeItemWire[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

interface EmployeeDetailWire extends EmployeeItemWire {
  placements: {
    department: { id: string; code: string; name: string };
    validFrom: string;
    validTo: string | null;
  }[];
  placementsHasMore: boolean;
  account: {
    id: string;
    status: string;
    activationState: string;
    employeeLeft: boolean;
    roles: string[];
  } | null;
}

const dataOf = <T>(res: request.Response): T => (res.body as { data: T }).data;
const messageOf = (res: request.Response): string => (res.body as { message: string }).message;
const errorOf = (res: request.Response): { code: string } => (res.body as { error: { code: string } }).error;

/**
 * US-02-02 (AC-22, AC-24, AC-25, AC-26): Company-wide employee directory for Super Admin.
 * Verifies list search (q: UUID, code, email, folded accented name, literal %_\),
 * filters (departmentId, unplaced, hasAccount, workState, employmentType),
 * pagination, deterministic sorting (employee_code ASC, id ASC),
 * detail with placement history (max 50, placementsHasMore) and account roles,
 * and proves the list query has no N+1 query fan-out.
 */
describe('employee directory read (US-02-02 AC-22, AC-24, AC-25, AC-26, integration)', () => {
  const h = new DepartmentHarness();
  let relay: PgRelay;
  let counter: QueryCounter;

  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
  }, 120000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  const getList = (query = '') =>
    request(h.server())
      .get(`/api/v1/employees${query ? `?${query}` : ''}`)
      .set(h.asAdmin());

  const getDetail = (id: string) => request(h.server()).get(`/api/v1/employees/${id}`).set(h.asAdmin());

  describe('directory list and detail contracts', () => {
    let dep1: { id: string; code: string; name: string };
    let dep2: { id: string; code: string; name: string };
    let emp1: { id: string; code: string; email: string };
    let emp2: { id: string; code: string; email: string };
    let emp3Unplaced: { id: string; code: string; email: string };
    let emp4PastPlacement: { id: string; code: string; email: string };

    beforeAll(async () => {
      // Create 2 departments
      dep1 = h.dataOf(
        await h.createDepartment(h.departmentBody({ code: 'P-DIR1', name: 'Phòng Kỹ Thuật' })).expect(201),
      );
      dep2 = h.dataOf(
        await h.createDepartment(h.departmentBody({ code: 'P-DIR2', name: 'Phòng Kinh Doanh' })).expect(201),
      );

      // Emp1: in dep1, Staff, code NV-DIR-001, Vietnamese accented name, has account
      const r1 = await h
        .api()
        .post('/api/v1/employees')
        .set(h.asAdmin())
        .send({
          employeeCode: 'NV-DIR-001',
          workEmail: 'nam.doan@acme.vn',
          fullName: 'Đoàn Văn Nam',
          employmentType: 'STAFF',
          hireDate: '2025-01-01',
          departmentCode: dep1.code,
          jobTitle: 'Kỹ sư phần mềm',
        })
        .expect(201);
      const d1 = dataOf<{ id: string }>(r1);
      emp1 = { id: d1.id, code: 'NV-DIR-001', email: 'nam.doan@acme.vn' };

      // Give emp1 an activated account with role EMPLOYEE
      await createActivatedAccount(h.ctx, h.seed, {
        code: emp1.code,
        email: emp1.email,
        roles: ['EMPLOYEE'],
        admin: h.admin,
        employeeId: emp1.id,
      });

      // Emp2: in dep2, Contractor, code NV-DIR-002, unaccented name, no account
      const r2 = await h
        .api()
        .post('/api/v1/employees')
        .set(h.asAdmin())
        .send({
          employeeCode: 'NV-DIR-002',
          workEmail: 'mai.tran@acme.vn',
          fullName: 'Trần Thị Mai',
          employmentType: 'CONTRACTOR',
          hireDate: '2025-02-01',
          departmentCode: dep2.code,
          jobTitle: 'Tư vấn viên',
        })
        .expect(201);
      const d2 = dataOf<{ id: string }>(r2);
      emp2 = { id: d2.id, code: 'NV-DIR-002', email: 'mai.tran@acme.vn' };

      // Emp3: unplaced employee (departmentCode: null), Intern, special characters in name (% and _)
      const r3 = await h
        .api()
        .post('/api/v1/employees')
        .set(h.asAdmin())
        .send({
          employeeCode: 'NV-DIR-003',
          workEmail: 'special.percent@acme.vn',
          fullName: 'Special%User_Test',
          employmentType: 'INTERN',
          hireDate: '2025-03-01',
          departmentCode: null,
          jobTitle: 'Thực tập sinh',
        })
        .expect(201);
      const d3 = dataOf<{ id: string }>(r3);
      emp3Unplaced = { id: d3.id, code: 'NV-DIR-003', email: 'special.percent@acme.vn' };

      // Emp4: placed previously in dep1, but placement ended before today
      const r4 = await h
        .api()
        .post('/api/v1/employees')
        .set(h.asAdmin())
        .send({
          employeeCode: 'NV-DIR-004',
          workEmail: 'cu.le@acme.vn',
          fullName: 'Lê Văn Cũ',
          employmentType: 'STAFF',
          hireDate: '2020-01-01',
          departmentCode: null,
        })
        .expect(201);
      const d4 = dataOf<{ id: string }>(r4);
      emp4PastPlacement = { id: d4.id, code: 'NV-DIR-004', email: 'cu.le@acme.vn' };

      // Insert expired placement for emp4 in dep1 (ended 2024-01-01, before today)
      await h.ctx.sql.query(
        `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from, valid_to)
         VALUES ($1, $2, $3, $4, '2020-01-01', '2024-01-01')`,
        [randomUUID(), h.seed.organizationId, emp4PastPlacement.id, dep1.id],
      );

      // Also insert a second historical placement for emp1 to test placement history ordering
      await h.ctx.sql.query(
        `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from, valid_to)
         VALUES ($1, $2, $3, $4, '2024-06-01', '2024-12-31')`,
        [randomUUID(), h.seed.organizationId, emp1.id, dep1.id],
      );
    });

    it('searches by exact UUID', async () => {
      const res = await getList(`q=${emp1.id}`).expect(200);
      expect(messageOf(res)).toBe('EMPLOYEE.LISTED');
      const page = dataOf<EmployeeListPageWire>(res);
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.id).toBe(emp1.id);
      expect(page.items[0]?.employeeCode).toBe('NV-DIR-001');
    });

    it('searches by employee code (prefix, substring)', async () => {
      const res = await getList('q=NV-DIR-002').expect(200);
      const page = dataOf<EmployeeListPageWire>(res);
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.id).toBe(emp2.id);
    });

    it('searches by accented Vietnamese name and unaccented folded name (Đ/d)', async () => {
      // Accent search
      const withAccent = await getList('q=Đoàn').expect(200);
      expect(dataOf<EmployeeListPageWire>(withAccent).items.some((i) => i.id === emp1.id)).toBe(true);

      // Unaccented folded search (doan matches Đoàn)
      const unaccented = await getList('q=doan').expect(200);
      expect(dataOf<EmployeeListPageWire>(unaccented).items.some((i) => i.id === emp1.id)).toBe(true);

      // Uppercase unaccented search
      const upper = await getList('q=DOAN VAN').expect(200);
      expect(dataOf<EmployeeListPageWire>(upper).items.some((i) => i.id === emp1.id)).toBe(true);
    });

    it('searches by email normalized', async () => {
      const res = await getList('q=nam.doan').expect(200);
      expect(dataOf<EmployeeListPageWire>(res).items.some((i) => i.id === emp1.id)).toBe(true);

      const resFull = await getList('q=NAM.DOAN@ACME.VN').expect(200);
      expect(dataOf<EmployeeListPageWire>(resFull).items.some((i) => i.id === emp1.id)).toBe(true);
    });

    it('takes _ in an email search literally: the decoy where _ would match any letter is not found', async () => {
      const post = (employeeCode: string, workEmail: string) =>
        h
          .api()
          .post('/api/v1/employees')
          .set(h.asAdmin())
          .send({
            employeeCode,
            workEmail,
            fullName: 'Wildcard Probe',
            employmentType: 'STAFF',
            hireDate: '2025-01-01',
          })
          .expect(201);
      const literal = dataOf<{ id: string }>(await post('NV-WILD-1', 'wild_card.dir@acme.vn'));
      await post('NV-WILD-2', 'wildxcard.dir@acme.vn');

      const page = dataOf<EmployeeListPageWire>(await getList('q=wild_card.dir').expect(200));

      expect(page.items.map((item) => item.id)).toEqual([literal.id]);
    });

    it('answers an empty page, not an error, for a department and unplaced=true together', async () => {
      const page = dataOf<EmployeeListPageWire>(await getList(`departmentId=${dep1.id}&unplaced=true`).expect(200));

      expect(page.items).toEqual([]);
      expect(page.pagination.totalItems).toBe(0);
    });

    it('escapes SQL LIKE wildcards % and _ so they match literally', async () => {
      // Special%User_Test has literal % and _
      const matchLiteral = await getList('q=%User_').expect(200);
      const page = dataOf<EmployeeListPageWire>(matchLiteral);
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.id).toBe(emp3Unplaced.id);

      // A search with % that does not match literally should return 0 items
      const noMatch = await getList('q=NonExistent%Pattern').expect(200);
      expect(dataOf<EmployeeListPageWire>(noMatch).items).toHaveLength(0);
    });

    it('filters by departmentId (current placement on today)', async () => {
      // dep1 has emp1 (active). emp4 had placement in dep1 but it expired in 2024.
      const res = await getList(`departmentId=${dep1.id}`).expect(200);
      const ids = dataOf<EmployeeListPageWire>(res).items.map((i) => i.id);
      expect(ids).toContain(emp1.id);
      expect(ids).not.toContain(emp4PastPlacement.id);
      expect(ids).not.toContain(emp2.id);
      expect(ids).not.toContain(emp3Unplaced.id);
    });

    it('filters by unplaced=true and unplaced=false', async () => {
      // unplaced=true: emp3 has never had any placement
      const unplacedRes = await getList('unplaced=true').expect(200);
      const unplacedIds = dataOf<EmployeeListPageWire>(unplacedRes).items.map((i) => i.id);
      expect(unplacedIds).toContain(emp3Unplaced.id);
      expect(unplacedIds).not.toContain(emp1.id);
      expect(unplacedIds).not.toContain(emp2.id);
      // emp4 had a past placement, so unplaced is false
      expect(unplacedIds).not.toContain(emp4PastPlacement.id);

      // unplaced=false: placed employees
      const placedRes = await getList('unplaced=false').expect(200);
      const placedIds = dataOf<EmployeeListPageWire>(placedRes).items.map((i) => i.id);
      expect(placedIds).toContain(emp1.id);
      expect(placedIds).toContain(emp2.id);
      expect(placedIds).toContain(emp4PastPlacement.id);
      expect(placedIds).not.toContain(emp3Unplaced.id);
    });

    it('filters by hasAccount=true and hasAccount=false', async () => {
      const withAccountRes = await getList('hasAccount=true').expect(200);
      const withAccountIds = dataOf<EmployeeListPageWire>(withAccountRes).items.map((i) => i.id);
      expect(withAccountIds).toContain(emp1.id);
      expect(withAccountIds).not.toContain(emp2.id);
      expect(withAccountIds).not.toContain(emp3Unplaced.id);

      const noAccountRes = await getList('hasAccount=false').expect(200);
      const noAccountIds = dataOf<EmployeeListPageWire>(noAccountRes).items.map((i) => i.id);
      expect(noAccountIds).toContain(emp2.id);
      expect(noAccountIds).toContain(emp3Unplaced.id);
      expect(noAccountIds).not.toContain(emp1.id);
    });

    it('filters by workState and employmentType', async () => {
      const contractorRes = await getList('employmentType=CONTRACTOR').expect(200);
      const contractorIds = dataOf<EmployeeListPageWire>(contractorRes).items.map((i) => i.id);
      expect(contractorIds).toContain(emp2.id);
      expect(contractorIds).not.toContain(emp1.id);
      expect(contractorIds).not.toContain(emp3Unplaced.id);

      const internRes = await getList('employmentType=INTERN').expect(200);
      const internIds = dataOf<EmployeeListPageWire>(internRes).items.map((i) => i.id);
      expect(internIds).toContain(emp3Unplaced.id);
      expect(internIds).not.toContain(emp1.id);

      const activeRes = await getList('workState=WORKING').expect(200);
      expect(dataOf<EmployeeListPageWire>(activeRes).items.length).toBeGreaterThanOrEqual(3);
    });

    it('paginates and sorts by employee_code ASC, id ASC', async () => {
      const p1 = await getList('page=1&pageSize=2').expect(200);
      const page1 = dataOf<EmployeeListPageWire>(p1);
      expect(page1.items).toHaveLength(2);
      expect(page1.pagination).toMatchObject({
        page: 1,
        pageSize: 2,
      });
      expect(page1.pagination.totalItems).toBeGreaterThanOrEqual(4);
      expect(page1.pagination.totalPages).toBeGreaterThanOrEqual(2);

      // Verify sorting is ascending
      const codes = page1.items.map((i) => i.employeeCode);
      expect(codes[0]?.localeCompare(codes[1] ?? '')).toBeLessThanOrEqual(0);

      // Page beyond end returns empty items
      const pEmpty = await getList('page=9999&pageSize=20').expect(200);
      const pageEmpty = dataOf<EmployeeListPageWire>(pEmpty);
      expect(pageEmpty.items).toEqual([]);
      expect(pageEmpty.pagination.page).toBe(9999);
    });

    it('fetches employee detail with placements history and account roles', async () => {
      const res = await getDetail(emp1.id).expect(200);
      expect(messageOf(res)).toBe('EMPLOYEE.FETCHED');

      const data = dataOf<EmployeeDetailWire>(res);
      expect(data).toMatchObject({
        id: emp1.id,
        employeeCode: 'NV-DIR-001',
        fullName: 'Đoàn Văn Nam',
        workEmail: 'nam.doan@acme.vn',
        employmentType: 'STAFF',
        status: 'ACTIVE',
        workState: 'WORKING',
        jobTitle: 'Kỹ sư phần mềm',
        department: {
          id: dep1.id,
          code: dep1.code,
          name: dep1.name,
        },
        unplaced: false,
        account: {
          roles: ['EMPLOYEE'],
          status: 'ACTIVE',
          activationState: 'ACTIVATED',
          employeeLeft: false,
        },
        placementsHasMore: false,
      });

      // Verify placements history: newest first
      expect(data.placements.length).toBeGreaterThanOrEqual(2);
      const firstValidFrom = new Date(data.placements[0]?.validFrom ?? '').getTime();
      const secondValidFrom = new Date(data.placements[1]?.validFrom ?? '').getTime();
      expect(firstValidFrom).toBeGreaterThanOrEqual(secondValidFrom);
      expect(data.placements[0]).toMatchObject({
        department: {
          id: dep1.id,
          code: dep1.code,
          name: dep1.name,
        },
      });
    });

    it('fetches unplaced employee detail with null department and unplaced=true', async () => {
      const res = await getDetail(emp3Unplaced.id).expect(200);
      const data = dataOf<EmployeeDetailWire>(res);
      expect(data).toMatchObject({
        id: emp3Unplaced.id,
        department: null,
        unplaced: true,
        account: null,
        placements: [],
        placementsHasMore: false,
      });
    });

    it('returns 404 EMPLOYEE.NOT_FOUND for non-existent employee id', async () => {
      const res = await getDetail(randomUUID()).expect(404);
      expect(errorOf(res).code).toBe('EMPLOYEE.NOT_FOUND');
    });

    it('excludes placement with valid_to = today from current department', async () => {
      const today = await h.ctx.app.get(OrganizationReadApi).businessToday();
      const empRes = await h
        .api()
        .post('/api/v1/employees')
        .set(h.asAdmin())
        .send({
          employeeCode: 'NV-VTO-TODAY',
          fullName: 'Valid To Today',
          workEmail: 'vto.today@acme.vn',
          employmentType: 'STAFF',
          hireDate: '2024-01-01',
        })
        .expect(201);
      const empId = dataOf<{ id: string }>(empRes).id;

      await h.ctx.sql.query(
        `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from, valid_to)
         VALUES (gen_random_uuid(), $1, $2, $3, '2024-01-01', $4)`,
        [h.seed.organizationId, empId, dep1.id, today],
      );

      // `q` narrows both reads to this one employee, so the answer does not depend on how many rows other tests seeded.
      const found = await getList('q=NV-VTO-TODAY').expect(200);
      expect(dataOf<EmployeeListPageWire>(found).items.map((i) => i.id)).toEqual([empId]);
      const res = await getList(`departmentId=${dep1.id}&q=NV-VTO-TODAY`).expect(200);
      const ids = dataOf<EmployeeListPageWire>(res).items.map((i) => i.id);
      expect(ids).not.toContain(empId);

      const detail = dataOf<EmployeeDetailWire>(await getDetail(empId).expect(200));
      expect(detail.department).toBeNull();
    });

    it('includes placement with valid_from = today in current department', async () => {
      const today = await h.ctx.app.get(OrganizationReadApi).businessToday();
      const empRes = await h
        .api()
        .post('/api/v1/employees')
        .set(h.asAdmin())
        .send({
          employeeCode: 'NV-VFROM-TODAY',
          fullName: 'Valid From Today',
          workEmail: 'vfrom.today@acme.vn',
          employmentType: 'STAFF',
          hireDate: today,
        })
        .expect(201);
      const empId = dataOf<{ id: string }>(empRes).id;

      await h.ctx.sql.query(
        `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from, valid_to)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NULL)`,
        [h.seed.organizationId, empId, dep1.id, today],
      );

      const res = await getList(`departmentId=${dep1.id}`).expect(200);
      const ids = dataOf<EmployeeListPageWire>(res).items.map((i) => i.id);
      expect(ids).toContain(empId);

      const detail = dataOf<EmployeeDetailWire>(await getDetail(empId).expect(200));
      expect(detail.department?.id).toBe(dep1.id);
    });

    it('filters by workState correctly including non-working states', async () => {
      const empRes = await h
        .api()
        .post('/api/v1/employees')
        .set(h.asAdmin())
        .send({
          employeeCode: 'NV-STATE-LEAVE',
          fullName: 'Long Leave Worker',
          workEmail: 'leave.worker@acme.vn',
          employmentType: 'STAFF',
          hireDate: '2025-01-01',
        })
        .expect(201);
      const empId = dataOf<{ id: string }>(empRes).id;

      await h.ctx.sql.query(`UPDATE employees SET work_state = 'ON_LONG_LEAVE' WHERE id = $1`, [empId]);

      const leaveRes = await getList('workState=ON_LONG_LEAVE&q=NV-STATE-LEAVE').expect(200);
      const leaveIds = dataOf<EmployeeListPageWire>(leaveRes).items.map((i) => i.id);
      expect(leaveIds).toEqual([empId]);

      const workingRes = await getList('workState=WORKING&q=NV-STATE-LEAVE').expect(200);
      const workingIds = dataOf<EmployeeListPageWire>(workingRes).items.map((i) => i.id);
      expect(workingIds).toEqual([]);
    });

    it('shows department: null and unplaced: false for an employee with only a future placement', async () => {
      const today = await h.ctx.app.get(OrganizationReadApi).businessToday();
      const tomorrow = addDays(today, 1);
      const empRes = await h
        .api()
        .post('/api/v1/employees')
        .set(h.asAdmin())
        .send({
          employeeCode: 'NV-FUTURE-PLACE',
          fullName: 'Future Placement Emp',
          workEmail: 'future.place@acme.vn',
          employmentType: 'STAFF',
          hireDate: today,
        })
        .expect(201);
      const empId = dataOf<{ id: string }>(empRes).id;

      await h
        .api()
        .post(`/api/v1/employees/${empId}/first-placements`)
        .set(h.asAdmin())
        .send({
          departmentId: dep1.id,
          effectiveFrom: tomorrow,
        })
        .expect(201);

      const listRes = await getList('q=NV-FUTURE-PLACE').expect(200);
      const listData = dataOf<EmployeeListPageWire>(listRes).items.find((i) => i.id === empId);
      expect(listData).toBeDefined();
      expect(listData?.department).toBeNull();
      expect(listData?.unplaced).toBe(false);

      const detail = dataOf<EmployeeDetailWire>(await getDetail(empId).expect(200));
      expect(detail.department).toBeNull();
      expect(detail.unplaced).toBe(false);
      expect(detail.placements).toHaveLength(1);
      expect(detail.placements[0]?.validFrom).toBe(tomorrow);
    });

    it('normalizes email search with +tag', async () => {
      const empRes = await h
        .api()
        .post('/api/v1/employees')
        .set(h.asAdmin())
        .send({
          employeeCode: 'NV-TAG-EMAIL',
          fullName: 'Tagged Email Worker',
          workEmail: 'alex+newsletter@acme.vn',
          employmentType: 'STAFF',
          hireDate: '2025-01-01',
        })
        .expect(201);
      const empId = dataOf<{ id: string }>(empRes).id;

      const res = await getList(`q=${encodeURIComponent('alex+newsletter@acme.vn')}`).expect(200);
      const ids = dataOf<EmployeeListPageWire>(res).items.map((i) => i.id);
      expect(ids).toContain(empId);
    });

    it('accepts uppercase UUID in q search and path param', async () => {
      const upperUuid = emp1.id.toUpperCase();
      const searchRes = await getList(`q=${upperUuid}`).expect(200);
      const items = dataOf<EmployeeListPageWire>(searchRes).items;
      expect(items).toHaveLength(1);
      expect(items[0]?.id).toBe(emp1.id);

      const detailRes = await getDetail(upperUuid).expect(200);
      expect(dataOf<EmployeeDetailWire>(detailRes).id).toBe(emp1.id);
    });

    it('preserves totalItems on a page beyond the end', async () => {
      const first = dataOf<EmployeeListPageWire>(await getList('page=1&pageSize=10').expect(200));
      const res = await getList('page=9999&pageSize=10').expect(200);
      const page = dataOf<EmployeeListPageWire>(res);
      expect(page.items).toEqual([]);
      expect(page.pagination.page).toBe(9999);
      expect(first.pagination.totalItems).toBeGreaterThanOrEqual(4);
      expect(page.pagination.totalItems).toBe(first.pagination.totalItems);
    });

    it('returns first 50 placements and sets placementsHasMore: true for 51 placements', async () => {
      const empRes = await h
        .api()
        .post('/api/v1/employees')
        .set(h.asAdmin())
        .send({
          employeeCode: 'NV-MANY-PLACES',
          fullName: 'Many Placements Emp',
          workEmail: 'many.places@acme.vn',
          employmentType: 'STAFF',
          hireDate: '2020-01-01',
        })
        .expect(201);
      const empId = dataOf<{ id: string }>(empRes).id;

      // Seed 51 placements
      const baseYear = 1970;
      await h.ctx.sql.query(
        `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from, valid_to)
         SELECT gen_random_uuid(), $1, $2, $3,
                to_date(($4 + n)::text || '-01-01', 'YYYY-MM-DD'),
                to_date(($4 + n)::text || '-06-01', 'YYYY-MM-DD')
           FROM generate_series(1, 51) AS n`,
        [h.seed.organizationId, empId, dep1.id, baseYear],
      );

      const res = await getDetail(empId).expect(200);
      const detail = dataOf<EmployeeDetailWire>(res);
      expect(detail.placements).toHaveLength(50);
      expect(detail.placementsHasMore).toBe(true);
    });
  });

  describe('N+1 query independence', () => {
    beforeAll(async () => {
      // Seed 35 employees in bulk to compare query count for pageSize=5 and pageSize=30
      await h.ctx.sql.query(
        `WITH bulk_emp AS (
           INSERT INTO employees (id, organization_id, employee_code, full_name, work_email, normalized_work_email,
             employment_type, hire_date, updated_at)
           SELECT gen_random_uuid(), $1, 'NV-N1-' || lpad(n::text, 3, '0'), 'Worker ' || n,
                  'worker' || n || '@acme.vn', 'worker' || n || '@acme.vn',
                  'STAFF', '2025-01-01', now()
             FROM generate_series(1, 35) AS n
           RETURNING id, organization_id
         )
         INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
         SELECT gen_random_uuid(), organization_id, id, $2, '2025-01-01' FROM bulk_emp`,
        [h.seed.organizationId, h.seed.departmentId],
      );
    });

    it('executes the exact same number of data statements for 5 and 30 employees (no N+1)', async () => {
      const run5 = await counter.run(() =>
        request(h.server()).get('/api/v1/employees?pageSize=5').set(h.asAdmin()).expect(200),
      );
      const run30 = await counter.run(() =>
        request(h.server()).get('/api/v1/employees?pageSize=30').set(h.asAdmin()).expect(200),
      );

      const data5 = dataStatements(run5.statements);
      const data30 = dataStatements(run30.statements);

      expect(dataOf<EmployeeListPageWire>(run5.result).items).toHaveLength(5);
      expect(dataOf<EmployeeListPageWire>(run30.result).items).toHaveLength(30);

      // The number of data queries must be constant regardless of page size (no N+1 fanout)
      expect(data5.length).toBe(data30.length);
      expect(data5.length).toBeLessThanOrEqual(10);
    });
  });
});
