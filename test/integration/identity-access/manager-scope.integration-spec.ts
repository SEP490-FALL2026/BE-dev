import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import type { Person } from '../../support/request-harness';
import { SpendHarness, type Unit } from '../../support/spend-harness';

const h = new SpendHarness();

/**
 * `qd93-direct-manager-spending-approver-roles`, Task 10 (US-01-02 AC-3, US-01-01 AC-17; QĐ-93a): MANAGER is a granted role, but its
 * powers are the ones of a head: a person who holds the role and heads nothing today is refused every route of the Manager as a person
 * whose head period ended yesterday is, and a route open to several roles treats them as if they did not hold MANAGER. The routes are the
 * ones of `@RequireRoles('MANAGER')` in the controllers, one or more of each group; the department is a real one with a real head.
 */
describe('the scope of the Manager: MANAGER held, no department headed (integration, real PostgreSQL)', () => {
  let unit: Unit;
  /** Holds MANAGER and heads nothing: the person this file is about. */
  let holder: Person;
  /** Holds MANAGER, IT_ADMIN and heads nothing. */
  let holderWhoIsItAdmin: Person;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    unit = await h.departmentWithHead('P-MS1');
    holder = await h.staff(unit.department, 'MS-HOLD', ['MANAGER']);
    holderWhoIsItAdmin = await h.staff(unit.department, 'MS-HOLD-IT', ['MANAGER', 'IT_ADMIN']);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const call = (method: 'get' | 'post' | 'put', path: string, account: ApiAccount, body: object = {}) => {
    const sent = request(h.server())[method](path).set(h.as(account));

    return method === 'get' ? sent : sent.send(body);
  };
  const departmentId = () => unit.department.id;

  /** One call of each group of routes open to the Manager alone, and what it answers for somebody who is not one. */
  const MANAGER_ONLY: Array<[string, 'get' | 'post' | 'put', () => string]> = [
    ['the Manager dashboard', 'get', () => '/api/v1/dashboards/manager'],
    ['the budget of the department', 'get', () => '/api/v1/budgets/mine'],
    ['a budget proposal', 'post', () => '/api/v1/budget-proposals'],
    ['the queue of spend submission', 'get', () => '/api/v1/spend-queue'],
    ['a spend batch', 'post', () => '/api/v1/spend-batches'],
    ['a personnel notice', 'post', () => '/api/v1/personnel-notices'],
    ['the people of the department', 'get', () => `/api/v1/departments/${departmentId()}/employees`],
  ];

  describe('routes open to the Manager alone', () => {
    it.each(MANAGER_ONLY)(
      'refuses a MANAGER who heads nothing with 403 AUTHORIZATION.FORBIDDEN: %s',
      async (_group, method, path) => {
        const response = await call(method, path(), holder.account);

        expect([response.status, h.codeOf(response)]).toEqual([403, 'AUTHORIZATION.FORBIDDEN']);
      },
    );

    it.each(MANAGER_ONLY)(
      'lets the head through the same route, which proves the route and not the 403: %s',
      async (_group, method, path) => {
        const response = await call(method, path(), unit.head.account);

        // The head passes the guard: whatever the route answers (a list, a validation error), it is not the refusal of the role.
        expect(response.status).not.toBe(403);
      },
    );
  });

  describe('routes open to several roles', () => {
    it('treats a MANAGER who heads nothing as a person without MANAGER: the profile of a department opens only through the other role they hold', async () => {
      // Holding MANAGER only: no role that opens the profile of a department.
      const refused = await call('get', `/api/v1/departments/${departmentId()}`, holder.account);
      expect([refused.status, h.codeOf(refused)]).toEqual([403, 'AUTHORIZATION.FORBIDDEN']);

      // Holding IT_ADMIN as well: the IT Admin route opens, as it does for an IT Admin without MANAGER.
      const asItAdmin = await call('get', `/api/v1/departments/${departmentId()}`, holderWhoIsItAdmin.account);
      expect(asItAdmin.status).toBe(200);
    });

    it('opens the tools of a department to the IT Admin who also holds MANAGER, and to no MANAGER who heads nothing', async () => {
      const refused = await call('get', `/api/v1/departments/${departmentId()}/tools-in-use`, holder.account);
      expect([refused.status, h.codeOf(refused)]).toEqual([403, 'AUTHORIZATION.FORBIDDEN']);

      const asItAdmin = await call(
        'get',
        `/api/v1/departments/${departmentId()}/tools-in-use`,
        holderWhoIsItAdmin.account,
      );
      expect(asItAdmin.status).toBe(200);
    });

    it('opens the notices of the heads to the IT Admin who also holds MANAGER, and to no MANAGER who heads nothing', async () => {
      const refused = await call('get', '/api/v1/personnel-notices', holder.account);
      expect([refused.status, h.codeOf(refused)]).toEqual([403, 'AUTHORIZATION.FORBIDDEN']);

      const asItAdmin = await call('get', '/api/v1/personnel-notices', holderWhoIsItAdmin.account);
      expect(asItAdmin.status).toBe(200);
    });
  });

  describe('the queues and the routes of the employee', () => {
    it('gives a MANAGER who heads nothing an empty queue of need decisions, never a refusal and never another head’s requests', async () => {
      const member = await h.staff(unit.department, `MS-REQ-${(counter += 1)}`);
      await h.sent(member, await h.plan('K5'));

      const own = await call('get', '/api/v1/need-decisions', unit.head.account).expect(200);
      const response = await call('get', '/api/v1/need-decisions', holder.account).expect(200);

      expect(h.dataOf<{ items: unknown[] }>(own).items.length).toBeGreaterThan(0);
      expect(h.dataOf<{ items: unknown[] }>(response).items).toEqual([]);
    });

    it('refuses the route that is the Employee’s alone to a person who holds only MANAGER, head or not (US-01-01 AC-17)', async () => {
      const second = await h.departmentWithUnit(`P-MS${(counter += 1)}`);
      // Holds MANAGER only and heads the department from today.
      const only = await h.staff(second, `MS-ONLY-${counter}`, ['MANAGER']);
      await h.makeHead(second, only);

      const notHeading = await call('get', '/api/v1/me/software-rights', holder.account);
      const headingOnly = await call('get', '/api/v1/me/software-rights', only.account);

      expect([notHeading.status, h.codeOf(notHeading)]).toEqual([403, 'AUTHORIZATION.FORBIDDEN']);
      expect([headingOnly.status, h.codeOf(headingOnly)]).toEqual([403, 'AUTHORIZATION.FORBIDDEN']);
      // The same person does use the routes of the Manager once they head the department.
      expect((await call('get', '/api/v1/dashboards/manager', only.account)).status).toBe(200);
    });
  });
});
