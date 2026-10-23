import request from 'supertest';
import { ApiAccount, adminToken, createActivatedAccount } from '../support/api-accounts';
import {
  HttpTestApp,
  SeededInstallation,
  createHttpTestApp,
  insertEmployeeFixture,
  seedInstallation,
} from '../support/http-test-app';

interface LineWire {
  costCenterId: string;
  costCenterCode: string;
  costCenterName: string;
  costCenterKind: string;
  ratioPercent: string;
}

interface AllocationWire {
  version: number;
  lines: LineWire[];
  totalPercent: string;
  declaredBy: string;
  declaredAt: string;
}

interface ViewWire {
  subscriptionId: string;
  applicability: string;
  status: string;
  allocation: AllocationWire | null;
}

const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('subscription cost allocations over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let admin: string;
  let it1: ApiAccount;
  let finance: ApiAccount;
  let employee: ApiAccount;
  let businessOwner: string;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

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
    employee = await createActivatedAccount(ctx, seed, { code: 'E-EMP', email: 'emp@acme.vn', roles: [], admin });
    businessOwner = (await insertEmployeeFixture(ctx.app, seed, { code: 'E-OWN', email: 'owner@acme.vn' })).employeeId;
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  const unique = (prefix: string): string => `${prefix}-${(counter += 1)}`;
  const dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;
  const codeOf = (response: request.Response): string => (response.body as { error: { code: string } }).error.code;
  const detailsOf = (response: request.Response) =>
    (response.body as { error: { details: Record<string, unknown> } }).error.details;
  const n = async (table: string): Promise<number> =>
    (await ctx.sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
  const auditOf = async (resourceId: string) =>
    (
      await ctx.sql.query<{ action: string; before: unknown; after: unknown; actor_roles: string[] }>(
        "SELECT action, before, after, actor_roles FROM audit_events WHERE resource_id = $1 AND resource_type = 'SubscriptionCostAllocation' ORDER BY occurred_at, id",
        [resourceId],
      )
    ).rows;

  /** A Cost Center made the way Finance makes one. */
  const costCenter = async (kind: 'UNIT' = 'UNIT', code = unique('CC')): Promise<{ id: string; code: string }> =>
    dataOf<{ id: string; code: string }>(
      await request(server())
        .post('/api/v1/cost-centers')
        .set(as(finance))
        .send({ code, name: `Name of ${code}`, kind })
        .expect(201),
    );
  /** A subscription of a new application whose plan is billed as `pricing`, as the catalog makes one. */
  const subscription = async (pricing = 'FLAT_RATE', extra: object = {}): Promise<string> => {
    const application = dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/applications')
        .set(as(it1))
        .send({
          name: unique('Confluence'),
          kind: 'SAAS',
          vendorName: unique('Atlassian'),
          dataSensitivity: 'LOW',
          businessOwnerEmployeeId: businessOwner,
          communication: NO,
        })
        .expect(201),
    );
    const plan = dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/plans')
        .set(as(it1))
        .send({
          applicationId: application.id,
          name: unique('Plan'),
          provisioningType: 'K2',
          pricingModel: pricing,
          controlLevel: 'FULL',
        })
        .expect(201),
    );

    return dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/subscriptions')
        .set(as(it1))
        .send({ planId: plan.id, kind: 'TERM', ...extra })
        .expect(201),
    ).id;
  };
  const put = (id: string, lines: object[], account: ApiAccount = finance) =>
    request(server()).put(`/api/v1/subscriptions/${id}/cost-allocation`).set(as(account)).send({ lines });
  const get = (id: string, account: ApiAccount = finance) =>
    request(server()).get(`/api/v1/subscriptions/${id}/cost-allocation`).set(as(account));
  const history = (id: string, account: ApiAccount = finance) =>
    request(server()).get(`/api/v1/subscriptions/${id}/cost-allocation/history`).set(as(account));
  const share = (costCenterId: string, ratioPercent: string) => ({ costCenterId, ratioPercent });
  const declared = async (id: string, lines: object[]): Promise<AllocationWire> =>
    dataOf<{ allocation: AllocationWire }>(await put(id, lines).expect(200)).allocation;
  const currentOf = async (id: string): Promise<AllocationWire | null> =>
    dataOf<ViewWire>(await get(id).expect(200)).allocation;

  describe('declaring an allocation (AC-1)', () => {
    it('AC-1: Confluence flat rate, 60% to CC-A and 40% to CC-B: it is saved and read back with the Cost Centers named', async () => {
      const id = await subscription('FLAT_RATE');
      const a = await costCenter('UNIT', unique('CC-A'));
      const b = await costCenter('UNIT', unique('CC-B'));

      const response = await put(id, [share(a.id, '60'), share(b.id, '40')]).expect(200);

      expect(dataOf<{ changed: boolean }>(response).changed).toBe(true);
      const saved = dataOf<{ allocation: AllocationWire }>(response).allocation;
      expect(saved).toMatchObject({ version: 1, totalPercent: '100', declaredBy: finance.appUserId });
      expect(saved.lines.map((line) => [line.costCenterCode, line.ratioPercent, line.costCenterKind])).toEqual(
        [
          [a.code, '60', 'UNIT'],
          [b.code, '40', 'UNIT'],
        ].sort((x, y) => x[0].localeCompare(y[0])),
      );
      expect(dataOf<ViewWire>(await get(id).expect(200))).toMatchObject({
        subscriptionId: id,
        applicability: 'APPLICABLE',
        status: 'DECLARED',
        allocation: { version: 1, totalPercent: '100' },
      });
    });

    it.each(['CONCURRENT', 'CONSUMPTION', 'PER_HOST'])('takes an allocation for a %s plan too', async (pricing) => {
      const id = await subscription(pricing);
      const a = await costCenter();

      expect((await declared(id, [share(a.id, '100')])).version).toBe(1);
    });

    it('takes a single line of 100% and a split in hundredths that adds up to 100%', async () => {
      const id = await subscription();
      const unit = await costCenter('UNIT');
      const second = await costCenter('UNIT');
      const third = await costCenter('UNIT');

      expect(
        (await declared(id, [share(unit.id, '70'), share(second.id, '30')])).lines
          .map((line) => line.costCenterKind)
          .sort(),
      ).toEqual(['UNIT', 'UNIT']);
      expect((await declared(id, [share(second.id, '100')])).lines).toHaveLength(1);
      expect(
        (await declared(id, [share(unit.id, '33.33'), share(second.id, '33.33'), share(third.id, '33.34')]))
          .totalPercent,
      ).toBe('100');
    });

    it('takes an allocation for a subscription that is still a draft', async () => {
      const id = await subscription('FLAT_RATE');
      const a = await costCenter();

      expect((await declared(id, [share(a.id, '100')])).version).toBe(1);
    });

    it('reads a subscription with no allocation as MISSING, with none, not as not found', async () => {
      const id = await subscription();

      expect(dataOf<ViewWire>(await get(id).expect(200))).toEqual({
        subscriptionId: id,
        applicability: 'APPLICABLE',
        status: 'MISSING',
        allocation: null,
      });
    });
  });

  describe('a total other than 100% (AC-2)', () => {
    it('AC-2: 60% and 30% is refused with the total, 90%, and the allocation already there stays', async () => {
      const id = await subscription();
      const a = await costCenter();
      const b = await costCenter();
      await declared(id, [share(a.id, '50'), share(b.id, '50')]);
      const versions = await n('subscription_cost_allocation_versions');
      const events = (await auditOf(id)).length;

      const response = await put(id, [share(a.id, '60'), share(b.id, '30')]).expect(422);

      expect(codeOf(response)).toBe('COST_ALLOCATION.TOTAL_NOT_100');
      expect(detailsOf(response)).toEqual({ totalPercent: '90' });
      expect(await currentOf(id)).toMatchObject({ version: 1, totalPercent: '100' });
      expect(await n('subscription_cost_allocation_versions')).toBe(versions);
      expect((await auditOf(id)).length).toBe(events);
    });

    it.each([
      ['33.33 three times', ['33.33', '33.33', '33.33'], '99.99'],
      ['60% and 50%', ['60', '50'], '110'],
      ['99.99% alone', ['99.99'], '99.99'],
    ])('refuses %s, and names the total %s found', async (_name, ratios, total) => {
      const id = await subscription();
      const centers = await Promise.all(ratios.map(() => costCenter()));

      const response = await put(
        id,
        ratios.map((ratio, index) => share(centers[index].id, ratio)),
      ).expect(422);

      expect(codeOf(response)).toBe('COST_ALLOCATION.TOTAL_NOT_100');
      expect(detailsOf(response)).toEqual({ totalPercent: total });
      expect(dataOf<ViewWire>(await get(id).expect(200)).status).toBe('MISSING');
    });
  });

  describe('who may declare (AC-5)', () => {
    it.each([
      ['an IT Admin', () => it1],
      ['an employee', () => employee],
    ])('AC-5: refuses %s the declaration with 403 and leaves the allocation as it was', async (_name, who) => {
      const id = await subscription();
      const a = await costCenter();
      await declared(id, [share(a.id, '100')]);
      const versions = await n('subscription_cost_allocation_versions');

      const response = await put(id, [share(a.id, '100')], who()).expect(403);

      expect(codeOf(response)).toBe('AUTHORIZATION.FORBIDDEN');
      expect(await n('subscription_cost_allocation_versions')).toBe(versions);
    });

    it('refuses the Super Admin, who never does business work (SoD-1)', async () => {
      const id = await subscription();
      const a = await costCenter();

      const response = await request(server())
        .put(`/api/v1/subscriptions/${id}/cost-allocation`)
        .set({ Authorization: `Bearer ${admin}` })
        .send({ lines: [share(a.id, '100')] })
        .expect(403);

      expect(codeOf(response)).toBe('AUTHORIZATION.FORBIDDEN');
      expect(await currentOf(id)).toBeNull();
    });

    it('lets the IT Admin read the allocation and its history, and refuses an employee', async () => {
      const id = await subscription();
      const a = await costCenter();
      await declared(id, [share(a.id, '100')]);

      expect(dataOf<ViewWire>(await get(id, it1).expect(200)).status).toBe('DECLARED');
      await history(id, it1).expect(200);
      expect(codeOf(await get(id, employee).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
      expect(codeOf(await history(id, employee).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
    });
  });

  describe('which subscriptions take an allocation (AC-3 precondition, QĐ-49g)', () => {
    it('refuses a per-seat subscription with 409: its cost follows the people who hold the seats, no ratio is asked', async () => {
      const id = await subscription('PER_SEAT');
      const a = await costCenter();
      const heads = await n('subscription_cost_allocations');

      const response = await put(id, [share(a.id, '100')]).expect(409);

      expect(codeOf(response)).toBe('SUBSCRIPTION.COST_ALLOCATION_NOT_APPLICABLE');
      expect(detailsOf(response)).toEqual({ reason: 'PER_SEAT' });
      expect(await n('subscription_cost_allocations')).toBe(heads);
      expect(dataOf<ViewWire>(await get(id).expect(200))).toMatchObject({
        applicability: 'PER_SEAT',
        status: 'MISSING',
        allocation: null,
      });
    });

    it('refuses a plan whose pricing model is not declared (a K3 plan has none), which may be per seat for all anyone knows', async () => {
      const id = await subscription('FLAT_RATE');
      await ctx.sql.query(
        `UPDATE plans SET provisioning_type = 'K3', pricing_model = NULL WHERE id = (SELECT plan_id FROM subscriptions WHERE id = $1)`,
        [id],
      );
      const a = await costCenter();

      const response = await put(id, [share(a.id, '100')]).expect(409);

      expect(codeOf(response)).toBe('SUBSCRIPTION.COST_ALLOCATION_NOT_APPLICABLE');
      expect(detailsOf(response)).toEqual({ reason: 'PRICING_MODEL_UNDECLARED' });
      expect(dataOf<ViewWire>(await get(id).expect(200)).applicability).toBe('PRICING_MODEL_UNDECLARED');
    });

    it('keeps an allocation that was declared before the plan became per seat, and says it no longer applies', async () => {
      const id = await subscription('FLAT_RATE');
      const a = await costCenter();
      await declared(id, [share(a.id, '100')]);
      await ctx.sql.query(
        `UPDATE plans SET pricing_model = 'PER_SEAT' WHERE id = (SELECT plan_id FROM subscriptions WHERE id = $1)`,
        [id],
      );

      expect(dataOf<ViewWire>(await get(id).expect(200))).toMatchObject({
        applicability: 'PER_SEAT',
        status: 'DECLARED',
        allocation: { version: 1 },
      });
    });

    it('answers 404 for a subscription that does not exist, for every operation', async () => {
      const missing = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
      const a = await costCenter();

      expect(codeOf(await get(missing).expect(404))).toBe('SUBSCRIPTION.NOT_FOUND');
      expect(codeOf(await put(missing, [share(a.id, '100')]).expect(404))).toBe('SUBSCRIPTION.NOT_FOUND');
      expect(codeOf(await history(missing).expect(404))).toBe('SUBSCRIPTION.NOT_FOUND');
    });
  });

  describe('what is refused before anything is written', () => {
    it.each(['0', '-1', '101', '33.333', 'abc', ''])('refuses the share %p with RATIO_INVALID', async (ratio) => {
      const id = await subscription();
      const a = await costCenter();
      const b = await costCenter();

      const response = await put(id, [share(a.id, ratio), share(b.id, '50')]).expect(422);

      expect(codeOf(response)).toBe('COST_ALLOCATION.RATIO_INVALID');
      expect(detailsOf(response)).toEqual({ costCenterId: a.id });
    });

    it('refuses no line and twenty-one lines with LINE_COUNT_INVALID', async () => {
      const id = await subscription();
      const a = await costCenter();
      const many = Array.from({ length: 21 }, () => share(a.id, '1'));

      expect(codeOf(await put(id, []).expect(422))).toBe('COST_ALLOCATION.LINE_COUNT_INVALID');
      expect(codeOf(await put(id, many).expect(422))).toBe('COST_ALLOCATION.LINE_COUNT_INVALID');
    });

    it('refuses a Cost Center twice with COST_CENTER_DUPLICATE', async () => {
      const id = await subscription();
      const a = await costCenter();

      const response = await put(id, [share(a.id, '60'), share(a.id, '40')]).expect(422);

      expect(codeOf(response)).toBe('COST_ALLOCATION.COST_CENTER_DUPLICATE');
      expect(detailsOf(response)).toEqual({ costCenterId: a.id });
    });

    it('refuses a Cost Center that does not exist, naming it', async () => {
      const id = await subscription();
      const a = await costCenter();
      const ghost = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d22';
      const heads = await n('subscription_cost_allocations');

      const response = await put(id, [share(a.id, '60'), share(ghost, '40')]).expect(422);

      expect(codeOf(response)).toBe('COST_ALLOCATION.COST_CENTER_NOT_FOUND');
      expect(detailsOf(response)).toEqual({ costCenterIds: [ghost] });
      expect(await currentOf(id)).toBeNull();
      expect(await n('subscription_cost_allocations')).toBe(heads);
    });

    it('refuses an inactive Cost Center, naming it, and leaves the allocation as it was', async () => {
      const id = await subscription();
      const a = await costCenter();
      const old = await costCenter();
      await declared(id, [share(a.id, '100')]);
      await request(server()).post(`/api/v1/cost-centers/${old.id}/deactivate`).set(as(finance)).expect(200);

      const response = await put(id, [share(a.id, '60'), share(old.id, '40')]).expect(422);

      expect(codeOf(response)).toBe('COST_ALLOCATION.COST_CENTER_INACTIVE');
      expect(detailsOf(response)).toEqual({ costCenterIds: [old.id] });
      expect(await currentOf(id)).toMatchObject({ version: 1 });
    });

    it.each([
      ['an id that is not a UUID', { lines: [{ costCenterId: 'CC-A', ratioPercent: '100' }] }],
      [
        'a share given as a JSON number',
        { lines: [{ costCenterId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d22', ratioPercent: 100 }] },
      ],
      ['no lines field', {}],
      ['a field that is not known', { lines: [], extra: true }],
    ])('refuses %s as a malformed request, 422 VALIDATION_ERROR', async (_name, body) => {
      const id = await subscription();

      const response = await request(server())
        .put(`/api/v1/subscriptions/${id}/cost-allocation`)
        .set(as(finance))
        .send(body)
        .expect(422);

      expect(codeOf(response)).toBe('VALIDATION_ERROR');
    });
  });

  describe('the history of an allocation', () => {
    it('records a change as a new version, keeps the old one, and audits the shares before and after', async () => {
      const id = await subscription();
      const a = await costCenter();
      const b = await costCenter();
      await declared(id, [share(a.id, '60'), share(b.id, '40')]);

      const response = await put(id, [share(a.id, '50'), share(b.id, '50')]).expect(200);

      expect(dataOf<{ changed: boolean }>(response).changed).toBe(true);
      const page = dataOf<{ items: AllocationWire[]; pagination: { totalItems: number } }>(
        await history(id).expect(200),
      );
      expect(page.pagination.totalItems).toBe(2);
      expect(page.items.map((item) => item.version)).toEqual([2, 1]);
      expect(page.items[1].lines.map((line) => line.ratioPercent).sort()).toEqual(['40', '60']);
      expect(page.items[0].lines.map((line) => line.ratioPercent)).toEqual(['50', '50']);

      const events = await auditOf(id);
      expect(events.map((event) => event.action)).toEqual(['COST_ALLOCATION.DECLARED', 'COST_ALLOCATION.DECLARED']);
      expect(events[0].before).toBeNull();
      expect(events[1].before).toMatchObject({ version: 1 });
      expect(JSON.stringify(events[1].before)).toContain(`${a.id}|60%`);
      expect(events[1].after).toMatchObject({ version: 2 });
      expect(JSON.stringify(events[1].after)).toContain(`${a.id}|50%`);
      expect(events[1].actor_roles).toEqual(['FINANCE']);
    });

    it('answers a declaration equal to the current one, in any order of lines, with changed false and records nothing', async () => {
      const id = await subscription();
      const a = await costCenter();
      const b = await costCenter();
      await declared(id, [share(a.id, '60'), share(b.id, '40')]);
      const events = (await auditOf(id)).length;

      const response = await put(id, [share(b.id, '40'), share(a.id, '60')]).expect(200);

      expect(dataOf<{ changed: boolean; allocation: AllocationWire }>(response)).toMatchObject({
        changed: false,
        allocation: { version: 1 },
      });
      expect((await auditOf(id)).length).toBe(events);
      expect(dataOf<{ pagination: { totalItems: number } }>(await history(id).expect(200)).pagination.totalItems).toBe(
        1,
      );
    });

    it('answers an unchanged declaration even when one of its Cost Centers has since become inactive', async () => {
      const id = await subscription();
      const a = await costCenter();
      const b = await costCenter();
      await declared(id, [share(a.id, '60'), share(b.id, '40')]);
      await request(server()).post(`/api/v1/cost-centers/${b.id}/deactivate`).set(as(finance)).expect(200);

      const response = await put(id, [share(a.id, '60'), share(b.id, '40')]).expect(200);

      expect(dataOf<{ changed: boolean }>(response).changed).toBe(false);
    });

    it('pages the history, newest first', async () => {
      const id = await subscription();
      const a = await costCenter();
      const b = await costCenter();
      await declared(id, [share(a.id, '100')]);
      await declared(id, [share(b.id, '100')]);
      await declared(id, [share(a.id, '100')]);

      const second = await request(server())
        .get(`/api/v1/subscriptions/${id}/cost-allocation/history`)
        .query({ page: 2, pageSize: 2 })
        .set(as(finance))
        .expect(200);

      expect(dataOf<{ items: AllocationWire[] }>(second).items.map((item) => item.version)).toEqual([1]);
      await request(server())
        .get(`/api/v1/subscriptions/${id}/cost-allocation/history`)
        .query({ pageSize: 101 })
        .set(as(finance))
        .expect(422);
    });
  });

  describe('two declarations at once, and a Cost Center made inactive meanwhile', () => {
    it('queues two different declarations: versions 1 and 2, never a unique violation', async () => {
      const id = await subscription();
      const a = await costCenter();
      const b = await costCenter();

      const responses = await Promise.all([
        put(id, [share(a.id, '100')]),
        put(id, [share(b.id, '100')]),
        put(id, [share(a.id, '50'), share(b.id, '50')]),
      ]);

      expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
      expect(
        responses.map((response) => dataOf<{ allocation: AllocationWire }>(response).allocation.version).sort(),
      ).toEqual([1, 2, 3]);
    });

    it('records one version for two identical declarations at once', async () => {
      const id = await subscription();
      const a = await costCenter();

      const responses = await Promise.all([put(id, [share(a.id, '100')]), put(id, [share(a.id, '100')])]);

      expect(responses.map((response) => dataOf<{ changed: boolean }>(response).changed).sort()).toEqual([false, true]);
      expect(dataOf<{ pagination: { totalItems: number } }>(await history(id).expect(200)).pagination.totalItems).toBe(
        1,
      );
    });

    it('never stores a Cost Center that is being made inactive: the save waits for it and then refuses it', async () => {
      const id = await subscription();
      const a = await costCenter();
      const old = await costCenter();
      await ctx.sql.query('BEGIN');
      let pending!: Promise<request.Response>;
      try {
        await ctx.sql.query(`SELECT id FROM cost_centers WHERE id = $1 FOR UPDATE`, [old.id]);
        await ctx.sql.query(`UPDATE cost_centers SET status = 'INACTIVE', deactivated_at = now() WHERE id = $1`, [
          old.id,
        ]);
        pending = put(id, [share(a.id, '60'), share(old.id, '40')]).then((response) => response);
        let settled = false;
        void pending.then(() => {
          settled = true;
        });
        await wait(400);
        expect(settled).toBe(false);
      } finally {
        await ctx.sql.query('COMMIT');
      }

      const response = await pending;
      expect(response.status).toBe(422);
      expect(codeOf(response)).toBe('COST_ALLOCATION.COST_CENTER_INACTIVE');
      expect(await currentOf(id)).toBeNull();
    });
  });

  describe('what the routes do not do', () => {
    it('has no route that deletes an allocation, or one that reports on it: 404', async () => {
      const id = await subscription();

      for (const [method, path] of [
        ['delete', `/api/v1/subscriptions/${id}/cost-allocation`],
        ['post', `/api/v1/subscriptions/${id}/cost-allocation`],
        ['get', `/api/v1/subscriptions/${id}/cost-allocation/report`],
      ] as const) {
        const response = await request(server())[method](path).set(as(finance)).expect(404);
        expect(codeOf(response)).toBe('HTTP_NOT_FOUND');
      }
    });

    it('changes no subscription, Cost Center or money table when it declares', async () => {
      const id = await subscription();
      const a = await costCenter();
      const before = [await n('subscriptions'), await n('cost_centers'), await n('exchange_rates')];

      await declared(id, [share(a.id, '100')]);

      expect([await n('subscriptions'), await n('cost_centers'), await n('exchange_rates')]).toEqual(before);
    });
  });
});
