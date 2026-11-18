import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { pretendBusinessToday } from '../../support/pretend-today';
import { AssignmentWire, SeatHarness } from '../../support/seat-baseline-harness';
import { legacyServiceAccount } from '../../support/legacy-service-account';

const h = new SeatHarness();

describe('license assignments over HTTP (integration, real PostgreSQL)', () => {
  const today = (day: string) => pretendBusinessToday(h.ctx.app, day);

  beforeAll(async () => {
    await h.start();
  }, 180000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await h.stop();
  });

  const row = (code: string, extra: Record<string, string> = {}) => ({
    employee_code: code,
    account_identifier: `${code.toLowerCase()}@acme.vn`,
    ...extra,
  });
  const bot = (code: string, identifier: string, extra: Record<string, string> = {}) => ({
    employee_code: code,
    account_identifier: identifier,
    kind: 'service',
    reason: 'CI pipeline',
    ...extra,
  });

  describe('AC-5: where an assignment came from', () => {
    it('tells a baseline assignment from one that came from a request or from a handover, and filters by source', async () => {
      today('2026-10-01');
      const subscriptionId = await h.subscription(10);
      const planId = (
        await h.ctx.sql.query<{ plan_id: string }>(`SELECT plan_id FROM subscriptions WHERE id = $1`, [subscriptionId])
      ).rows[0].plan_id;
      const baselineHolder = await h.person('SRC1');
      const requestHolder = await h.person('SRC2');
      await h.written({ subscriptionId }, [row('SRC1')]);
      await h.ctx.sql.query(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
           normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
         VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, $4, $5, 'src2@acme.vn', 'src2@acme.vn', '2026-10-05', 'ACTUAL', $6)`,
        [randomUUID(), h.seed.organizationId, planId, subscriptionId, requestHolder, randomUUID()],
      );

      const baseline = await h.assignmentsOf({ subscriptionId, source: 'BASELINE' });
      const requested = await h.assignmentsOf({ subscriptionId, source: 'REQUEST' });
      const all = await h.assignmentsOf({ subscriptionId });

      expect(baseline.map((assignment) => assignment.employeeId)).toEqual([baselineHolder]);
      expect(requested.map((assignment) => assignment.employeeId)).toEqual([requestHolder]);
      expect(all.map((assignment) => assignment.source).sort()).toEqual(['BASELINE', 'REQUEST']);
      expect(await h.assignmentsOf({ subscriptionId, source: 'HANDOVER' })).toEqual([]);
    });

    it('lists by person and kind, pages the list, and refuses a filter that is not valid', async () => {
      today('2026-10-01');
      const subscriptionId = await h.subscription(10);
      await h.crowd('LST', 3);
      await h.written({ subscriptionId }, [row('LST0'), row('LST1')]);
      // A service account of the earlier releases: nothing writes one any more, the list still shows it and filters by its kind.
      await legacyServiceAccount(h.ctx.sql, {
        subscriptionId,
        employeeId: (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM employees WHERE employee_code = 'LST2'`))
          .rows[0].id,
        identifier: 'lst-bot',
      });

      expect(await h.assignmentsOf({ subscriptionId, kind: 'SERVICE' })).toHaveLength(1);
      expect(await h.assignmentsOf({ subscriptionId, kind: 'PERSONAL' })).toHaveLength(2);
      const page = h.dataOf<{ items: AssignmentWire[]; pagination: { totalItems: number; totalPages: number } }>(
        await h.assignments({ subscriptionId, pageSize: 2, page: 2 }).expect(200),
      );
      expect(page.items).toHaveLength(1);
      expect(page.pagination).toMatchObject({ totalItems: 3, totalPages: 2 });
      expect(h.codeOf(await h.assignments({ source: 'EVERYTHING' }).expect(422))).toBe('VALIDATION_ERROR');
      expect(h.codeOf(await h.assignments({ pageSize: 101 }).expect(422))).toBe('VALIDATION_ERROR');
    });
  });

  describe('QĐ-110m: no service account any more', () => {
    it('refuses a row of the kind service with SERVICE_ACCOUNT_NOT_SUPPORTED, names the columns of a service account as ignored, and makes no assignment', async () => {
      const subscriptionId = await h.subscription(10);
      await h.person('SVC1');

      const preview = await h.preview({ subscriptionId }, [bot('SVC1', 'ci-bot')]);

      expect(preview.summary).toMatchObject({ valid: 0, byCode: { SERVICE_ACCOUNT_NOT_SUPPORTED: 1 } });
      expect(await h.assignmentsOf({ subscriptionId })).toEqual([]);
    });
  });

  describe('the seats of a subscription', () => {
    it('says the seats bought, taken and free, and null while the quantity is not known', async () => {
      today('2026-10-01');
      const subscriptionId = await h.subscription(3);
      await h.crowd('USE', 2);
      await h.written({ subscriptionId }, [row('USE0'), row('USE1')]);
      const unknown = await h.subscription(null);

      expect(h.dataOf(await h.seatUsage(subscriptionId).expect(200))).toEqual({
        subscriptionId,
        purchased: 3,
        occupied: 2,
        free: 1,
        asOf: '2026-10-01',
      });
      expect(h.dataOf(await h.seatUsage(unknown).expect(200))).toEqual({
        subscriptionId: unknown,
        purchased: null,
        occupied: 0,
        free: null,
        asOf: '2026-10-01',
      });
      expect(h.codeOf(await h.seatUsage(randomUUID()).expect(404))).toBe('SUBSCRIPTION.NOT_FOUND');
    });

    it('does not count an assignment that has not started or has ended', async () => {
      today('2026-10-01');
      const subscriptionId = await h.subscription(5);
      await h.person('DAY1');
      await h.person('DAY2');
      await h.written({ subscriptionId }, [row('DAY1', { granted_on: '2025-01-01' }), row('DAY2')]);

      today('2026-09-30');
      expect(h.dataOf<{ occupied: number }>(await h.seatUsage(subscriptionId).expect(200)).occupied).toBe(1);
      today('2026-10-02');
      expect(h.dataOf<{ occupied: number }>(await h.seatUsage(subscriptionId).expect(200)).occupied).toBe(2);
    });
  });

  describe('who may read and change assignments', () => {
    it('refuses Finance, an employee and the Super Admin on every route, and answers 401 without a token', async () => {
      const subscriptionId = await h.subscription(5);
      const routes = [
        { name: 'list', method: 'get', path: '/api/v1/license-assignments' },
        { name: 'seat usage', method: 'get', path: `/api/v1/subscriptions/${subscriptionId}/seat-usage` },
        { name: 'state', method: 'get', path: '/api/v1/seat-baseline' },
        { name: 'close', method: 'post', path: '/api/v1/seat-baseline/close' },
        {
          name: 'machine account',
          method: 'post',
          path: `/api/v1/license-assignments/${randomUUID()}/machine-account`,
          body: { isMachineAccount: false },
        },
      ] as const;

      for (const route of routes) {
        const call = (token?: string) => {
          const base = request(h.server())[route.method](route.path);

          return (token ? base.set({ Authorization: `Bearer ${token}` }) : base).send(
            'body' in route ? route.body : {},
          );
        };
        for (const token of [h.finance.accessToken, h.employee.accessToken, h.admin]) {
          expect({ name: route.name, code: h.codeOf(await call(token).expect(403)) }).toEqual({
            name: route.name,
            code: 'AUTHORIZATION.FORBIDDEN',
          });
        }
        expect({ name: route.name, code: h.codeOf(await call().expect(401)) }).toEqual({
          name: route.name,
          code: 'AUTHENTICATION_REQUIRED',
        });
      }
    });

    it('has no route that creates an assignment from nothing, changes or deletes one: 404', async () => {
      for (const [method, path] of [
        ['post', '/api/v1/license-assignments'],
        ['delete', `/api/v1/license-assignments/${randomUUID()}`],
        ['patch', `/api/v1/license-assignments/${randomUUID()}`],
        ['put', `/api/v1/license-assignments/${randomUUID()}`],
        ['delete', '/api/v1/seat-baseline'],
        ['post', '/api/v1/seat-baseline/reopen'],
      ] as const) {
        const response = await request(h.server())[method](path).set(h.as(h.it1)).send({}).expect(404);
        expect(h.codeOf(response)).toBe('HTTP_NOT_FOUND');
      }
    });
  });
});
