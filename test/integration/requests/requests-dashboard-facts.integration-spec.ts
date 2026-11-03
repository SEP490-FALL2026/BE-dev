import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { GroupHarness } from '../../support/group-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';
import { RequestsDashboardApi } from '../../../src/modules/requests/public/requests-dashboard.api';

const h = new GroupHarness();
const M = 1_000_000;

interface PageWire {
  pagination: { totalItems: number };
}

describe('RequestsDashboardApi facts agree with source lists (integration, real PostgreSQL)', () => {
  let paid: string;
  let internal: string;
  let design: Unit;
  let engineering: Unit;
  let e1: Person;
  let api: RequestsDashboardApi;

  const myRequestsTotal = async (account: ApiAccount, view: 'open' | 'ended' = 'open'): Promise<number> => {
    const res = await request(h.server())
      .get('/api/v1/me/access-requests')
      .query({ view, pageSize: 1 })
      .set(h.as(account))
      .expect(200);
    return h.dataOf<PageWire>(res).pagination.totalItems;
  };

  const needDecisionsTotal = async (account: ApiAccount): Promise<number> => {
    const res = await request(h.server())
      .get('/api/v1/need-decisions')
      .query({ pageSize: 1 })
      .set(h.as(account))
      .expect(200);
    return h.dataOf<PageWire>(res).pagination.totalItems;
  };

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    api = h.ctx.app.get(RequestsDashboardApi);

    paid = await h.planOf(await h.subscription(100));
    internal = await h.plan('K5');
    design = await h.departmentWithHead('P-RDF1');
    engineering = await h.departmentWithHead('P-RDF2');
    e1 = await h.staff(design.department, 'RDF-E1', ['EMPLOYEE']);

    await h.budgetFor(design, { total: 100 * M, held: 20 * M, spent: 40 * M });
    await h.budgetFor(engineering, { total: 100 * M, held: 20 * M, spent: 40 * M });
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  describe('openRequestsSentBy', () => {
    it('returns 0 when employee has sent no requests, agreeing with meAccessRequestList?view=open', async () => {
      const listCount = await myRequestsTotal(e1.account, 'open');
      const count = await api.openRequestsSentBy({ employeeId: e1.employeeId, roles: ['EMPLOYEE'] });

      expect(count).toBe(0);
      expect(count).toBe(listCount);
    });

    it('counts open requests sent by employee, exactly matching meAccessRequestList?view=open (both > 0)', async () => {
      await h.sent(e1, internal);
      await h.sent(e1, paid, { termMonths: 1 });

      const listCount = await myRequestsTotal(e1.account, 'open');
      const count = await api.openRequestsSentBy({ employeeId: e1.employeeId, roles: ['EMPLOYEE'] });

      expect(count).toBe(2);
      expect(count).toBe(listCount);
    });

    it('returns null for Super Admin caller who sends no requests and is refused by meAccessRequestList', async () => {
      const count = await api.openRequestsSentBy({
        employeeId: h.seed.superAdmin.employeeId,
        roles: ['SUPER_ADMIN'],
      });

      expect(count).toBeNull();
    });
  });

  describe('needDecisionsHeldBy', () => {
    it('returns 0 when head holds no need decisions, agreeing with needDecisionList', async () => {
      const listCount = await needDecisionsTotal(engineering.head.account);
      const count = await api.needDecisionsHeldBy(engineering.head.employeeId);

      expect(count).toBe(0);
      expect(count).toBe(listCount);
    });

    it('counts need decisions held by the head, exactly matching needDecisionList (both > 0)', async () => {
      const listCount = await needDecisionsTotal(design.head.account);
      const count = await api.needDecisionsHeldBy(design.head.employeeId);

      expect(count).toBeGreaterThan(0);
      expect(count).toBe(listCount);
    });
  });
});
