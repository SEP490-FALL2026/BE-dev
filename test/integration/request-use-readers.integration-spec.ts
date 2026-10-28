import request from 'supertest';
import { OrganizationService } from '../../src/modules/organization/organization.service';
import { RequestUseRepo } from '../../src/modules/requests/access-request/request-use.repo';
import type { Person } from '../support/request-harness';
import { SpendHarness, type Unit } from '../support/spend-harness';

/**
 * `g0-g6-final-business-baseline-remediation`, F15 and F16 (`QĐ-90e`, `QĐ-87d(2)`): what the module of requests tells the organization when
 * a department or a Cost Center is retired. The Requests of the department that are not over are its `OPEN_WORK`; the Requests charged
 * to a Cost Center that are not over are its `REQUESTS`. A request that is over (refused, withdrawn, cancelled, completed, failed) and a
 * draft (not work yet, spec L.1: no step, no check, no commitment, no Cost Center) are not told. Bounded: the first `limit` by id and the
 * exact total, in two statements.
 */
const h = new SpendHarness();

interface Told {
  kind: string;
  id: string;
  label: string | null;
}

describe('the requests that keep a department or a Cost Center in use (integration, real PostgreSQL)', () => {
  let plan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    plan = await h.plan('K2');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;

    return h.departmentWithHead(`P-UR${counter}`);
  };
  const person = async (u: Unit): Promise<Person> => {
    counter += 1;

    return h.staff(u.department, `UR-E${counter}`);
  };
  const organization = () => h.ctx.app.get(OrganizationService, { strict: false });
  const requests = (items: Told[]) => items.filter((item) => item.kind === 'ACCESS_REQUEST');
  const sorted = (ids: string[]) => [...ids].sort();
  /** What the organization asks of the department: the Requests among what keeps it in use, and the total of the group. */
  const departmentUse = async (u: Unit, limit = 100) => {
    const use = await organization().getDepartmentUse(u.department.id, h.today(), limit);

    return { items: requests(use.openWork.items), total: use.openWork.total };
  };
  const costCenterUse = async (u: Unit, limit = 100) => {
    const use = await organization().getCostCenterUse(u.department.unitId, limit);

    return { items: requests(use.requests.items), total: use.requests.total };
  };
  /** A request of a person that waits for the need step of the head: open. */
  const open = async (u: Unit): Promise<string> => (await h.sent(await person(u), plan, { termMonths: 1 })).id;
  const saveDraft = async (u: Unit): Promise<string> => {
    const sender = await person(u);
    const response = await request(h.server())
      .post('/api/v1/access-requests/drafts')
      .set(h.as(sender.account))
      .send({ kind: 'INDIVIDUAL', ...h.form(plan) })
      .expect(201);

    return h.dataOf<{ draft: { id: string } }>(response).draft.id;
  };

  it('tells every request of the department and of the Cost Center that is not over, by id, with the exact total and no label', async () => {
    const u = await unit();
    const ids = [await open(u), await open(u), await open(u)];

    const department = await departmentUse(u);
    const costCenter = await costCenterUse(u);

    const expected = sorted(ids).map((id) => ({ kind: 'ACCESS_REQUEST', id, label: null }));
    expect(department).toEqual({ items: expected, total: 3 });
    expect(costCenter).toEqual({ items: expected, total: 3 });
  });

  it('tells nothing for a department and a Cost Center that no request is open for', async () => {
    const u = await unit();

    expect(await departmentUse(u)).toEqual({ items: [], total: 0 });
    expect(await costCenterUse(u)).toEqual({ items: [], total: 0 });
  });

  it('does not tell a request that is over, a draft, or a request of another department', async () => {
    const u = await unit();
    const other = await unit();
    const kept = await open(u);
    const refused = await open(u);
    await h.decide(refused, { decision: 'REJECT', reason: 'Not needed this quarter' }, u.head.account).expect(200);
    const sender = await person(u);
    const withdrawn = (await h.sent(sender, plan, { termMonths: 1 })).id;
    await h.withdrawRequest(withdrawn, {}, sender.account).expect(200);
    const draft = await saveDraft(u);
    await open(other);

    expect(await h.state(refused)).toBe('REJECTED');
    expect(await h.state(withdrawn)).toBe('WITHDRAWN');
    expect(await h.state(draft)).toBe('DRAFT');
    const expected = { items: [{ kind: 'ACCESS_REQUEST', id: kept, label: null }], total: 1 };
    expect(await departmentUse(u)).toEqual(expected);
    expect(await costCenterUse(u)).toEqual(expected);
  });

  it('tells a request again once it is open again, and stops telling it when it ends: the answer follows the state', async () => {
    const u = await unit();
    const sender = await person(u);
    const id = (await h.sent(sender, plan, { termMonths: 1 })).id;
    expect((await departmentUse(u)).total).toBe(1);

    await h.withdrawRequest(id, {}, sender.account).expect(200);

    expect(await departmentUse(u)).toEqual({ items: [], total: 0 });
    expect(await costCenterUse(u)).toEqual({ items: [], total: 0 });
  });

  it('tells a request that waits for the IT Admin to close its task: withdrawn is not over until it is closed', async () => {
    const u = await unit();
    const id = await open(u);
    await h.ctx.sql.query(
      `UPDATE access_requests
          SET state = 'AWAITING_IT_CLOSE', withdrawal_requested_at = now(), withdrawn_by_employee_id = requester_employee_id
        WHERE id = $1`,
      [id],
    );

    expect((await departmentUse(u)).items.map((item) => item.id)).toEqual([id]);
    expect((await costCenterUse(u)).items.map((item) => item.id)).toEqual([id]);
  });

  it('tells only the first `limit` by id and the exact total when there are more', async () => {
    const u = await unit();
    const ids = sorted([await open(u), await open(u), await open(u), await open(u)]);

    const department = await departmentUse(u, 2);
    const costCenter = await costCenterUse(u, 3);

    expect(department.items.map((item) => item.id)).toEqual(ids.slice(0, 2));
    expect(department.total).toBe(4);
    expect(costCenter.items.map((item) => item.id)).toEqual(ids.slice(0, 3));
    expect(costCenter.total).toBe(4);
  });

  it('asks for no more than the limit, even none, and still counts all of them', async () => {
    const u = await unit();
    await open(u);
    await open(u);
    const repo = h.ctx.app.get(RequestUseRepo, { strict: false });

    const found = await repo.ofDepartment(u.department.id, 1);
    const none = await repo.ofCostCenter(u.department.unitId, 0);

    expect(found.ids).toHaveLength(1);
    expect(found.total).toBe(2);
    expect(none).toEqual({ ids: [], total: 2 });
  });
});
