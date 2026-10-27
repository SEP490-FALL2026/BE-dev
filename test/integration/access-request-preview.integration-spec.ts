import request from 'supertest';
import { AccessRequestWire, Department, Person, RequestHarness } from '../support/request-harness';

const h = new RequestHarness();

describe('requests over HTTP: the preview before sending (integration, real PostgreSQL)', () => {
  let design: Department;
  let executive: Department;
  let headless: Department;
  let head: Person; // head of design
  let designer: Person;
  let boss: Person; // head of executive and the spending approver
  let fallback: Person; // the fallback approver, a member of the department with no head
  let newcomer: Person; // a member of the department with no head
  let internalPlan: string;
  let paidPlan: string; // 1 000 000 VND per seat per month, billed monthly
  let unpricedPlan: string;

  beforeAll(async () => {
    await h.start();
    design = await h.departmentWithUnit('P-DES');
    executive = await h.departmentWithUnit('P-EXE');
    headless = await h.departmentWithUnit('P-HR');
    head = await h.staff(design, 'DES-H1');
    designer = await h.staff(design, 'DES-E1');
    boss = await h.staff(executive, 'EXE-C1');
    fallback = await h.staff(headless, 'HR-R0');
    newcomer = await h.staff(headless, 'HR-E4');
    await h.makeHead(design, head);
    await h.makeHead(executive, boss);
    await h.setRole('SPENDING_APPROVER', boss);
    await h.setRole('FALLBACK_APPROVER', fallback);
    internalPlan = await h.plan('K5');
    paidPlan = await h.planOf(await h.subscription(10));
    unpricedPlan = await h.plan('K2');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const kinds = (preview: Awaited<ReturnType<typeof h.previewed>>) => preview.chain.map((step) => step.kind);

  describe('paid software that has a price (AC-1, AC-3)', () => {
    it('shows the amount, the chain with who holds each step, and the time of every step', async () => {
      const preview = await h.previewed(designer, paidPlan, { termMonths: 6 });

      expect(preview).toMatchObject({
        branch: 'PAID_IN_CATALOG',
        termMonths: 6,
        pricing: { status: 'PRICED', amount: { amount: '6000000', currency: 'VND' }, periodCount: 6 },
        spendSubmission: 'ALLOWED',
        canSubmit: true,
        totalExpectedWorkingDays: 8,
      });
      expect(
        preview.chain.map((step) => [step.kind, step.assignee?.employeeId ?? null, step.expectedWorkingDays]),
      ).toEqual([
        ['NEED', head.employeeId, 2],
        ['SPEND_SUBMISSION', head.employeeId, 2],
        ['SPEND_APPROVAL', boss.employeeId, 2],
        ['IT_EXECUTION', null, 2],
      ]);
    });

    it('never offers the chain of internal software that skips the spend: the free seat does not choose the chain', async () => {
      const subscription = await h.subscription(1);
      const exhausted = await h.planOf(subscription);
      await h.written({ subscriptionId: subscription }, [
        { employee_code: 'DES-H1', account_identifier: 'des-h1@acme.vn' },
      ]);

      const full = await h.previewed(designer, exhausted);
      const free = await h.previewed(designer, paidPlan);

      expect(kinds(full)).toEqual(kinds(free));
      expect(kinds(full)).toContain('SPEND_APPROVAL');
    });

    it('says that a Finance review may be added later, and shows no budget figure at all', async () => {
      const preview = await h.previewed(designer, paidPlan);

      expect(preview.possibleExtraSteps).toEqual([{ kind: 'FINANCE_REVIEW', beforeStep: 'SPEND_APPROVAL' }]);
      expect(Object.keys(preview).sort()).toEqual(
        [
          'plan',
          'branch',
          'termMonths',
          'projectLabel',
          'department',
          'costCenter',
          'requirements',
          'existingAccess',
          'canSubmit',
          'expectedSpendOn',
          'budgetYear',
          'pricing',
          'costEstimate',
          'spendSubmission',
          'chain',
          'possibleExtraSteps',
          'totalExpectedWorkingDays',
        ].sort(),
      );
    });
  });

  describe('internal software (AC-10)', () => {
    it('has no cost, no spend step and no seat count: the head, then the IT Admin by hand', async () => {
      const preview = await h.previewed(designer, internalPlan);

      expect(preview).toMatchObject({
        branch: 'INTERNAL_FREE',
        pricing: { status: 'NOT_APPLICABLE', amount: null },
        costEstimate: null,
        expectedSpendOn: null,
        budgetYear: null,
        spendSubmission: 'NOT_NEEDED',
        possibleExtraSteps: [],
      });
      expect(preview.chain.map((step) => [step.kind, step.assignee?.employeeId ?? null])).toEqual([
        ['NEED', head.employeeId],
        ['IT_EXECUTION', null],
      ]);
    });
  });

  describe('already holding the plan (AC-2)', () => {
    it('is shown with the seat that is held, and the request is then refused with the same seat', async () => {
      const held = await h.plan('K5');
      await h.hold('DES-E1', held);

      const preview = await h.previewed(designer, held);
      const rows = await h.requestRows();
      const refused = await h.submit(h.form(held), designer.account).expect(409);

      expect(preview.canSubmit).toBe(false);
      expect(preview.existingAccess).toMatchObject({ validUntil: null });
      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.ALREADY_HOLDS_ACCESS');
      expect(
        (refused.body as { error: { details: { assignment: { assignmentId: string } } } }).error.details.assignment
          .assignmentId,
      ).toBe(preview.existingAccess?.assignmentId);
      expect(await h.requestRows()).toBe(rows);
    });

    it('does not stop somebody else, or the same person asking for another plan', async () => {
      const held = await h.plan('K5');
      await h.hold('DES-E1', held);

      expect((await h.previewed(head, held)).existingAccess).toBeNull();
      expect((await h.previewed(designer, internalPlan)).existingAccess).toBeNull();
    });
  });

  describe('a term over twelve months (AC-4)', () => {
    it('says the head must confirm it, and adds no step to the chain', async () => {
      const long = await h.previewed(designer, paidPlan, { termMonths: 18 });
      const edge = await h.previewed(designer, paidPlan, { termMonths: 12 });
      const short = await h.previewed(designer, paidPlan, { termMonths: 6 });

      expect(long.requirements.termConfirmationByHead).toBe(true);
      expect(edge.requirements.termConfirmationByHead).toBe(false);
      expect(short.requirements.termConfirmationByHead).toBe(false);
      expect(kinds(long)).toEqual(kinds(short));
    });
  });

  describe('the routing table (AC-5)', () => {
    it.each([
      ['a head asking for themselves: the spending approver', () => head, () => boss, 'HEAD_ASKS_FOR_SELF'],
      [
        'the spending approver who heads a department: the fallback approver',
        () => boss,
        () => fallback,
        'HEAD_IS_THE_APPROVER',
      ],
      [
        'a member of a department with no head: the fallback approver, saying so',
        () => newcomer,
        () => fallback,
        'DEPARTMENT_HAS_NO_HEAD',
      ],
    ])('%s', async (_name, who, holder, explanation) => {
      const preview = await h.previewed(who(), paidPlan);
      const sent = await h.sent(who(), paidPlan);

      expect(preview.chain[0]).toMatchObject({
        kind: 'NEED',
        assignee: { employeeId: holder().employeeId },
        explanation,
      });
      expect(sent.needStep.assignee?.employeeId).toBe(holder().employeeId);
    });
  });

  describe('no standard toolset any more (QĐ-87h): the reason of the request is the one reason, and it is always required', () => {
    it('shows no flag about a toolset, asks only for the term to be confirmed, and refuses the old field as a malformed body', async () => {
      const preview = await h.previewed(designer, paidPlan);
      const rows = await h.requestRows();

      const old = await h.submit(h.form(paidPlan, { outsideStandardReason: 'The wiki is needed' }), designer.account);
      const bare = await h.submit(h.form(paidPlan, { businessReason: undefined }), designer.account);
      const sent = await h.sent(designer, paidPlan);

      expect(Object.keys(preview)).not.toContain('outsideStandard');
      expect(preview.requirements).toEqual({ termConfirmationByHead: false });
      expect([old.status, h.codeOf(old)]).toEqual([422, 'VALIDATION_ERROR']);
      expect([bare.status, h.codeOf(bare)]).toEqual([422, 'VALIDATION_ERROR']);
      expect(await h.requestRows()).toBe(rows + 1);
      expect(Object.keys(sent)).not.toContain('outsideStandard');
      expect(Object.keys(sent)).not.toContain('outsideStandardReason');
    });

    it('answers 404 to every route of the standard toolset, as to a route that does not exist', async () => {
      const department = design.id;
      const title = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
      const answers = await Promise.all([
        request(h.server()).get('/api/v1/standard-toolsets').set(h.as(designer.account)),
        request(h.server()).get('/api/v1/standard-toolsets/mine').set(h.as(designer.account)),
        request(h.server()).get(`/api/v1/standard-toolsets/${department}/${title}`).set(h.as(designer.account)),
        request(h.server()).put(`/api/v1/standard-toolsets/${department}/${title}`).set(h.as(h.it1)).send({}),
        request(h.server()).get(`/api/v1/standard-toolsets/${department}/${title}/history`).set(h.as(designer.account)),
      ]);

      expect(answers.map((answer) => answer.status)).toEqual([404, 404, 404, 404, 404]);
    });
  });

  describe('the Cost Center (AC-7)', () => {
    it('is the Unit of the department of the day, read only: neither a form field nor a project changes it', async () => {
      const preview = await h.previewed(designer, paidPlan, { projectLabel: 'Brand 2027' });
      const other = await h.previewed(designer, paidPlan, { projectLabel: 'Another project' });

      expect(preview.costCenter.id).toBe(design.unitId);
      expect(preview.projectLabel).toBe('Brand 2027');
      expect(other.costCenter).toEqual(preview.costCenter);
      expect(other.chain).toEqual(preview.chain);
      expect(
        h.codeOf(
          await h
            .previewRequest({ planId: paidPlan, termMonths: 6, costCenterId: executive.unitId }, designer.account)
            .expect(422),
        ),
      ).toBe('VALIDATION_ERROR');
    });
  });

  describe('software that is not in the catalog (AC-8)', () => {
    it('offers no plan to preview: a plan that does not exist is not found', async () => {
      const response = await h
        .previewRequest({ planId: '00000000-0000-4000-8000-000000000000', termMonths: 6 }, designer.account)
        .expect(404);

      expect(h.codeOf(response)).toBe('ACCESS_REQUEST.PLAN_NOT_FOUND');
    });
  });

  describe('the estimated tax (AC-9, AC-12)', () => {
    let plan: string;
    let vendor: { id: string; name: string };
    beforeAll(async () => {
      plan = await h.planOf(await h.subscription(10));
      vendor = await h.vendorOf(plan);
    });

    const estimateRoute = (net: string) =>
      request(h.server())
        .get(`/api/v1/vendors/${vendor.id}/tax-estimate`)
        .query({ netAmount: net, currency: 'VND' })
        .set(h.as(h.finance));
    const missingForFinance = async () =>
      h
        .dataOf<{ items: Array<{ id: string }> }>(
          await request(h.server())
            .get('/api/v1/vendors')
            .query({ taxProfile: 'MISSING', search: vendor.name })
            .set(h.as(h.finance))
            .expect(200),
        )
        .items.map((item) => item.id);

    it('with no tax profile uses the default, says so, still shows the price, and Finance sees the vendor to declare (AC-12)', async () => {
      const preview = await h.previewed(designer, plan, { termMonths: 20 });
      const route = h.dataOf<Record<string, string>>(await estimateRoute('20000000').expect(200));

      expect(preview.pricing).toMatchObject({ status: 'PRICED', amount: { amount: '20000000' } });
      expect(preview.costEstimate).toMatchObject({
        label: 'ESTIMATE_NO_PROFILE',
        basis: 'DEFAULT_NO_PROFILE',
        preTax: { amount: '20000000', currency: 'VND' },
        tax: { amount: route.taxAmount },
        estimatedCost: { amount: route.estimatedCost },
      });
      expect(await missingForFinance()).toContain(vendor.id);
    });

    it('with a tax profile splits the tax into what is deducted and what is a cost, in four estimated figures (AC-9)', async () => {
      await h
        .declareTaxProfile(vendor.id, [
          { taxType: 'VAT', ratePercent: '10', deductible: true },
          { taxType: 'Foreign contractor tax', ratePercent: '5', deductible: false },
        ])
        .expect(200);

      const preview = await h.previewed(designer, plan, { termMonths: 20 });

      expect(preview.costEstimate).toMatchObject({
        label: 'ESTIMATE',
        basis: 'PROFILE',
        preTax: { amount: '20000000', currency: 'VND' },
        tax: { amount: '3000000' },
        deductibleTax: { amount: '2000000' },
        nonDeductibleTax: { amount: '1000000' },
        estimatedCost: { amount: '21000000' },
        totalPayable: { amount: '23000000' },
      });
      expect(await missingForFinance()).not.toContain(vendor.id);
    });

    it('is not kept: a request sent before the profile is declared reads the profile of the day it is read', async () => {
      const sent = await h.sent(designer, plan, { termMonths: 1 });
      const stored = await h.ctx.sql.query(`SELECT * FROM access_requests WHERE id = $1`, [sent.id]);

      expect(Object.keys(stored.rows[0] as object).filter((column) => /tax/i.test(column))).toEqual([]);
    });
  });

  describe('paid software with no price (AC-14)', () => {
    it('says the amount cannot be worked out, takes none by hand, and can be sent but not sent on as spend', async () => {
      const preview = await h.previewed(designer, unpricedPlan);

      expect(preview).toMatchObject({
        pricing: { status: 'MISSING', missingReason: 'NO_PRICED_SUBSCRIPTION', amount: null },
        costEstimate: null,
        spendSubmission: 'BLOCKED_UNTIL_PRICED',
        canSubmit: true,
      });
      for (const extra of [{ amount: { amount: '1', currency: 'VND' } }, { unitPrice: '1' }, { budgetYear: 2030 }]) {
        expect(
          h.codeOf(
            await h.previewRequest({ planId: unpricedPlan, termMonths: 6, ...extra }, designer.account).expect(422),
          ),
        ).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('the spend date', () => {
    it('is shown with its budget year, and internal software takes none', async () => {
      const year = Number(h.today().slice(0, 4)) + 1;

      const preview = await h.previewed(designer, paidPlan, { expectedSpendOn: `${year}-01-05`, termMonths: 1 });
      const refused = await h
        .previewRequest({ planId: internalPlan, termMonths: 6, expectedSpendOn: h.today() }, designer.account)
        .expect(422);

      expect(preview).toMatchObject({ expectedSpendOn: `${year}-01-05`, budgetYear: year });
      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.NO_SPEND_FOR_FREE_SOFTWARE');
    });
  });

  describe('what is shown is what sending makes (AC-11)', () => {
    it.each([
      ['paid software with a price', () => paidPlan],
      ['paid software with no price', () => unpricedPlan],
      ['internal software', () => internalPlan],
    ])('%s', async (_name, plan) => {
      const person = await h.staff(design, `DES-P${Math.random().toString(36).slice(2, 8)}`);
      const preview = await h.previewed(person, plan(), { termMonths: 9 });

      const sent: AccessRequestWire = await h.sent(person, plan(), { termMonths: 9 });

      expect(sent).toMatchObject({
        branch: preview.branch,
        pricing: preview.pricing,
        expectedSpendOn: preview.expectedSpendOn,
        budgetYear: preview.budgetYear,
        costCenter: { id: preview.costCenter.id, code: preview.costCenter.code },
        policy: {
          hasSpendStep: kinds(preview).includes('SPEND_APPROVAL'),
          slaWorkingDays: preview.chain[0].expectedWorkingDays,
        },
      });
      expect(sent.needStep.assignee?.employeeId).toBe(preview.chain[0].assignee?.employeeId);
    });
  });

  describe('a preview writes nothing', () => {
    it('leaves no request, step, approval record or audit event behind, however often it is asked', async () => {
      const count = async (table: string) =>
        Number((await h.ctx.sql.query<{ count: string }>(`SELECT count(*) FROM ${table}`)).rows[0].count);
      const tables = ['access_requests', 'access_request_steps', 'approval_records', 'audit_events'];
      const before = await Promise.all(tables.map(count));

      await h.previewed(designer, paidPlan);
      await h.previewed(designer, internalPlan);
      await h.previewed(newcomer, unpricedPlan);
      await h
        .previewRequest({ planId: '00000000-0000-4000-8000-000000000000', termMonths: 6 }, designer.account)
        .expect(404);

      expect(await Promise.all(tables.map(count))).toEqual(before);
    });

    it('is for signed-in people only and rejects what is not a form', async () => {
      await request(h.server())
        .post('/api/v1/access-requests/preview')
        .send({ planId: paidPlan, termMonths: 6 })
        .expect(401);
      for (const body of [
        {},
        { planId: paidPlan },
        { planId: 'x', termMonths: 6 },
        { planId: paidPlan, termMonths: 0 },
      ]) {
        expect(h.codeOf(await h.previewRequest(body, designer.account).expect(422))).toBe('VALIDATION_ERROR');
      }
    });
  });
});
