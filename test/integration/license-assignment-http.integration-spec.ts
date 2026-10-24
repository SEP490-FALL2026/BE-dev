import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { OrganizationService } from '../../src/modules/organization/organization.service';
import { AssignmentWire, SeatHarness } from '../support/seat-baseline-harness';

const h = new SeatHarness();

describe('license assignments over HTTP (integration, real PostgreSQL)', () => {
  let organization: OrganizationService;
  const today = (day: string) => jest.spyOn(organization, 'businessToday').mockResolvedValue(day);

  beforeAll(async () => {
    await h.start();
    organization = h.ctx.app.get(OrganizationService, { strict: false });
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
  const change = (id: string, body: object, account = h.it1) =>
    request(h.server()).post(`/api/v1/license-assignments/${id}/responsible-changes`).set(h.as(account)).send(body);

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
      await h.written({ subscriptionId }, [row('LST0'), row('LST1'), bot('LST2', 'lst-bot')]);

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

  describe('AC-7: a service account', () => {
    it('is held by the person responsible, owned by their department and charged to its Unit, and makes no new employee', async () => {
      today('2026-10-01');
      const subscriptionId = await h.subscription(10);
      const unit = await h.ownUnit();
      const holder = await h.person('SVC1');
      const employees = await h.count('employees');

      await h.written({ subscriptionId }, [bot('SVC1', 'ci-bot')]);

      expect(await h.count('employees')).toBe(employees);
      expect(await h.assignmentsOf({ subscriptionId })).toEqual([
        expect.objectContaining({
          kind: 'SERVICE',
          employeeId: holder,
          accountIdentifier: 'ci-bot',
          reason: 'CI pipeline',
          costCenterId: unit.id,
          owningDepartmentId: unit.departmentId,
        }),
      ]);
    });

    it('refuses a service row without a reason, with an unknown Cost Center, with one that is not the owning Unit, or without a department', async () => {
      const subscriptionId = await h.subscription(10);
      const other = await h.costCenter('UNIT');
      await h.crowd('SVR', 5);
      await h.ctx.sql.query(
        `DELETE FROM employee_placements WHERE employee_id = (SELECT id FROM employees WHERE employee_code = 'SVR3')`,
      );
      const unit = await h.ownUnit();
      const own = (await h.ctx.sql.query<{ code: string }>(`SELECT code FROM cost_centers WHERE id = $1`, [unit.id]))
        .rows[0].code;

      const preview = await h.preview({ subscriptionId }, [
        bot('SVR0', 'bot-a', { reason: '' }),
        bot('SVR1', 'bot-b', { cost_center_code: 'CC-NONE-9' }),
        bot('SVR2', 'bot-c', { cost_center_code: other.code }),
        bot('SVR3', 'bot-d'),
        bot('SVR4', 'bot-e', { cost_center_code: own }),
      ]);

      expect(preview.summary).toMatchObject({
        valid: 1,
        byCode: {
          REASON_REQUIRED: 1,
          COST_CENTER_NOT_FOUND: 1,
          COST_CENTER_NOT_OWNING_UNIT: 1,
          OWNING_DEPARTMENT_NOT_FOUND: 1,
        },
      });
    });
  });

  describe('AC-10: a change of the person responsible for a service account', () => {
    it('ends the old assignment the day the new one begins, chains them, and keeps the seats taken at eight on every day', async () => {
      today('2026-10-01');
      const subscriptionId = await h.subscription(10);
      const unit = await h.ownUnit();
      await h.crowd('GIT', 7);
      const e2 = await h.person('GHE2');
      const e5 = await h.person('GHE5');
      await h.written({ subscriptionId }, [
        ...Array.from({ length: 7 }, (_, index) => row(`GIT${index}`)),
        bot('GHE2', 'ci-bot'),
      ]);
      const original = (await h.assignmentsOf({ subscriptionId, kind: 'SERVICE' }))[0];
      expect(original.employeeId).toBe(e2);
      today('2026-10-10');

      const response = await change(original.id, { employeeId: e5, effectiveFrom: '2026-10-15' }).expect(200);
      const { ended, created } = h.dataOf<{ ended: AssignmentWire; created: AssignmentWire }>(response);

      expect(ended).toMatchObject({ id: original.id, employeeId: e2, validUntil: '2026-10-15' });
      expect(created).toMatchObject({
        source: 'HANDOVER',
        kind: 'SERVICE',
        employeeId: e5,
        accountIdentifier: 'ci-bot',
        reason: 'CI pipeline',
        costCenterId: unit.id,
        owningDepartmentId: unit.departmentId,
        effectiveFrom: '2026-10-15',
        effectiveFromBasis: 'ACTUAL',
        grantedOn: '2026-10-15',
        validUntil: null,
        predecessorId: original.id,
      });
      for (const day of ['2026-10-10', '2026-10-14', '2026-10-15', '2026-10-20']) {
        today(day);
        expect(h.dataOf<{ occupied: number }>(await h.seatUsage(subscriptionId).expect(200)).occupied).toBe(8);
      }

      const events = await h.ctx.sql.query<{
        action: string;
        resource_id: string;
        before: unknown;
        after: Record<string, unknown>;
      }>(
        `SELECT action, resource_id, before, after FROM audit_events
          WHERE resource_id = ANY($1) AND action IN ('LICENSE_ASSIGNMENT.ENDED', 'LICENSE_ASSIGNMENT.CREATED') ORDER BY occurred_at, id`,
        [[original.id, created.id]],
      );
      // Events written in one transaction share a millisecond more often than not, and `ORDER BY occurred_at, id` then
      // follows the random id, not the order of writing (P28-02): each event is picked by what it is
      // and what it is about.
      expect(events.rows.map((event) => `${event.action} ${event.resource_id}`).sort()).toEqual(
        [
          `LICENSE_ASSIGNMENT.CREATED ${original.id}`,
          `LICENSE_ASSIGNMENT.ENDED ${original.id}`,
          `LICENSE_ASSIGNMENT.CREATED ${created.id}`,
        ].sort(),
      );
      const endedEvent = events.rows.find(
        (event) => event.action === 'LICENSE_ASSIGNMENT.ENDED' && event.resource_id === original.id,
      );
      expect(endedEvent).toMatchObject({
        before: { validUntil: null },
        after: { validUntil: '2026-10-15', successorId: created.id },
      });
      const successor = events.rows.find(
        (event) => event.action === 'LICENSE_ASSIGNMENT.CREATED' && event.resource_id === created.id,
      );
      expect(successor?.after).toMatchObject({ source: 'HANDOVER', predecessorId: original.id });
      expect(JSON.stringify(events.rows)).not.toContain('ci-bot');
    });

    it('works when every seat is taken, because the count does not change on any day', async () => {
      today('2026-10-01');
      const subscriptionId = await h.subscription(1);
      await h.person('FUL1');
      const next = await h.person('FUL2');
      await h.written({ subscriptionId }, [bot('FUL1', 'only-bot')]);
      const original = (await h.assignmentsOf({ subscriptionId }))[0];

      const response = await change(original.id, { employeeId: next, effectiveFrom: '2026-10-08' }).expect(200);

      expect(h.dataOf<{ created: AssignmentWire }>(response).created.employeeId).toBe(next);
      today('2026-10-08');
      expect(h.dataOf<{ occupied: number; free: number }>(await h.seatUsage(subscriptionId).expect(200))).toMatchObject(
        { occupied: 1, free: 0 },
      );
    });

    it('refuses a personal seat, an assignment that has ended, a day that is not after the start or is in the past', async () => {
      today('2026-10-01');
      const subscriptionId = await h.subscription(10);
      await h.person('REF1');
      await h.person('REF2');
      const next = await h.person('REF3');
      await h.written({ subscriptionId }, [row('REF1'), bot('REF2', 'ref-bot')]);
      const [personal, service] = [
        (await h.assignmentsOf({ subscriptionId, kind: 'PERSONAL' }))[0],
        (await h.assignmentsOf({ subscriptionId, kind: 'SERVICE' }))[0],
      ];
      today('2026-10-10');

      expect(h.codeOf(await change(personal.id, { employeeId: next, effectiveFrom: '2026-10-15' }).expect(422))).toBe(
        'LICENSE_ASSIGNMENT.NOT_SERVICE_ACCOUNT',
      );
      expect(
        h.detailsOf(await change(service.id, { employeeId: next, effectiveFrom: '2026-10-01' }).expect(422)),
      ).toEqual({ problem: 'NOT_AFTER_START' });
      expect(
        h.detailsOf(await change(service.id, { employeeId: next, effectiveFrom: '2026-10-05' }).expect(422)),
      ).toEqual({ problem: 'IN_THE_PAST' });
      await change(service.id, { employeeId: next, effectiveFrom: '2026-10-15' }).expect(200);
      expect(h.codeOf(await change(service.id, { employeeId: next, effectiveFrom: '2026-10-20' }).expect(409))).toBe(
        'LICENSE_ASSIGNMENT.NOT_OPEN',
      );
      expect(h.codeOf(await change(randomUUID(), { employeeId: next, effectiveFrom: '2026-10-20' }).expect(404))).toBe(
        'LICENSE_ASSIGNMENT.NOT_FOUND',
      );
    });

    it('refuses a person who has left, one who does not exist, the person already responsible, and an intern without an end date', async () => {
      today('2026-10-01');
      const subscriptionId = await h.subscription(10);
      const holder = await h.person('REG1');
      const left = await h.person('REG2');
      const intern = await h.person('REG3', 'INTERN');
      await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [left]);
      await h.written({ subscriptionId }, [bot('REG1', 'reg-bot')]);
      const service = (await h.assignmentsOf({ subscriptionId }))[0];
      const body = (employeeId: string, extra: object = {}) => ({ employeeId, effectiveFrom: '2026-10-15', ...extra });

      expect(h.detailsOf(await change(service.id, body(left)).expect(422))).toEqual({ problem: 'NOT_ACTIVE' });
      expect(h.detailsOf(await change(service.id, body(randomUUID())).expect(422))).toEqual({ problem: 'NOT_FOUND' });
      expect(h.detailsOf(await change(service.id, body(holder)).expect(422))).toEqual({ problem: 'SAME_PERSON' });
      expect(h.codeOf(await change(service.id, body(intern)).expect(422))).toBe(
        'LICENSE_ASSIGNMENT.EXPECTED_END_REQUIRED',
      );
      expect((await change(service.id, body(intern, { expectedEndDate: '2027-03-31' })).expect(200)).status).toBe(200);
      expect(h.codeOf(await change(service.id, { employeeId: intern, effectiveFrom: 'soon' }).expect(422))).toBe(
        'VALIDATION_ERROR',
      );
    });

    it('leaves everything as it was when the change is refused', async () => {
      today('2026-10-01');
      const subscriptionId = await h.subscription(10);
      await h.person('NOC1');
      await h.written({ subscriptionId }, [bot('NOC1', 'noc-bot')]);
      const service = (await h.assignmentsOf({ subscriptionId }))[0];
      const before = await h.count('license_assignments');

      await change(service.id, { employeeId: randomUUID(), effectiveFrom: '2026-10-15' }).expect(422);

      expect(await h.count('license_assignments')).toBe(before);
      expect((await h.assignmentsOf({ subscriptionId }))[0].validUntil).toBeNull();
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
          name: 'change',
          method: 'post',
          path: `/api/v1/license-assignments/${randomUUID()}/responsible-changes`,
          body: { employeeId: randomUUID(), effectiveFrom: '2026-10-15' },
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
