import request from 'supertest';
import { declareApplication, declarePlan } from '../../support/builders/catalog.builder';
import { createDepartment, enterEmployee } from '../../support/builders/organization.builder';
import { GroupHarness } from '../../support/group-harness';
import type { AccessRequestWire } from '../../support/request-harness';
import { buildTicketWorld, type TicketWorld } from '../../support/request-ticket-harness';

const h = new GroupHarness();
const admin = () => ({ Authorization: `Bearer ${h.admin}` });
const readRequest = (response: request.Response) => h.dataOf<{ request: AccessRequestWire }>(response).request;

describe('single requests on the Wave 3 baseline', () => {
  let w: TicketWorld;

  beforeAll(async () => {
    await h.start();
    w = await buildTicketWorld(h, { budget: { baseMinor: 2_000_000n, reserveMinor: 1_000_000n } });
  }, 240000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await h.stop();
  });

  it('disallows a Super Admin and refuses to request access the requester already holds', async () => {
    const denied = await request(h.server())
      .post('/api/v1/access-requests')
      .set(admin())
      .send(h.form(w.plans.miro, { termMonths: 1 }))
      .expect(403);
    expect(h.codeOf(denied)).toBe('ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST');
    const staff = await h.staff(w.pDes, 'REQ-HELD');
    await h.hold('REQ-HELD', w.plans.k5Internal);
    expect(h.codeOf(await h.submit(h.form(w.plans.k5Internal), staff.account).expect(409))).toBe(
      'ACCESS_REQUEST.ALREADY_HOLDS_ACCESS',
    );
  });

  it('rejects an unplaced requester and distinguishes a future first placement', async () => {
    const unplaced = await h.unplacedStaff('REQ-NOPLACE');
    const future = await h.unplacedStaff('REQ-FUTURE');
    await request(h.server())
      .post(`/api/v1/employees/${future.employeeId}/first-placements`)
      .set(admin())
      .send({ departmentId: w.pDes.id, effectiveFrom: '2026-06-02' })
      .expect(201);
    const form = h.form(w.plans.k5Internal);
    const withoutPlacement = await h.submit(form, unplaced.account).expect(422);
    expect(h.codeOf(withoutPlacement)).toBe('REQUEST_PARTY.INELIGIBLE');
    expect(h.detailsOf(withoutPlacement)).toMatchObject({ reason: 'UNPLACED', party: 'REQUESTER' });
    const futurePlacement = await h.submit(form, future.account).expect(409);
    expect(h.codeOf(futurePlacement)).toBe('EMPLOYEE.NOT_STARTED');
  });

  it('returns the seven single-request term refusal codes and never writes a request for them', async () => {
    const timedStaff = async (code: string, contractEndDate: string) => {
      const { id } = await enterEmployee(h.ctx, h.admin, {
        employeeCode: code,
        fullName: code,
        workEmail: `${code.toLowerCase()}@acme.vn`,
        employmentType: 'INTERN',
        hireDate: '2026-05-01',
        contractEndDate,
        departmentCode: w.pDes.code,
      });
      return h.account(code, id);
    };
    const intern = await timedStaff('REQ-INTERN', '2026-10-01');
    const ended = await timedStaff('REQ-ENDED', '2026-05-31');
    const accountKey = await h.plan('K4');
    const monthlyK1 = await h.planOf(await h.subscription(10, 'K1'));
    const cases = [
      [h.form(monthlyK1), w.e1.account, 'TERM_REQUIRED'],
      [h.form(monthlyK1, { termMonths: 10 }), w.e1.account, 'TERM_MONTHS_OUT_OF_RANGE'],
      [h.form(accountKey, { termMonths: 1 }), w.e1.account, 'TERM_NOT_ASKED'],
      [h.form(w.plans.miro, { termMonths: null }), intern, 'TERM_LONG_TERM_NOT_ALLOWED'],
      [h.form(w.plans.miro, { termMonths: 1 }), ended, 'TERM_CONTRACT_ENDED'],
      [h.form(w.plans.k1Annual, { termMonths: 6 }), w.e1.account, 'K1_ANNUAL_TERM_FIXED'],
      [h.form(w.plans.k1Annual, { termMonths: 12 }), intern, 'K1_ANNUAL_CONTRACT_TOO_SHORT'],
    ] as const;
    const before = await h.requestRows();
    const refused = [];
    for (const [body, account] of cases) {
      const response = await h.submit(body, account);
      refused.push({ status: response.status, code: response.status === 422 ? h.codeOf(response) : null });
    }
    expect(refused).toEqual(cases.map(([, , reason]) => ({ status: 422, code: `ACCESS_REQUEST.${reason}` })));
    expect(await h.requestRows()).toBe(before);
  });

  it('uses the live monthly line price and enforces both open-request limits', async () => {
    await h.enforceRequestLimits();
    await h.setParameter('REQUEST_OPEN_NEW_LIMIT', 3).expect(200);
    try {
      const employee = await h.staff(w.pDes, 'REQ-LIMITS');
      const sent = await h.sent(employee, w.plans.miro, { termMonths: 2 });
      const price = await h.ctx.sql.query<{ monthly_price_minor: string }>(
        'SELECT monthly_price_minor FROM access_requests WHERE id = $1',
        [sent.id],
      );
      expect(price.rows).toEqual([{ monthly_price_minor: '500000' }]);
      expect(h.codeOf(await h.submit(h.form(w.plans.miro, { termMonths: 2 }), employee.account).expect(409))).toBe(
        'ACCESS_REQUEST.OPEN_REQUEST_EXISTS',
      );
      await h.sent(employee, w.plans.notion, { termMonths: 1 });
      await h.sent(employee, w.plans.slack, { termMonths: 1 });
      expect(h.codeOf(await h.submit(h.form(w.plans.figmaFull, { termMonths: 1 }), employee.account).expect(422))).toBe(
        'ACCESS_REQUEST.OPEN_LIMIT_REACHED',
      );
    } finally {
      await h.setParameter('REQUEST_OPEN_NEW_LIMIT', 20).expect(200);
    }
  });

  it('opens one-step spend within base and reserve, and accepts resubmission after an automatic budget block', async () => {
    const initialBudget = h.dataOf<{ budget: { runningUncommitted: { amount: string } } }>(
      await request(h.server()).get('/api/v1/budgets/mine').query({ year: 2026 }).set(h.as(w.h1.account)).expect(200),
    );
    expect(initialBudget.budget.runningUncommitted.amount).toBe('0');
    const passed = await h.sent(w.h1, w.plans.slack, { termMonths: 2 });
    await h.decideSpend(passed.id, { decision: 'REJECT', reason: 'Close the base case' }, w.c1.account).expect(200);
    const reserve = await h.sent(w.h1, w.plans.figmaFull, { termMonths: 4 });
    await h.decideSpend(reserve.id, { decision: 'REJECT', reason: 'Close the reserve case' }, w.c1.account).expect(200);
    const blocked = await h.sent(w.h1, w.plans.miro, { termMonths: 7 });
    expect([passed.state, reserve.state, blocked.state]).toEqual([
      'AWAITING_SPEND_DECISION',
      'AWAITING_SPEND_DECISION',
      'AWAITING_REQUESTER_REVISION',
    ]);
    for (const [sent, outcome] of [
      [passed, 'WITHIN_BASE'],
      [reserve, 'USES_RESERVE'],
      [blocked, 'BLOCKED'],
    ] as const) {
      expect(sent.routing.mode).toBe('ONE_STEP');
      const check = await h.ctx.sql.query(
        'SELECT outcome FROM request_budget_checks WHERE request_id = $1 ORDER BY number LIMIT 1',
        [sent.id],
      );
      expect(check.rows).toEqual([{ outcome }]);
    }
    await h.addSupplement(blocked.id, { reason: 'One month is enough', termMonths: 1 }, w.h1.account).expect(201);
    const resubmitted = await request(h.server())
      .post(`/api/v1/access-requests/${blocked.id}/resubmission`)
      .set(h.as(w.h1.account))
      .expect(200);
    expect(readRequest(resubmitted)).toMatchObject({ state: 'AWAITING_SPEND_DECISION', termMonths: 1 });
    await h
      .decideSpend(blocked.id, { decision: 'REJECT', reason: 'Close the resubmission case' }, w.c1.account)
      .expect(200);
  });

  it('returns per-request batch results for a replay, a closed step and a group', async () => {
    const person = await h.staff(w.pDes, 'REQ-BATCH');
    const single = await h.sent(person, w.plans.slack, { termMonths: 1 });
    const closed = await h.sent(person, w.plans.notion, { termMonths: 1 });
    for (const id of [single.id, closed.id]) await h.decide(id, { decision: 'APPROVE' }, w.h1.account).expect(200);
    const members = [await h.staff(w.pDes, 'REQ-GROUP-A'), await h.staff(w.pDes, 'REQ-GROUP-B')];
    const group = readRequest(
      await h.submitGroup(h.groupBody(w.plans.figmaDev, members, { termMonths: 1 }), w.h1.account).expect(201),
    );
    const { batch } = h.dataOf<{ batch: { id: string } }>(
      await h.sendOn([single.id, closed.id, group.id], w.h1.account).expect(201),
    );
    await h.decideSpend(closed.id, { decision: 'REJECT', reason: 'No longer needed' }, w.c1.account).expect(200);
    await h.decideSpend(single.id, { decision: 'APPROVE' }, w.c1.account).expect(200);
    const response = await h
      .decideBatch(batch.id, { decision: 'APPROVE', requestIds: [single.id, closed.id, group.id] }, w.c1.account)
      .expect(200);
    expect(h.dataOf<{ results: unknown }>(response).results).toEqual([
      { requestId: single.id, outcome: 'APPROVED', reason: 'ALREADY_DECIDED' },
      { requestId: closed.id, outcome: 'SKIPPED', reason: 'NO_SPEND_STEP' },
      { requestId: group.id, outcome: 'SKIPPED', reason: 'GROUP_NEEDS_LINES' },
    ]);
  });

  it('reports a batch item skipped when a real price change blocks its recheck', async () => {
    const app = await declareApplication(h.ctx, w.it1.accessToken, {
      name: 'Recheck tool',
      vendorName: 'Recheck vendor',
      kind: 'SAAS',
      dataSensitivity: 'LOW',
    });
    const plan = await declarePlan(h.ctx, w.it1.accessToken, {
      applicationId: app,
      name: 'Monthly',
      provisioningType: 'K1',
      pricingModel: 'PER_SEAT',
      controlLevel: 'FULL',
      referenceCommitmentMonths: 1,
      referencePrice: { amount: '100000', currency: 'VND' },
    });
    const sent = await h.sent(w.e1, plan, { termMonths: 1 });
    await h.decide(sent.id, { decision: 'APPROVE' }, w.h1.account).expect(200);
    const { batch } = h.dataOf<{ batch: { id: string } }>(await h.sendOn([sent.id], w.h1.account).expect(201));
    await request(h.server())
      .patch(`/api/v1/plans/${plan}`)
      .set(h.as(w.it1))
      .send({ referencePrice: { amount: '4000000', currency: 'VND' } })
      .expect(200);
    const response = await h
      .decideBatch(batch.id, { decision: 'APPROVE', requestIds: [sent.id] }, w.c1.account)
      .expect(200);
    expect(h.dataOf<{ results: unknown }>(response).results).toEqual([
      { requestId: sent.id, outcome: 'SKIPPED', reason: 'RECHECKED_RETURNED_TO_HEAD' },
    ]);
    expect(readRequest(await h.fetch(sent.id, w.e1.account).expect(200)).state).toBe('AWAITING_SPEND_SUBMISSION');
  });

  it('refuses the device plan before the Cost Center check, but submits internal K5', async () => {
    const department = await createDepartment(h.ctx, h.admin, {
      code: 'P-NO-CC',
      name: 'Department without a Cost Center',
      itAdminEmployeeId: w.it1.employeeId,
    });
    const bare = { ...department, unitId: '' };
    const employee = await h.staff(bare, 'REQ-NO-CC');
    await h.makeHead(bare, await h.staff(bare, 'REQ-NO-CC-HEAD'));
    const device = await h.submit(h.form(w.plans.k4DeviceKey), employee.account).expect(422);
    expect(h.codeOf(device)).toBe('ACCESS_REQUEST.PLAN_BOUND_TO_DEVICE');
    const paid = await h.submit(h.form(w.plans.miro, { termMonths: 1 }), employee.account).expect(409);
    expect(h.codeOf(paid)).toBe('FINANCE.SETUP_INCOMPLETE');
    expect(await h.sent(employee, w.plans.k5Internal)).toMatchObject({ branch: 'INTERNAL_FREE', costCenter: null });
  });
});
