import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { declareApplication, declarePlan, declareSubscription } from '../../support/builders/catalog.builder';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements, tablesOf } from '../../support/query-count';
import { type Department, type Person, RequestHarness } from '../../support/request-harness';

/**
 * a01-employee-catalog-selector: the catalog a person picks software from before the preview, read against real PostgreSQL. What
 * is offered and what each row says is judged as the preview judges it, so every case below that says "as the preview" asks the
 * preview too.
 */
const h = new RequestHarness();
const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };

interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
interface ApplicationRow {
  id: string;
  name: string;
  kind: 'SAAS' | 'LICENSED' | 'INTERNAL';
  vendorName: string | null;
  planCount: number;
  costsMoney: boolean;
  canSubmit: boolean;
  submitBlockedReason: string | null;
}
interface PlanRow {
  id: string;
  name: string;
  application: { id: string; name: string; kind: 'SAAS' | 'LICENSED' | 'INTERNAL' };
  costsMoney: boolean;
  price: { status: 'PRICED' | 'MISSING' | 'NOT_APPLICABLE'; missingReason: string | null };
  canSubmit: boolean;
  submitBlockedReason: string | null;
}
interface Software {
  applicationId: string;
  planId: string;
}

describe('the software a person may request (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let design: Department;
  let elsewhere: Department;
  let designer: Person;
  let outsider: Person;
  let manager: Person;
  let approver: Person;
  let saas: Software;
  let licensed: Software;
  let internal: Software;
  let unpriced: Software;
  let otherCycle: Software;
  let pricedElsewhere: Software;
  let retired: Software;
  let planless: string;

  /** A piece of software of the catalog with one plan, and the subscription each department in `pricedFor` buys it by. */
  const software = async (
    kind: 'SAAS' | 'LICENSED' | 'INTERNAL',
    name: string,
    pricedFor: Array<{ departmentId: string; cycle?: string }> = [],
  ): Promise<Software> => {
    const applicationId = await declareApplication(h.ctx, h.it1.accessToken, {
      name,
      kind,
      ...(kind === 'INTERNAL' ? {} : { vendorName: `${name} Vendor` }),
      dataSensitivity: 'MEDIUM',
      businessOwnerEmployeeId: h.businessOwner,
      communication: NO,
    });
    const planId = await declarePlan(h.ctx, h.it1.accessToken, {
      applicationId,
      name: `${name} Plan`,
      provisioningType: kind === 'INTERNAL' ? 'K5' : 'K1',
      ...(kind === 'INTERNAL' ? {} : { pricingModel: 'PER_SEAT', controlLevel: 'FULL' }),
    });
    for (const { departmentId, cycle } of pricedFor) {
      await declareSubscription(h.ctx, h.it1.accessToken, {
        ownerDepartmentId: departmentId,
        planId,
        kind: 'TERM',
        unitPrice: { amount: '1000000', currency: 'VND' },
        billingCycle: cycle ?? 'MONTHLY',
        startDate: '2026-01-05',
        purchasedQuantity: 10,
      });
    }

    return { applicationId, planId };
  };

  const call = (path: string, person: Person) => request(h.server()).get(path).set(h.as(person.account));
  const pageOf = async <T>(path: string, person: Person = designer) =>
    h.dataOf<{ items: T[]; pagination: Pagination }>(await call(path, person).expect(200));
  const plansFor = (person: Person, query: string) =>
    pageOf<PlanRow>(`/api/v1/requestable-plans?pageSize=100&${query}`, person);
  const planRow = async (person: Person, planId: string) =>
    h.dataOf<PlanRow>(await call(`/api/v1/requestable-plans/${planId}`, person).expect(200));

  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
    design = await h.departmentWithUnit('P-DES');
    elsewhere = await h.departmentWithUnit('P-MKT');
    const executive = await h.departmentWithUnit('P-EXE');
    const head = await h.staff(design, 'DES-H1');
    manager = head;
    designer = await h.staff(design, 'DES-E1');
    outsider = await h.staff(elsewhere, 'MKT-E1');
    const boss = await h.staff(executive, 'EXE-C1');
    await h.makeHead(design, head);
    await h.makeHead(executive, boss);
    await h.setRole('SPENDING_APPROVER', boss);
    approver = boss;

    saas = await software('SAAS', 'Sel Figma', [{ departmentId: design.id }]);
    licensed = await software('LICENSED', 'Sel Autodesk', [{ departmentId: design.id }]);
    internal = await software('INTERNAL', 'Sel Report Portal');
    unpriced = await software('SAAS', 'Sel Miro');
    otherCycle = await software('SAAS', 'Sel Notion', [{ departmentId: design.id, cycle: 'OTHER' }]);
    pricedElsewhere = await software('SAAS', 'Sel Slack', [{ departmentId: elsewhere.id }]);
    retired = await software('SAAS', 'Sel Retired', [{ departmentId: design.id }]);
    await h.ctx.sql.query(`UPDATE applications SET catalog_status = 'RETIRED', retired_at = now() WHERE id = $1`, [
      retired.applicationId,
    ]);
    planless = await declareApplication(h.ctx, h.it1.accessToken, {
      name: 'Sel Planless',
      kind: 'SAAS',
      vendorName: 'Sel Planless Vendor',
      dataSensitivity: 'LOW',
      businessOwnerEmployeeId: h.businessOwner,
      communication: NO,
    });
  }, 300000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  describe('what is offered', () => {
    it('offers paid SaaS, licensed and internal software, and hides the retired application and the one with no plan', async () => {
      const page = await pageOf<ApplicationRow>('/api/v1/requestable-applications?search=sel&pageSize=100');

      expect(page.items.map((row) => [row.name, row.kind, row.costsMoney, row.planCount])).toEqual([
        ['Sel Autodesk', 'LICENSED', true, 1],
        ['Sel Figma', 'SAAS', true, 1],
        ['Sel Miro', 'SAAS', true, 1],
        ['Sel Notion', 'SAAS', true, 1],
        ['Sel Report Portal', 'INTERNAL', false, 1],
        ['Sel Slack', 'SAAS', true, 1],
      ]);
      expect(page.pagination.totalItems).toBe(6);
    });

    it('hides every plan of a retired application, even asked for by its application', async () => {
      const byApplication = await plansFor(designer, `applicationId=${retired.applicationId}`);
      const bySearch = await plansFor(designer, 'search=retired');

      expect(byApplication.items).toEqual([]);
      expect(bySearch.items).toEqual([]);
    });

    it.each([
      ['the retired application', () => `/api/v1/requestable-applications/${retired.applicationId}`, 'APPLICATION'],
      ['an application with no plan', () => `/api/v1/requestable-applications/${planless}`, 'APPLICATION'],
      ['an application that does not exist', () => `/api/v1/requestable-applications/${randomUUID()}`, 'APPLICATION'],
      ['a plan of the retired application', () => `/api/v1/requestable-plans/${retired.planId}`, 'PLAN'],
      ['a plan that does not exist', () => `/api/v1/requestable-plans/${randomUUID()}`, 'PLAN'],
    ])('answers 404 for %s', async (_name, path, what) => {
      const response = await call(path(), designer).expect(404);

      expect(h.codeOf(response)).toBe(`REQUESTABLE_SOFTWARE.${what}_NOT_FOUND`);
    });

    it('refuses the retired plan in the preview too, and the missing one as the preview does', async () => {
      const refused = await h.previewRequest({ planId: retired.planId, termMonths: 6 }, designer.account).expect(409);
      const missing = await h.previewRequest({ planId: randomUUID(), termMonths: 6 }, designer.account).expect(404);

      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.APPLICATION_RETIRED');
      expect(h.codeOf(missing)).toBe('ACCESS_REQUEST.PLAN_NOT_FOUND');
    });

    it('answers the detail of an application and of a plan with the fields a requester may see', async () => {
      const application = h.dataOf<Record<string, unknown>>(
        await call(`/api/v1/requestable-applications/${licensed.applicationId}`, designer).expect(200),
      );
      const plan = h.dataOf<Record<string, unknown>>(
        await call(`/api/v1/requestable-plans/${licensed.planId}`, designer).expect(200),
      );

      expect(application).toEqual({
        id: licensed.applicationId,
        name: 'Sel Autodesk',
        kind: 'LICENSED',
        vendorName: 'Sel Autodesk Vendor',
        functionalGroup: null,
        planCount: 1,
        costsMoney: true,
        canSubmit: true,
        submitBlockedReason: null,
        dataSensitivity: 'MEDIUM',
      });
      expect(plan).toEqual({
        id: licensed.planId,
        name: 'Sel Autodesk Plan',
        provisioningType: 'K1',
        application: { id: licensed.applicationId, name: 'Sel Autodesk', kind: 'LICENSED' },
        costsMoney: true,
        price: { status: 'PRICED', missingReason: null },
        canSubmit: true,
        submitBlockedReason: null,
        vendorName: 'Sel Autodesk Vendor',
        sharingPolicy: null,
        dataLossOnRemoval: false,
      });
    });
  });

  describe('whether each plan can be priced and sent, as the preview judges it', () => {
    it.each([
      ['paid SaaS priced by the department', () => saas, 'PRICED', null],
      ['licensed software priced by the department', () => licensed, 'PRICED', null],
      ['internal software', () => internal, 'NOT_APPLICABLE', null],
      ['paid software nobody prices', () => unpriced, 'MISSING', 'NO_PRICED_SUBSCRIPTION'],
      ['paid software billed in a cycle that is not counted', () => otherCycle, 'MISSING', 'CYCLE_UNKNOWN'],
      ['paid software only another department prices', () => pricedElsewhere, 'MISSING', 'NO_PRICED_SUBSCRIPTION'],
    ])('%s', async (_name, which, status, missingReason) => {
      const row = await planRow(designer, which().planId);
      const preview = await h.previewed(designer, which().planId);

      expect(row.price).toEqual({ status, missingReason });
      expect(preview.pricing).toMatchObject({ status, missingReason });
      expect(row.canSubmit).toBe(true);
    });

    it('prices a plan by the department of the caller: the other department sees its own subscription', async () => {
      expect((await planRow(outsider, pricedElsewhere.planId)).price.status).toBe('PRICED');
      expect((await planRow(outsider, saas.planId)).price).toEqual({
        status: 'MISSING',
        missingReason: 'NO_PRICED_SUBSCRIPTION',
      });
    });

    it('lets a department with no Cost Center pick paid software but not send it, as the preview refuses it, and still send internal software', async () => {
      const bare = await h.departmentWithUnit('P-NCC');
      const newcomer = await h.staff(bare, 'NCC-E6');
      await h.ctx.sql.query(
        `UPDATE cost_centers SET status = 'INACTIVE', deactivated_at = now() WHERE department_id = $1`,
        [bare.id],
      );

      const rows = await plansFor(newcomer, 'search=sel');
      const paid = await h.previewRequest({ planId: saas.planId, termMonths: 6 }, newcomer.account).expect(409);
      const free = await h.previewed(newcomer, internal.planId);

      expect(rows.items.map((row) => [row.application.kind, row.canSubmit, row.submitBlockedReason])).toEqual([
        ['LICENSED', false, 'FINANCE_SETUP_INCOMPLETE'],
        ['SAAS', false, 'FINANCE_SETUP_INCOMPLETE'],
        ['SAAS', false, 'FINANCE_SETUP_INCOMPLETE'],
        ['SAAS', false, 'FINANCE_SETUP_INCOMPLETE'],
        ['INTERNAL', true, null],
        ['SAAS', false, 'FINANCE_SETUP_INCOMPLETE'],
      ]);
      expect(h.codeOf(paid)).toBe('FINANCE.SETUP_INCOMPLETE');
      expect(free.canSubmit).toBe(true);
      const application = h.dataOf<ApplicationRow>(
        await call(`/api/v1/requestable-applications/${saas.applicationId}`, newcomer).expect(200),
      );
      expect([application.canSubmit, application.submitBlockedReason]).toEqual([false, 'FINANCE_SETUP_INCOMPLETE']);
    });

    it('offers nothing to a person who belongs to no department, as the preview refuses them', async () => {
      const lonely = await h.staff(design, 'DES-LONELY');
      await h.ctx.sql.query(`DELETE FROM employee_placements WHERE employee_id = $1`, [lonely.employeeId]);

      for (const path of [
        '/api/v1/requestable-applications',
        `/api/v1/requestable-applications/${saas.applicationId}`,
        '/api/v1/requestable-plans',
        `/api/v1/requestable-plans/${saas.planId}`,
      ]) {
        const response = await call(path, lonely).expect(409);
        expect({ path, code: h.codeOf(response) }).toEqual({ path, code: 'REQUESTABLE_SOFTWARE.NO_DEPARTMENT' });
      }
      const preview = await h.previewRequest({ planId: saas.planId, termMonths: 6 }, lonely.account).expect(409);
      expect(h.codeOf(preview)).toBe('ACCESS_REQUEST.NO_DEPARTMENT');
    });
  });

  describe('search and pages', () => {
    it('finds an application by its name or its vendor, ignoring case and accents', async () => {
      const byName = await pageOf<ApplicationRow>('/api/v1/requestable-applications?search=S%C3%89L%20FIGMA');
      const byVendor = await pageOf<ApplicationRow>('/api/v1/requestable-applications?search=autodesk%20vendor');
      const byKind = await pageOf<ApplicationRow>('/api/v1/requestable-applications?search=sel&kind=INTERNAL');

      expect(byName.items.map((row) => row.id)).toEqual([saas.applicationId]);
      expect(byVendor.items.map((row) => row.id)).toEqual([licensed.applicationId]);
      expect(byKind.items.map((row) => row.id)).toEqual([internal.applicationId]);
    });

    it('finds a plan by its name or the name of its application, and lists the plans of one application', async () => {
      const byPlan = await plansFor(designer, 'search=miro%20plan');
      const byApplication = await plansFor(designer, 'search=sel%20notion');
      const ofOne = await plansFor(designer, `applicationId=${licensed.applicationId}`);
      const byKind = await plansFor(designer, 'search=sel&kind=LICENSED');

      expect(byPlan.items.map((row) => row.id)).toEqual([unpriced.planId]);
      expect(byApplication.items.map((row) => row.id)).toEqual([otherCycle.planId]);
      expect(ofOne.items.map((row) => row.id)).toEqual([licensed.planId]);
      expect(byKind.items.map((row) => row.id)).toEqual([licensed.planId]);
    });

    it('pages the plans by application then plan name, every one once, with the total of the same filter', async () => {
      const all = await plansFor(designer, 'search=sel');
      const seen: string[] = [];
      for (let page = 1; page <= 4; page += 1) {
        const slice = await pageOf<PlanRow>(`/api/v1/requestable-plans?search=sel&pageSize=2&page=${page}`);
        expect(slice.pagination).toEqual({ page, pageSize: 2, totalItems: 6, totalPages: 3 });
        seen.push(...slice.items.map((row) => row.id));
      }

      expect(all.items.map((row) => row.application.name)).toEqual([
        'Sel Autodesk',
        'Sel Figma',
        'Sel Miro',
        'Sel Notion',
        'Sel Report Portal',
        'Sel Slack',
      ]);
      expect(seen).toEqual(all.items.map((row) => row.id));
    });

    it('reads a fixed number of statements however many plans the page holds, and no table of seats, contracts or keys', async () => {
      const list = () =>
        counter.run(() => call('/api/v1/requestable-plans?search=bulk&pageSize=100', designer).expect(200));
      await software('SAAS', 'Bulk One', [{ departmentId: design.id }]);
      await software('INTERNAL', 'Bulk Two');
      const few = await list();
      for (let index = 0; index < 4; index += 1) {
        await software('SAAS', `Bulk Many ${index}`, [{ departmentId: design.id }]);
        await software('INTERNAL', `Bulk Free ${index}`);
      }
      const many = await list();

      expect(h.dataOf<{ items: unknown[] }>(many.result).items).toHaveLength(10);
      expect(dataStatements(many.statements)).toHaveLength(dataStatements(few.statements).length);
      const read = new Set(dataStatements(many.statements).flatMap(tablesOf));
      for (const hidden of [
        'license_assignments',
        'license_keys',
        'contracts',
        'document_attachments',
        'plan_workspace_profiles',
        'plan_terms',
        'application_business_owners',
      ]) {
        expect({ hidden, read: read.has(hidden) }).toEqual({ hidden, read: false });
      }
    }, 120000);
  });

  describe('who may read it', () => {
    it.each([
      ['an employee with no role', () => designer],
      ['an IT Admin of a department', () => ({ employeeId: '', account: h.it1 })],
      ['Finance of a department', () => ({ employeeId: '', account: h.finance })],
      ['a Manager (head of a department)', () => manager],
      ['the Spending Approver', () => approver],
    ])('lets %s read the list', async (_name, who) => {
      await call('/api/v1/requestable-applications', who()).expect(200);
    });

    it('turns away a caller without a token or with a token that is not one', async () => {
      const none = await request(h.server()).get('/api/v1/requestable-plans').expect(401);
      const bad = await request(h.server())
        .get('/api/v1/requestable-plans')
        .set('Authorization', 'Bearer not-a-token')
        .expect(401);

      expect(h.codeOf(none)).toBe('AUTHENTICATION_REQUIRED');
      expect(h.codeOf(bad)).toBe('INVALID_ACCESS_TOKEN');
    });
  });

  describe('from the catalog to a request, through the routes that already exist', () => {
    it.each([
      ['paid SaaS', () => saas, 'PAID_IN_CATALOG', 'PRICED'],
      ['licensed software', () => licensed, 'PAID_IN_CATALOG', 'PRICED'],
      ['internal software', () => internal, 'INTERNAL_FREE', 'NOT_APPLICABLE'],
    ])('%s: list, detail, preview, then send', async (_name, which, branch, pricing) => {
      const { applicationId, planId } = which();
      const applications = await pageOf<ApplicationRow>('/api/v1/requestable-applications?search=sel&pageSize=100');
      const picked = applications.items.find((row) => row.id === applicationId);
      expect(picked?.canSubmit).toBe(true);
      const plans = await plansFor(designer, `applicationId=${picked?.id ?? ''}`);
      const plan = await planRow(designer, plans.items[0].id);

      const preview = await h.previewed(designer, plan.id);
      const sent = await h.sent(designer, plan.id);

      expect(plan.id).toBe(planId);
      expect(preview).toMatchObject({ branch, canSubmit: true, pricing: { status: pricing } });
      expect(sent).toMatchObject({ branch, plan: { planId, applicationId }, pricing: { status: pricing } });
    });
  });
});
