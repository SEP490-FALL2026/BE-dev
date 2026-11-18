import request from 'supertest';
import { AccessRequestWire, Department, Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();

interface Page<T> {
  items: T[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}
interface DecisionWire {
  requestId: string;
  software: { name: string };
  requester: { employeeCode: string };
  department: { id: string; name: string };
  scope: 'FULL' | 'PLAN_ONLY';
  result: 'COMPLETED' | 'REJECTED';
  rejectionKind: string | null;
  reason: string | null;
  decidedBy: { employeeId: string };
  decidedAt: string;
}

/**
 * The queue of proposals by department, the count of what waits in each, and the list of what IT has decided (IN-1.3, R-20, D8): only the departments an IT
 * Admin reads, a department outside them is an empty answer and never an error. Real PostgreSQL.
 */
describe('requests: the assessment queue by department and the assessments decided (integration, real PostgreSQL)', () => {
  let design: Department;
  let sales: Department;
  let designHead: Person;
  let salesHead: Person;
  let itOfDesign: Person; // in charge of design
  let itOfSales: Person; // in charge of sales: out of the scope of the IT Admin of design
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    design = await h.departmentWithUnit('P-DES');
    sales = await h.departmentWithUnit('P-SAL');
    designHead = await h.staff(design, 'DES-H1');
    salesHead = await h.staff(sales, 'SAL-H1');
    itOfSales = await h.staff(sales, 'SAL-IT2', 'IT_ADMIN');
    itOfDesign = { employeeId: h.it1.employeeId, account: h.it1 };
    await h.makeHead(design, designHead);
    await h.makeHead(sales, salesHead);
    await h.setItAdminInCharge(design, itOfDesign);
    await h.setItAdminInCharge(sales, itOfSales);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A proposal of a person of the department whose need the head has approved: it waits for the IT Admin. */
  const waiting = async (
    department: Department,
    head: Person,
    extra: Record<string, unknown> = {},
  ): Promise<AccessRequestWire> => {
    counter += 1;
    const requester = await h.staff(department, `${department.code}-R${counter}`);
    const proposed = await h.proposed(requester, { softwareName: `Tool ${counter}`, ...extra });
    await h.decide(proposed.id, { decision: 'APPROVE' }, head.account).expect(200);

    return proposed;
  };
  const get = (path: string, query: Record<string, unknown>, account: Person['account']) =>
    request(h.server()).get(path).query(query).set(h.as(account));
  const pageOf = async <T>(
    path: string,
    query: Record<string, unknown>,
    account: Person['account'],
  ): Promise<Page<T>> => h.dataOf<Page<T>>(await get(path, query, account).expect(200));
  const queue = (query: Record<string, unknown>, account = itOfDesign.account) =>
    pageOf<{ requestId: string; department: { id: string } }>('/api/v1/assessment-queue', query, account);
  const counts = (query: Record<string, unknown>, account = itOfDesign.account) =>
    pageOf<{ department: { id: string; name: string }; waiting: number }>(
      '/api/v1/assessment-queue/departments',
      query,
      account,
    );
  const decisions = (query: Record<string, unknown>, account = itOfDesign.account) =>
    pageOf<DecisionWire>('/api/v1/assessment-decisions', query, account);

  describe('the queue filtered by department (R-20, D8)', () => {
    it('lists only the department asked for, and an empty page for one outside the scope of the caller', async () => {
      const inDesign = await waiting(design, designHead);
      const inSales = await waiting(sales, salesHead);

      const everything = await queue({}, itOfSales.account);
      const onlyDesign = await queue({ departmentId: design.id });
      const outside = await queue({ departmentId: sales.id });

      expect(onlyDesign.items.map((item) => item.requestId)).toContain(inDesign.id);
      expect(onlyDesign.items.every((item) => item.department.id === design.id)).toBe(true);
      expect(outside).toEqual({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
      expect(everything.items.map((item) => item.requestId)).toContain(inSales.id);
      expect(everything.items.map((item) => item.requestId)).not.toContain(inDesign.id);
    });

    it('is an empty page, not an error, for a department that does not exist', async () => {
      const none = await queue({ departmentId: '00000000-0000-4000-8000-000000000000' });

      expect(none.items).toEqual([]);
      expect(none.pagination.totalItems).toBe(0);
    });
  });

  describe('the count of what waits in each department', () => {
    it('counts the proposals of the departments the caller reads, the most first, and lists none that has nothing waiting', async () => {
      await waiting(design, designHead);
      await waiting(design, designHead);
      await waiting(sales, salesHead);

      const mine = await counts({});
      const theirs = await counts({}, itOfSales.account);
      const waitingInDesign = (await queue({ departmentId: design.id, pageSize: 100 })).pagination.totalItems;
      const waitingInSales = (await queue({ departmentId: sales.id, pageSize: 100 }, itOfSales.account)).pagination
        .totalItems;

      // The caller of design reads design (and the departments with nobody in charge), never sales.
      expect(mine.items.map((item) => item.department.id)).toContain(design.id);
      expect(mine.items.map((item) => item.department.id)).not.toContain(sales.id);
      expect(mine.items.find((item) => item.department.id === design.id)).toEqual({
        department: { id: design.id, name: `Department ${design.code}` },
        waiting: waitingInDesign,
      });
      expect(theirs.items.find((item) => item.department.id === sales.id)?.waiting).toBe(waitingInSales);
      expect(mine.items.map((item) => item.waiting)).toEqual(
        [...mine.items.map((item) => item.waiting)].sort((a, b) => b - a),
      );
      expect(mine.pagination.totalItems).toBe(mine.items.length);
    });

    it('drops a department when its last proposal is decided, and pages the departments', async () => {
      const lonely = await h.departmentWithUnit('P-LONE');
      const lonelyHead = await h.staff(lonely, 'LONE-H1');
      await h.makeHead(lonely, lonelyHead);
      await h.setItAdminInCharge(lonely, itOfDesign);
      const only = await waiting(lonely, lonelyHead);

      const before = await counts({ pageSize: 100 });
      await h
        .rejectAssessment(only.id, { kind: 'NOT_ELIGIBLE', reason: 'Not for the catalog' }, itOfDesign.account)
        .expect(200);
      const after = await counts({ pageSize: 100 });
      const firstPage = await counts({ pageSize: 1 });

      expect(before.items.find((item) => item.department.id === lonely.id)?.waiting).toBe(1);
      expect(after.items.map((item) => item.department.id)).not.toContain(lonely.id);
      expect(firstPage.items).toHaveLength(1);
      expect(firstPage.pagination.totalPages).toBe(after.pagination.totalItems);
    });
  });

  describe('the assessments IT has decided', () => {
    it('lists a completed and a refused assessment of the departments the caller reads, the newest decision first, with who decided and why', async () => {
      const completedFull = await waiting(design, designHead);
      await h.saveAssessment(completedFull.id, h.assessmentBody(), itOfDesign.account).expect(200);
      await h.completeAssessment(completedFull.id, itOfDesign.account).expect(200);
      const refused = await waiting(design, designHead);
      await h
        .rejectAssessment(
          refused.id,
          { kind: 'NOT_ELIGIBLE', reason: 'Keeps data outside the company' },
          itOfDesign.account,
        )
        .expect(200);

      const listed = await decisions({ departmentId: design.id });

      const refusedRow = listed.items.find((item) => item.requestId === refused.id);
      const completedRow = listed.items.find((item) => item.requestId === completedFull.id);
      expect(refusedRow).toMatchObject({
        result: 'REJECTED',
        rejectionKind: 'NOT_ELIGIBLE',
        reason: 'Keeps data outside the company',
        scope: 'FULL',
        department: { id: design.id },
        decidedBy: { employeeId: itOfDesign.employeeId },
      });
      expect(completedRow).toMatchObject({ result: 'COMPLETED', rejectionKind: null, reason: null, scope: 'FULL' });
      // Newest first: the refusal came after the completion.
      expect(listed.items.findIndex((item) => item.requestId === refused.id)).toBeLessThan(
        listed.items.findIndex((item) => item.requestId === completedFull.id),
      );
      const stamps = listed.items.map((item) => item.decidedAt);
      expect(stamps).toEqual([...stamps].sort().reverse());
      // What still waits for the assessment is not a decision.
      const pending = await waiting(design, designHead);
      expect(
        (await decisions({ departmentId: design.id, pageSize: 100 })).items.map((item) => item.requestId),
      ).not.toContain(pending.id);
    });

    it('says that only the plan was assessed for a short proposal', async () => {
      const planId = await h.plan('K1');
      const { rows } = await h.ctx.sql.query<{ application_id: string }>(
        `SELECT application_id FROM plans WHERE id = $1`,
        [planId],
      );
      const applicationId = rows[0].application_id;
      const short = await waiting(design, designHead, {
        existingApplicationId: applicationId,
        plannedPlanName: 'A plan nobody has made yet',
      });
      await h
        .saveAssessment(
          short.id,
          {
            provisioningType: 'K2',
            termsSummary: 'Annual terms',
            quote: {
              unitPrice: { amount: '200000', currency: 'VND' },
              billingCycle: 'MONTHLY',
              validFrom: '2026-01-01',
              validUntil: null,
            },
          },
          itOfDesign.account,
        )
        .expect(200);
      await h.completeAssessment(short.id, itOfDesign.account).expect(200);

      const listed = await decisions({ departmentId: design.id });

      expect(listed.items.find((item) => item.requestId === short.id)).toMatchObject({
        scope: 'PLAN_ONLY',
        result: 'COMPLETED',
      });
    });

    it('shows each IT Admin the departments of their scope only: a decision of sales is not read by the IT Admin of design', async () => {
      const decided = await waiting(sales, salesHead);
      await h
        .rejectAssessment(decided.id, { kind: 'NOT_ELIGIBLE', reason: 'Sales data' }, itOfSales.account)
        .expect(200);

      const mine = await decisions({ pageSize: 100 });
      const theirs = await decisions({ pageSize: 100 }, itOfSales.account);
      const forbidden = await decisions({ departmentId: sales.id });

      expect(mine.items.map((item) => item.requestId)).not.toContain(decided.id);
      expect(theirs.items.map((item) => item.requestId)).toContain(decided.id);
      expect(theirs.items.find((item) => item.requestId === decided.id)?.decidedBy.employeeId).toBe(
        itOfSales.employeeId,
      );
      expect(forbidden).toEqual({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
    });

    it('pages the decisions, the pages adding up to the whole and the total saying how many there are', async () => {
      const everything = await decisions({ pageSize: 100 });
      const total = everything.pagination.totalItems;
      expect(total).toBeGreaterThanOrEqual(2);

      const first = await decisions({ pageSize: 1, page: 1 });
      const second = await decisions({ pageSize: 1, page: 2 });

      expect(first.pagination).toEqual({ page: 1, pageSize: 1, totalItems: total, totalPages: total });
      expect(first.items.map((item) => item.requestId)).toEqual([everything.items[0].requestId]);
      expect(second.items.map((item) => item.requestId)).toEqual([everything.items[1].requestId]);
      expect((await decisions({ pageSize: 1, page: total + 1 })).items).toEqual([]);
    });
  });
});
