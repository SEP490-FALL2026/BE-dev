import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Department, Person, RequestHarness } from '../../support/request-harness';
import { HR_BASIS } from '../../support/hr-basis';

/**
 * `g0-g6-final-business-baseline-remediation`, Task 1.1 and 2.2 (F01, spec L.11) over HTTP, in the FINAL release: a department may
 * exist with no Cost Center, a Cost Center never exists without one department, and `departmentCreate` needs no activation of
 * the compatibility release (the final code never reads the row; this installation has none). A department is created with none,
 * reads work, and whatever charges a cost to it answers 409 `FINANCE.SETUP_INCOMPLETE` with nothing written until Finance creates
 * its Cost Center. The compatibility window (the activation gate, the old column) is proved by the suites that deploy the history
 * through the compatibility release.
 */
const h = new RequestHarness();

describe('the Cost Center link over HTTP (integration, real PostgreSQL)', () => {
  const superAdmin = () => ({ Authorization: `Bearer ${h.admin}` });
  let counter = 0;

  beforeAll(async () => {
    await h.start();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const createDepartment = (code = `P-LINK${(counter += 1)}`) =>
    request(h.server())
      .post('/api/v1/departments')
      .set(superAdmin())
      .send({ code, name: `Department ${code}`, hrBasis: HR_BASIS });
  const errorCode = (response: request.Response) => (response.body as { error: { code: string } }).error.code;

  describe('a department with no Cost Center', () => {
    let department: Department;
    let person: Person;
    let paidPlan: string;

    beforeAll(async () => {
      department = await h.departmentWithUnit('P-FIN-SETUP');
      person = await h.staff(department, 'FS-E1');
      paidPlan = await h.plan('K2');
    });

    it('is created without any activation row (201, costCenter null), read and listed with none', async () => {
      const activations = Number(
        (await h.ctx.sql.query<{ n: string }>('SELECT count(*) AS n FROM cost_center_direction_activations')).rows[0].n,
      );
      expect(activations).toBe(0);

      const created = await createDepartment().expect(201);
      const id = (created.body as { data: { id: string; costCenter: unknown } }).data.id;

      expect((created.body as { data: { costCenter: unknown } }).data.costCenter).toBeNull();
      const read = await request(h.server()).get(`/api/v1/departments/${id}`).set(h.as(h.it1)).expect(200);
      expect((read.body as { data: { costCenter: unknown } }).data.costCenter).toBeNull();
      const listed = await request(h.server()).get('/api/v1/departments?pageSize=100').set(h.as(h.it1)).expect(200);
      expect(
        (listed.body as { data: { items: { id: string; costCenter: unknown }[] } }).data.items.find(
          (item) => item.id === id,
        )?.costCenter,
      ).toBeNull();
    });

    it('answers 409 FINANCE.SETUP_INCOMPLETE to a request from a department with no Cost Center in use — the preview and the submission — and writes nothing', async () => {
      // The Cost Center of the department is retired (here by SQL, as a state that can exist): none is in use.
      await h.ctx.sql.query(
        `UPDATE cost_centers SET status = 'INACTIVE', deactivated_at = now() WHERE department_id = $1`,
        [department.id],
      );
      const rows = await h.requestRows();
      const audit = Number((await h.ctx.sql.query<{ n: string }>('SELECT count(*) AS n FROM audit_events')).rows[0].n);

      const preview = await h.previewRequest({ planId: paidPlan, termMonths: 6 }, person.account);
      const submitted = await h.submit(h.form(paidPlan), person.account);

      expect([preview.status, submitted.status]).toEqual([409, 409]);
      expect([errorCode(preview), errorCode(submitted)]).toEqual([
        'FINANCE.SETUP_INCOMPLETE',
        'FINANCE.SETUP_INCOMPLETE',
      ]);
      expect(await h.requestRows()).toBe(rows);
      expect(Number((await h.ctx.sql.query<{ n: string }>('SELECT count(*) AS n FROM audit_events')).rows[0].n)).toBe(
        audit,
      );
    });

    it('lets Finance create the Cost Center for it afterwards, and the same request is then accepted', async () => {
      await request(h.server())
        .post('/api/v1/cost-centers')
        .set(h.as(h.finance))
        .send({
          code: `CC-FS-${randomUUID().slice(0, 4)}`,
          name: 'Created for it',
          kind: 'UNIT',
          departmentId: department.id,
        })
        .expect(201);

      const submitted = await h.submit(h.form(paidPlan), person.account);

      expect(submitted.status).toBe(201);
    });
  });

  it('refuses a Cost Center with no department at the database: the link is required for its whole life (NOT NULL, QĐ-87d(1))', async () => {
    const insert = h.ctx.sql.query(
      `INSERT INTO cost_centers (id, organization_id, code, name, kind, status)
       VALUES (gen_random_uuid(), $1, 'CC-NO-DEPARTMENT', 'No department', 'UNIT', 'ACTIVE')`,
      [h.seed.organizationId],
    );

    await expect(insert).rejects.toMatchObject({ code: '23502' });
  });

  it('refuses a second Cost Center in use for a department (409 COST_CENTER.DEPARTMENT_ALREADY_LINKED), and writes nothing', async () => {
    const department = await h.departmentWithUnit('P-LINK-TWICE');
    const before = Number(
      (
        await h.ctx.sql.query<{ n: string }>('SELECT count(*) AS n FROM cost_centers WHERE department_id = $1', [
          department.id,
        ])
      ).rows[0].n,
    );

    const response = await request(h.server())
      .post('/api/v1/cost-centers')
      .set(h.as(h.finance))
      .send({ code: `CC-TW-${randomUUID().slice(0, 4)}`, name: 'Second', kind: 'UNIT', departmentId: department.id })
      .expect(409);

    expect(errorCode(response)).toBe('COST_CENTER.DEPARTMENT_ALREADY_LINKED');
    expect(
      Number(
        (
          await h.ctx.sql.query<{ n: string }>('SELECT count(*) AS n FROM cost_centers WHERE department_id = $1', [
            department.id,
          ])
        ).rows[0].n,
      ),
    ).toBe(before);
  });
});
