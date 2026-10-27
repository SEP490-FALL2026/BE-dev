import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Department, Person, RequestHarness } from '../support/request-harness';
import { HR_BASIS } from '../support/hr-basis';

/**
 * `g0-g6-final-business-baseline-remediation`, Task 1.1a (F01, spec L.11) over HTTP: a department may exist with no Cost
 * Center, a Cost Center never exists without one department, and the compatibility release creates a department only after
 * the operator has activated the link — while the release that can still be recovered cannot read a department with no Cost
 * Center. Before the activation the answers are the mapped ones; after it, a department is created with none, reads work, and
 * whatever charges a cost to it answers 409 `FINANCE.SETUP_INCOMPLETE` with nothing written.
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
  const departments = async () =>
    Number((await h.ctx.sql.query<{ n: string }>('SELECT count(*) AS n FROM departments')).rows[0].n);
  const errorCode = (response: request.Response) => (response.body as { error: { code: string } }).error.code;
  const checklistGate = async () =>
    (
      (await request(h.server()).get('/api/v1/onboarding-checklist').set(h.as(h.it1)).expect(200)).body as {
        data: { steps: { createDepartmentBlockedBy?: string | null }[] };
      }
    ).data.steps[0].createDepartmentBlockedBy;

  describe('before the operator activates the link (window 1: the release that can be recovered is still the previous one)', () => {
    it('answers 409 DEPARTMENT.CREATION_AWAITING_ACTIVATION to departmentCreate, writes nothing, and says so in the checklist', async () => {
      const before = await departments();

      const response = await createDepartment().expect(409);

      expect(errorCode(response)).toBe('DEPARTMENT.CREATION_AWAITING_ACTIVATION');
      expect(await departments()).toBe(before);
      expect(await checklistGate()).toBe('AWAITING_ACTIVATION');
    });

    it('lets Finance create a Cost Center for a department the previous release made (one whose own was retired): the previous release reads it through its own column', async () => {
      // A department with a retired Cost Center, as `7c28e75` leaves one: its column names the retired one.
      const department = (
        await h.ctx.sql.query<{ id: string; code: string }>(
          `INSERT INTO departments (id, organization_id, code, name, updated_at)
           VALUES (gen_random_uuid(), $1, 'P-LEGACY', 'Legacy', now()) RETURNING id, code`,
          [h.seed.organizationId],
        )
      ).rows[0];
      const old = (
        await h.ctx.sql.query<{ id: string }>(
          `INSERT INTO cost_centers (id, organization_id, code, name, kind, status, department_id, linked_at, deactivated_at)
           VALUES (gen_random_uuid(), $1, 'CC-LEGACY-OLD', 'Old', 'UNIT', 'INACTIVE', $2, now(), now()) RETURNING id`,
          [h.seed.organizationId, department.id],
        )
      ).rows[0];

      const created = await request(h.server())
        .post('/api/v1/cost-centers')
        .set(h.as(h.finance))
        .send({ code: 'CC-LEGACY-NEW', name: 'New', kind: 'UNIT', departmentId: department.id })
        .expect(201);
      const costCenterId = (created.body as { data: { id: string } }).data.id;

      expect(
        (
          await h.ctx.sql.query<{ cost_center_id: string }>('SELECT cost_center_id FROM departments WHERE id = $1', [
            department.id,
          ])
        ).rows,
      ).toEqual([{ cost_center_id: costCenterId }]);
      // The retired one stays with the department as history.
      expect(
        (
          await h.ctx.sql.query<{ department_id: string }>('SELECT department_id FROM cost_centers WHERE id = $1', [
            old.id,
          ])
        ).rows,
      ).toEqual([{ department_id: department.id }]);
    });
  });

  describe('after the operator activates the link', () => {
    let department: Department;
    let person: Person;
    let paidPlan: string;

    beforeAll(async () => {
      await h.ctx.sql.query(
        `INSERT INTO cost_center_direction_activations (id, organization_id, release_evidence, approver_ref, operator_ref, environment)
         VALUES (gen_random_uuid(), $1, 'deploy run 7, image sha256:abc', 'release-owner', 'ops', 'LOCAL_TEST')`,
        [h.seed.organizationId],
      );
      department = await h.departmentWithUnit('P-FIN-SETUP');
      person = await h.staff(department, 'FS-E1');
      paidPlan = await h.plan('K2');
    });

    it('creates a department with no Cost Center (201, costCenter null), reads it, lists it, and the checklist stops blocking', async () => {
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
      expect(await checklistGate()).toBeNull();
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
});
