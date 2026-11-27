import request from 'supertest';
import { Barrier } from '../../support/concurrency-harness';
import { buildActivatedAccount } from '../../support/builders/account.builder';
import { declareApplication, declarePlan } from '../../support/builders/catalog.builder';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();
const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };

const isDeadlock = (responseOrError: unknown): boolean => {
  if (typeof responseOrError === 'object' && responseOrError !== null) {
    const maybe = responseOrError as { code?: string; status?: number; body?: { error?: { code?: string } } };
    if (maybe.code === '40P01') return true;
    if (maybe.body?.error?.code === '40P01') return true;
  }

  return false;
};

/**
 * W3-14 (`QĐ-116ag`, `QĐ-104k`(3), N5): duplicate live `(workspaceId, planId)` is refused with 409 `SUBSCRIPTION.DUPLICATE_PLAN`
 * even while the seat baseline phase is open (no `SHOULD_MERGE`); two different workspaces for the same plan are allowed; concurrent
 * declarations or workspace moves take turns on the workspace lock (`FOR UPDATE`, tier 5b) with zero 40P01 deadlocks.
 */
describe('duplicate live subscription by (workspace, plan) and concurrency barrier (integration, real PostgreSQL)', () => {
  let appId: string;
  let vendorId: string;

  const makeWorkspace = async (name: string): Promise<string> => {
    const res = await request(h.server())
      .post('/api/v1/workspaces')
      .set(h.as(h.it1))
      .send({ vendorId, name })
      .expect(201);
    const ws = h.dataOf<{ id: string; updatedAt: string }>(res);
    const it2 = await buildActivatedAccount(h.ctx, h.seed, {
      code: h.unique('E-IT').replace(/\s+/g, ''),
      email: `${h.unique('it').replace(/\s+/g, '').toLowerCase()}@acme.vn`,
      role: 'IT_ADMIN',
    });
    await request(h.server())
      .put(`/api/v1/workspaces/${ws.id}/admins`)
      .set(h.as(h.it1))
      .send({
        admins: [
          { employeeId: h.it1.employeeId, role: 'OWNER' },
          { employeeId: it2.employeeId, role: 'ADMIN' },
        ],
        primaryOwnerEmployeeId: h.it1.employeeId,
        expectedUpdatedAt: ws.updatedAt,
      })
      .expect(200);

    return ws.id;
  };

  const makePlan = () =>
    declarePlan(h.ctx, h.it1.accessToken, {
      applicationId: appId,
      name: h.unique('Standard'),
      provisioningType: 'K2',
      pricingModel: 'PER_SEAT',
      controlLevel: 'FULL',
    });

  const post = (planId: string, workspaceId: string, extra: Record<string, unknown> = {}) =>
    request(h.server())
      .post('/api/v1/subscriptions')
      .set(h.as(h.it1))
      .send({
        planId,
        workspaceId,
        kind: 'TERM',
        unitPrice: { amount: '1000000', currency: 'VND' },
        billingCycle: 'MONTHLY',
        commitmentTermMonths: 1,
        startDate: '2026-01-05',
        purchasedQuantity: 5,
        ...extra,
      });

  const patchWorkspace = (id: string, workspaceId: string) =>
    request(h.server()).patch(`/api/v1/subscriptions/${id}`).set(h.as(h.it1)).send({ workspaceId });

  beforeAll(async () => {
    await h.start();
    appId = await declareApplication(h.ctx, h.it1.accessToken, {
      name: h.unique('Anthropic'),
      kind: 'SAAS',
      vendorName: h.unique('Anthropic'),
      dataSensitivity: 'LOW',
      communication: NO,
    });
    vendorId = (
      await h.ctx.sql.query<{ vendor_id: string }>(`SELECT vendor_id FROM applications WHERE id = $1`, [appId])
    ).rows[0].vendor_id;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('refuses a second live subscription in the same workspace even while baseline is open, emits no SHOULD_MERGE, and allows a second workspace', async () => {
    const wsA = await makeWorkspace(h.unique('Anthropic'));
    const wsB = await makeWorkspace(h.unique('Anthropic EU'));
    const planId = await makePlan();

    const first = await post(planId, wsA).expect(201);
    const firstView = h.dataOf<{ warnings: string[]; mergeCandidateIds: string[] }>(first);
    expect(firstView.warnings).not.toContain('SHOULD_MERGE');
    expect(firstView.mergeCandidateIds).toEqual([]);

    const duplicateSameWs = await post(planId, wsA).expect(409);
    expect(h.codeOf(duplicateSameWs)).toBe('SUBSCRIPTION.DUPLICATE_PLAN');

    const secondWs = await post(planId, wsB).expect(201);
    const secondView = h.dataOf<{ id: string; warnings: string[]; mergeCandidateIds: string[] }>(secondWs);
    expect(secondView.warnings).not.toContain('SHOULD_MERGE');
    expect(secondView.mergeCandidateIds).toEqual([]);

    const movedToDuplicate = await patchWorkspace(secondView.id, wsA).expect(409);
    expect(h.codeOf(movedToDuplicate)).toBe('SUBSCRIPTION.DUPLICATE_PLAN');
  });

  it('concurrent declare into the same workspace (barrier x20): one 201, one 409 SUBSCRIPTION.DUPLICATE_PLAN, zero 40P01', async () => {
    const ws = await makeWorkspace(h.unique('Concurrent Declare'));

    for (let i = 0; i < 20; i += 1) {
      const planId = await makePlan();
      const barrier = new Barrier(2);
      const a = (async () => {
        await barrier.wait();

        return post(planId, ws);
      })();
      const b = (async () => {
        await barrier.wait();

        return post(planId, ws);
      })();

      const results = await Promise.all([a, b]);
      expect(results.some(isDeadlock)).toBe(false);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const rejected = results.find((r) => r.status === 409) as request.Response;
      expect(h.codeOf(rejected)).toBe('SUBSCRIPTION.DUPLICATE_PLAN');
    }
  });

  it('concurrent subscriptionUpdate(workspaceId -> target) vs declare(target) (barrier x20): serialized, zero 40P01', async () => {
    const wsSrc = await makeWorkspace(h.unique('Move Src'));
    const wsDst = await makeWorkspace(h.unique('Move Dst'));

    for (let i = 0; i < 20; i += 1) {
      const planId = await makePlan();
      const movingId = h.dataOf<{ id: string }>(await post(planId, wsSrc).expect(201)).id;
      const barrier = new Barrier(2);

      const moveTask = (async () => {
        await barrier.wait();

        return patchWorkspace(movingId, wsDst);
      })();
      const declareTask = (async () => {
        await barrier.wait();

        return post(planId, wsDst);
      })();

      const [moveRes, declareRes] = await Promise.all([moveTask, declareTask]);
      expect(isDeadlock(moveRes) || isDeadlock(declareRes)).toBe(false);
      const pair = [moveRes.status, declareRes.status].sort().join(',');
      expect(['200,409', '201,409']).toContain(pair);
    }
  });
});
