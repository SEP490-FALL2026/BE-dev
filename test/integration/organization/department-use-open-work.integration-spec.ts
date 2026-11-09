import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { OrganizationApi } from '../../../src/modules/organization/public/organization.api';
import { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';
import { ProvisioningHarness } from '../../support/provisioning-harness';

const h = new ProvisioningHarness();

/**
 * F15 (`QĐ-90e`, spec B): licensing tells the organization which provisioning tasks are still open for a department, so that it cannot
 * be retired while seats of it are being granted or taken away. A task is open while it is queued, waiting for its retry, being worked
 * or failed; it belongs to the department that owns its seat, or, for a seat that carries none, to the owner of its subscription.
 * Read through `OrganizationApi.getDepartmentUse`, the way retiring a department reads it, on real PostgreSQL.
 */
describe('what keeps a department in use: the open provisioning tasks (integration, F15)', () => {
  let today: string;
  let owner: { id: string; code: string };
  let other: { id: string; code: string };
  let nothing: { id: string; code: string };
  let ownerSubscription: string;
  let ownerPlan: string;
  const open: string[] = [];
  let counter = 0;

  const use = async (departmentId: string, limit = 50) => {
    const { openWork } = await h.ctx.app
      .get(OrganizationApi, { strict: false })
      .getDepartmentUse(departmentId, today, limit);

    return { total: openWork.total, items: openWork.items.filter((item) => item.kind === 'PROVISIONING_TASK') };
  };
  const granted = async (subscriptionId: string, planId: string, departmentId: string) =>
    h.granted(await h.person(`E-OW${(counter += 1)}`), planId, { subscriptionId, departmentId });
  const subscriptionOf = async (departmentId: string) => {
    const subscriptionId = await h.subscription(20, 'K2', departmentId);

    return { subscriptionId, planId: await h.planOf(subscriptionId) };
  };

  /** A grant task on a seat of the owner's subscription that carries no owning department, as the compatibility release wrote personal seats. */
  const legacyTask = async (): Promise<string> => {
    const employeeId = await h.person(`E-OW${(counter += 1)}`);
    const assignmentId = (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
           normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
         SELECT gen_random_uuid(), s.organization_id, 'PERSONAL', 'REQUEST', s.plan_id, s.id, $2, $3, $3, '2026-10-01', 'ACTUAL',
                gen_random_uuid()
           FROM subscriptions s WHERE s.id = $1 RETURNING id`,
        [ownerSubscription, employeeId, `legacy${counter}@acme.vn`],
      )
    ).rows[0].id;

    return (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, request_id, max_attempts, created_by_app_user_id)
         SELECT gen_random_uuid(), organization_id, id, 'GRANT', 'MANUAL', $2, 4, gen_random_uuid()
           FROM license_assignments WHERE id = $1 RETURNING id`,
        [assignmentId, randomUUID()],
      )
    ).rows[0].id;
  };

  beforeAll(async () => {
    await h.start();
    today = await h.ctx.app.get(OrganizationReadApi, { strict: false }).businessToday();
    owner = await h.department('P-OWNER');
    other = await h.department('P-OTHER');
    nothing = await h.department('P-NOTHING');
    ({ subscriptionId: ownerSubscription, planId: ownerPlan } = await subscriptionOf(owner.id));

    // Open: a queued task, one being worked, one that failed (a grant of a seat on a subscription of the department).
    open.push((await granted(ownerSubscription, ownerPlan, owner.id)).id);
    const working = await granted(ownerSubscription, ownerPlan, owner.id);
    await h.claim(working.id).expect(200);
    open.push(working.id);
    const failed = await granted(ownerSubscription, ownerPlan, owner.id);
    await h.claim(failed.id).expect(200);
    await h.fail(failed.id, { reason: 'could not be done' }).expect(200);
    open.push(failed.id);
    // Open, found through the subscription: a seat made before a personal seat carried its department has none of its own.
    open.push(await legacyTask());

    // Not open: a task that is done and one closed as failed.
    const done = await granted(ownerSubscription, ownerPlan, owner.id);
    await h.claim(done.id).expect(200);
    await h.complete(done.id, { evidence: 'done' }).expect(200);
    const closed = await granted(ownerSubscription, ownerPlan, owner.id);
    await h.claim(closed.id).expect(200);
    await h.fail(closed.id, { reason: 'no' }).expect(200);
    await h.closeFailed(closed.id, { reason: 'not wanted' }).expect(200);
    // Another department's seat is not this one's.
    const elsewhere = await subscriptionOf(other.id);
    await granted(elsewhere.subscriptionId, elsewhere.planId, other.id);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('lists the tasks that are open for the department, by id, whether the seat carries the department or only its subscription does', async () => {
    const { items, total } = await use(owner.id);

    expect(total).toBe(4);
    expect(items.map((item) => item.id)).toEqual([...open].sort());
    for (const item of items) expect(item.label).toMatch(/ \/ /);
  });

  it("does not count a task that is done or closed as failed, nor another department's", async () => {
    const { items } = await use(owner.id);
    const stored = await h.ctx.sql.query<{ id: string }>(
      `SELECT t.id FROM provisioning_tasks t JOIN license_assignments a ON a.id = t.assignment_id
        WHERE a.subscription_id = $1 AND t.status IN ('COMPLETED', 'CLOSED_FAILED', 'CANCELLED')`,
      [ownerSubscription],
    );

    expect(stored.rows).toHaveLength(2);
    for (const row of stored.rows) expect(items.map((item) => item.id)).not.toContain(row.id);
    expect((await use(other.id)).total).toBe(1);
  });

  it('answers nothing for a department with no task', async () => {
    expect(await use(nothing.id)).toEqual({ items: [], total: 0 });
  });

  it('is bounded: a page shorter than the total names the first by id and still counts them all', async () => {
    const { items, total } = await use(owner.id, 2);

    expect(total).toBe(4);
    expect(items.map((item) => item.id)).toEqual([...open].sort().slice(0, 2));
  });

  it('BR-MF1-02/07: requester revision keeps both the department and its Cost Center in use', async () => {
    const department = await h.department('P-REVISION');
    const employeeId = await h.member(department.code, 'E-REVISION', 'Specialist');
    const account = await h.account('E-REVISION', employeeId);
    // No head and no approved budget: the paid request is retained for its requester to revise.
    const sent = await request(h.server())
      .post('/api/v1/access-requests')
      .set(h.as(account))
      .send({ planId: ownerPlan, businessReason: 'Work in the new department' })
      .expect(201);
    const revision = h.dataOf<{ request: { id: string; state: string } }>(sent).request;
    expect(revision.state).toBe('AWAITING_REQUESTER_REVISION');
    const stored = await h.ctx.sql.query<{ cost_center_id: string }>(
      `SELECT cost_center_id FROM access_requests WHERE id = $1`,
      [revision.id],
    );
    const costCenterId = stored.rows[0].cost_center_id;
    const api = h.ctx.app.get(OrganizationApi, { strict: false });

    expect((await api.getDepartmentUse(department.id, today, 50)).openWork.items).toContainEqual({
      kind: 'ACCESS_REQUEST', id: revision.id, label: null,
    });
    expect((await api.getCostCenterUse(costCenterId, 50)).requests).toEqual({
      total: 1, items: [{ kind: 'ACCESS_REQUEST', id: revision.id, label: null }],
    });
    const retireDepartment = await request(h.server())
      .post(`/api/v1/departments/${department.id}/deactivate`)
      .set({ Authorization: `Bearer ${h.admin}` })
      .send({})
      .expect(409);
    expect(h.codeOf(retireDepartment)).toBe('DEPARTMENT.IN_USE');
    expect(h.detailsOf(retireDepartment).openWork).toContainEqual({
      kind: 'ACCESS_REQUEST', id: revision.id, label: null,
    });
    const retireCostCenter = await request(h.server())
      .post(`/api/v1/cost-centers/${costCenterId}/deactivate`)
      .set(h.as(h.finance))
      .expect(409);
    expect(h.codeOf(retireCostCenter)).toBe('COST_CENTER.IN_USE');
    expect(h.detailsOf(retireCostCenter).requests).toEqual([
      { kind: 'ACCESS_REQUEST', id: revision.id, label: null },
    ]);
  });
});
