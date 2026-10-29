import request from 'supertest';
import { AccessRequestWire, Department, Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();

describe('requests over HTTP: software that is not in the catalog (integration, real PostgreSQL)', () => {
  let design: Department;
  let executive: Department;
  let headless: Department;
  let head: Person; // head of design
  let designer: Person;
  let boss: Person; // head of executive and the spending approver
  let fallback: Person;
  let itInCharge: Person; // the IT Admin in charge of design
  let otherIt: Person; // another IT Admin, acting for them
  let itPerson: Person;
  let counter = 0;
  const year = Number(h.today().slice(0, 4));

  beforeAll(async () => {
    await h.start();
    design = await h.departmentWithUnit('P-DES');
    executive = await h.departmentWithUnit('P-EXE');
    headless = await h.departmentWithUnit('P-HR');
    head = await h.staff(design, 'DES-H1');
    designer = await h.staff(design, 'DES-E1');
    boss = await h.staff(executive, 'EXE-C1');
    fallback = await h.staff(headless, 'HR-R0');
    otherIt = await h.staff(headless, 'HR-IT2', ['IT_ADMIN']);
    itInCharge = { employeeId: h.it1.employeeId, account: h.it1 };
    itPerson = await h.staff(design, 'DES-IT3', ['IT_ADMIN']);
    await h.makeHead(design, head);
    await h.makeHead(executive, boss);
    await h.setRole('SPENDING_APPROVER', boss);
    await h.setRole('FALLBACK_APPROVER', fallback);
    await h.setItAdminInCharge(design, itInCharge);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const stateOf = async (id: string) =>
    (await h.ctx.sql.query<{ state: string }>(`SELECT state FROM access_requests WHERE id = $1`, [id])).rows[0].state;
  const stepsOf = async (id: string) =>
    (
      await h.ctx.sql.query<{ kind: string; state: string; assignee_employee_id: string | null }>(
        `SELECT kind, state, assignee_employee_id FROM access_request_steps WHERE request_id = $1 ORDER BY sequence`,
        [id],
      )
    ).rows;
  const person = async (): Promise<Person> => {
    counter += 1;

    return h.staff(design, `DES-P${counter}`);
  };
  /** A proposal of the designer whose need the head has approved: it waits for the IT Admin. */
  const awaiting = async (extra: Record<string, unknown> = {}): Promise<AccessRequestWire> => {
    const proposed = await h.proposed(designer, extra);
    const long = Number(extra.termMonths ?? 6) > 12;
    await h
      .decide(
        proposed.id,
        { decision: 'APPROVE', ...(long ? { termConfirmation: { reason: 'The contract runs that long' } } : {}) },
        head.account,
      )
      .expect(200);

    return proposed;
  };
  const save = (id: string, body: object, account = itInCharge.account) => h.saveAssessment(id, body, account);
  const complete = (id: string, account = itInCharge.account) => h.completeAssessment(id, account);
  const missingOf = (response: request.Response) => h.detailsOf(response).missing;

  describe('proposing (US-05-06 AC-1, US-05-02 AC-8)', () => {
    it('opens a request of the third branch with no plan, the chain with the assessment, and the assessment empty', async () => {
      const proposed = await h.proposed(designer);

      expect(proposed).toMatchObject({
        branch: 'NEW_SOFTWARE',
        state: 'PENDING',
        plan: null,
        proposal: {
          softwareName: 'Miro',
          homepageUrl: 'https://miro.com',
          purpose: 'Whiteboards for design reviews',
          dataDescription: 'Product design boards',
          expectedUsers: 5,
        },
        businessReason: 'Whiteboards for design reviews',
        pricing: { status: 'MISSING', missingReason: 'AWAITING_QUOTE', amount: null },
        policy: { hasSpendStep: true },
        needStep: { assignee: { employeeId: head.employeeId } },
        costCenter: { id: design.unitId },
      });
      const stored = await h.ctx.sql.query<{ policy: { chain: string[] } }>(
        `SELECT policy FROM access_requests WHERE id = $1`,
        [proposed.id],
      );
      expect(stored.rows[0].policy.chain).toEqual(['NEED', 'IT_ASSESSMENT', 'SPEND_APPROVAL', 'IT_EXECUTION']);
      const opened = await h.assessmentWire(proposed.id, designer.account);
      expect(opened).toMatchObject({ status: 'DRAFT', classification: null, step: null, complete: false });
    });

    it.each([
      ['no data of the company', { dataDescription: undefined }],
      ['a blank description of the data', { dataDescription: '  ' }],
      ['no name', { softwareName: undefined }],
      ['no purpose', { purpose: undefined }],
      ['a homepage that is not a web address', { homepageUrl: 'miro.com' }],
      ['nobody to use it', { expectedUsers: 0 }],
      ['no term', { termMonths: undefined }],
      ['a Cost Center chosen by hand', { costCenterId: '00000000-0000-4000-8000-000000000001' }],
      ['an amount given by hand', { amount: { amount: '1', currency: 'USD' } }],
    ])('is not sent with %s, and nothing is written', async (_name, over) => {
      const before = await h.requestRows();

      const response = await h.propose(h.proposeBody(over), designer.account).expect(422);

      expect(h.codeOf(response)).toBe('VALIDATION_ERROR');
      expect(await h.requestRows()).toBe(before);
    });

    it('is given to the person the routing table names, as for any request', async () => {
      const proposed = await h.proposed(head);

      expect(proposed.needStep.assignee?.employeeId).toBe(boss.employeeId);
    });

    it('is fixed to the budget year of the day the money is expected to go out', async () => {
      const proposed = await h.proposed(designer, { expectedSpendOn: `${year + 1}-01-05` });

      expect(proposed).toMatchObject({ expectedSpendOn: `${year + 1}-01-05`, budgetYear: year + 1 });
    });
  });

  describe('the need decision leads to the assessment (AC-2)', () => {
    it('puts the request with the IT Admin in charge of the department, with the time of the policy', async () => {
      const proposed = await awaiting();

      expect(await stateOf(proposed.id)).toBe('AWAITING_IT_ASSESSMENT');
      expect(await stepsOf(proposed.id)).toEqual([
        { kind: 'NEED', state: 'APPROVED', assignee_employee_id: head.employeeId },
        { kind: 'IT_ASSESSMENT', state: 'PENDING', assignee_employee_id: itInCharge.employeeId },
      ]);
      const wire = await h.assessmentWire(proposed.id, designer.account);
      expect(wire.step).toMatchObject({
        state: 'PENDING',
        assignee: { employeeId: itInCharge.employeeId },
        slaWorkingDays: 2,
      });
    });

    it('waits for any IT Admin when the department has none in charge who still works', async () => {
      const proposed = await h.proposed(await h.staff(headless, `HR-P${(counter += 1)}`));
      await h.decide(proposed.id, { decision: 'APPROVE' }, fallback.account).expect(200);

      const steps = await stepsOf(proposed.id);

      expect(steps[1]).toEqual({ kind: 'IT_ASSESSMENT', state: 'WAITING', assignee_employee_id: null });
      expect((await h.assessmentWire(proposed.id, itInCharge.account)).step).toMatchObject({
        state: 'WAITING',
        assignee: null,
        waitingReason: 'NO_IT_ADMIN_IN_CHARGE',
      });
    });

    it('is not asked of a request that is refused at the need step', async () => {
      const proposed = await h.proposed(await person());

      await h.decide(proposed.id, { decision: 'REJECT', reason: 'Not needed' }, head.account).expect(200);

      expect(await stateOf(proposed.id)).toBe('REJECTED');
      expect((await stepsOf(proposed.id)).map((step) => step.kind)).toEqual(['NEED']);
    });
  });

  describe('who fills the assessment (US-01-12 AC-2, US-05-06 AC-12)', () => {
    it.each([
      ['the person who asked', () => designer],
      ['the head', () => head],
      ['the spending approver', () => boss],
    ])('is not filled by %s', async (_name, who) => {
      const proposed = await awaiting();

      expect(h.codeOf(await save(proposed.id, h.assessmentBody(), who().account).expect(403))).toBe(
        'AUTHORIZATION.FORBIDDEN',
      );
      expect(h.codeOf(await complete(proposed.id, who().account).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
    });

    it('is not filled by Finance', async () => {
      const proposed = await awaiting();

      await save(proposed.id, h.assessmentBody(), h.finance).expect(403);
      await complete(proposed.id, h.finance).expect(403);
    });

    it('is filled by an IT Admin, who is the one asked when none in charge is named, and the assignee need not be them', async () => {
      const proposed = await awaiting();

      const saved = await save(proposed.id, h.assessmentBody(), otherIt.account).expect(200);
      const done = await complete(proposed.id, otherIt.account).expect(200);

      expect(h.dataOf<{ assessment: { grantRevokeMethod: string } }>(saved).assessment.grantRevokeMethod).toBe(
        'Invite and remove by work email',
      );
      expect(h.dataOf<{ request: AccessRequestWire }>(done).request.state).toBe('AWAITING_SPEND_SUBMISSION');
      const events = await h.auditEvents('ACCESS_REQUEST', proposed.id);
      const completed = events.find((event) => event.action === 'ACCESS_REQUEST.ASSESSMENT_COMPLETED');
      expect(completed?.after).toMatchObject({ actingForAssignee: true, classification: 'PAID_LICENSED' });
    });

    it('is not filled by an IT Admin for a request they asked for', async () => {
      const own = await h.proposed(itPerson);
      await h.decide(own.id, { decision: 'APPROVE' }, head.account).expect(200);

      const response = await save(own.id, h.assessmentBody(), itPerson.account).expect(403);

      expect(h.codeOf(response)).toBe('ACCESS_REQUEST.OWN_REQUEST');
    });

    it('cannot be filled before the need is approved, nor once it is completed', async () => {
      const waiting = await h.proposed(await person());
      const proposed = await awaiting();

      const early = await save(waiting.id, h.assessmentBody()).expect(409);
      await save(proposed.id, h.assessmentBody()).expect(200);
      await complete(proposed.id).expect(200);
      const late = await save(proposed.id, { sso: true }).expect(409);

      expect(h.codeOf(early)).toBe('ACCESS_REQUEST.NOT_AWAITING_ASSESSMENT');
      expect(h.codeOf(late)).toBe('ACCESS_REQUEST.NOT_AWAITING_ASSESSMENT');
    });

    it('is read by the people of the request, the head and an IT Admin, and by the spending approver only when it is done', async () => {
      const proposed = await awaiting();

      for (const reader of [designer, head, itInCharge, otherIt]) {
        await h.assessmentOf(proposed.id, reader.account).expect(200);
      }
      await h.assessmentOf(proposed.id, boss.account).expect(404);
      await h.assessmentOf(proposed.id, h.finance).expect(404);
      await save(proposed.id, h.assessmentBody()).expect(200);
      await complete(proposed.id).expect(200);

      await h.assessmentOf(proposed.id, boss.account).expect(200);
      await h.assessmentOf(proposed.id, h.finance).expect(404);
    });

    it('is not there for a request of software that is in the catalog', async () => {
      const sent = await h.sent(designer, await h.plan('K5'));

      await h.assessmentOf(sent.id, itInCharge.account).expect(404);
      await save(sent.id, h.assessmentBody()).expect(404);
      await h.assessmentOf(sent.id, designer.account).expect(404);
    });
  });

  describe('filling it in saves (AC-11)', () => {
    it('merges what is given and keeps the rest, and clears what is given as null', async () => {
      const proposed = await awaiting();

      await save(proposed.id, { vendorName: 'Miro Inc.', adminConsole: true }).expect(200);
      await save(proposed.id, { sso: false, controlRiskNote: 'No export of usage' }).expect(200);
      await save(proposed.id, { controlRiskNote: null }).expect(200);

      expect(await h.assessmentWire(proposed.id, itInCharge.account)).toMatchObject({
        vendor: { name: 'Miro Inc.' },
        adminConsole: true,
        sso: false,
        controlRiskNote: null,
        complete: false,
      });
    });

    it.each([
      ['nothing', {}, 'VALIDATION_ERROR'],
      ['a free classification', { classification: 'FREE' }, 'VALIDATION_ERROR'],
      ['an internal kind for paid software', { provisioningType: 'K5' }, 'VALIDATION_ERROR'],
      ['a blank text', { termsSummary: '  ' }, 'VALIDATION_ERROR'],
      ['an unknown field', { price: 3 }, 'VALIDATION_ERROR'],
      [
        'a negative price',
        { quote: { unitPrice: { amount: '-1', currency: 'USD' }, billingCycle: 'MONTHLY', validFrom: '2026-01-01' } },
        'MONEY_OUT_OF_RANGE',
      ],
      [
        'a currency that does not exist',
        { quote: { unitPrice: { amount: '1', currency: 'ZZZ' }, billingCycle: 'MONTHLY', validFrom: '2026-01-01' } },
        'CURRENCY_NOT_SUPPORTED',
      ],
      [
        'a quote that ends before it begins',
        {
          quote: {
            unitPrice: { amount: '1', currency: 'USD' },
            billingCycle: 'MONTHLY',
            validFrom: '2026-02-01',
            validUntil: '2026-01-01',
          },
        },
        'ASSESSMENT.QUOTE_PERIOD_INVALID',
      ],
      [
        'a billing cycle with no name for it',
        { quote: { unitPrice: { amount: '1', currency: 'USD' }, billingCycle: 'OTHER', validFrom: '2026-01-01' } },
        'VALIDATION_ERROR',
      ],
    ])('refuses %s', async (_name, body, code) => {
      const proposed = await awaiting();

      expect(h.codeOf(await save(proposed.id, body).expect(422))).toBe(code);
    });

    it.each([
      ['vendorId', { vendorId: '00000000-0000-4000-8000-000000000000' }],
      ['equivalentPlanId', { equivalentPlanId: '00000000-0000-4000-8000-000000000000' }],
      ['proposedBusinessOwnerEmployeeId', { proposedBusinessOwnerEmployeeId: '00000000-0000-4000-8000-000000000000' }],
    ])('refuses a %s that does not exist', async (field, body) => {
      const proposed = await awaiting();

      const response = await save(proposed.id, body).expect(422);

      expect(h.codeOf(response)).toBe('ASSESSMENT.REFERENCE_NOT_FOUND');
      expect(h.detailsOf(response)).toEqual({ field });
    });

    it('names the vendor of the proposal after a vendor of the catalog when no name is given', async () => {
      const proposed = await awaiting();
      const vendor = await h.vendorOf(await h.plan('K2'));

      await save(proposed.id, { vendorId: vendor.id }).expect(200);

      expect((await h.assessmentWire(proposed.id, itInCharge.account)).vendor).toEqual({
        vendorId: vendor.id,
        name: vendor.name,
      });
    });
  });

  describe('completing it (AC-2, AC-3, AC-14)', () => {
    it('prices the request from the quote, ends the step of the IT Admin and waits for the head to send it on', async () => {
      const proposed = await awaiting();
      await save(proposed.id, h.assessmentBody()).expect(200);

      const done = h.dataOf<{ request: AccessRequestWire }>(await complete(proposed.id).expect(200)).request;

      expect(done).toMatchObject({
        state: 'AWAITING_SPEND_SUBMISSION',
        pricing: {
          status: 'PRICED',
          amount: { amount: '48.00', currency: 'USD' },
          unitPrice: { amount: '8.00', currency: 'USD' },
          billingCycle: 'MONTHLY',
          periodCount: 6,
          bindingPeriodCount: 6,
        },
      });
      expect(await stepsOf(proposed.id)).toMatchObject([
        { kind: 'NEED', state: 'APPROVED' },
        { kind: 'IT_ASSESSMENT', state: 'APPROVED', assignee_employee_id: itInCharge.employeeId },
      ]);
      expect(await h.assessmentWire(proposed.id, itInCharge.account)).toMatchObject({
        status: 'COMPLETED',
        completedBy: { employeeId: itInCharge.employeeId },
      });
    });

    it('names what it lacks and writes nothing when the way a seat is granted and revoked is missing (AC-3)', async () => {
      const proposed = await awaiting();
      await save(proposed.id, h.assessmentBody({ grantRevokeMethod: undefined })).expect(200);

      const response = await complete(proposed.id).expect(422);

      expect(h.codeOf(response)).toBe('ASSESSMENT.INCOMPLETE');
      expect(missingOf(response)).toEqual(['grantRevokeMethod']);
      expect(await stateOf(proposed.id)).toBe('AWAITING_IT_ASSESSMENT');
      expect((await stepsOf(proposed.id))[1].state).toBe('PENDING');
    });

    it('is not completed without a quote, and the request stays unpriced, with no spend step (AC-14)', async () => {
      const proposed = await awaiting();
      await save(proposed.id, h.assessmentBody({ quote: undefined })).expect(200);

      const refused = await complete(proposed.id).expect(422);
      const wire = await h.assessmentWire(proposed.id, itInCharge.account);

      expect(missingOf(refused)).toEqual(['quote']);
      expect(wire.pricing).toMatchObject({ status: 'MISSING', missingReason: 'AWAITING_QUOTE', amount: null });
      expect(await stateOf(proposed.id)).toBe('AWAITING_IT_ASSESSMENT');

      await save(proposed.id, {
        quote: {
          unitPrice: { amount: '8', currency: 'USD' },
          billingCycle: 'MONTHLY',
          validFrom: `${year}-01-01`,
          validUntil: `${year + 1}-12-31`,
          commitmentMonths: 6,
          paymentFrequency: 'MONTHLY',
        },
      }).expect(200);
      await complete(proposed.id).expect(200);
      expect(await stateOf(proposed.id)).toBe('AWAITING_SPEND_SUBMISSION');
    });

    it('is not completed on a quote that is no longer in force, or not yet', async () => {
      const proposed = await awaiting();
      const quote = (validFrom: string, validUntil: string | null) => ({
        quote: {
          unitPrice: { amount: '8', currency: 'USD' },
          billingCycle: 'MONTHLY',
          validFrom,
          validUntil,
          commitmentMonths: 6,
          paymentFrequency: 'MONTHLY',
        },
      });

      await save(proposed.id, h.assessmentBody(quote('2020-01-01', '2020-12-31'))).expect(200);
      const expired = await complete(proposed.id).expect(422);
      await save(proposed.id, quote(`${year + 1}-01-01`, null)).expect(200);
      const early = await complete(proposed.id).expect(422);

      expect(h.codeOf(expired)).toBe('ASSESSMENT.QUOTE_NOT_IN_FORCE');
      expect(h.codeOf(early)).toBe('ASSESSMENT.QUOTE_NOT_IN_FORCE');
      expect(await stateOf(proposed.id)).toBe('AWAITING_IT_ASSESSMENT');
    });

    describe('a term of several billing cycles needs the way it is paid (AC-15)', () => {
      const monthly = {
        unitPrice: { amount: '8', currency: 'USD' },
        billingCycle: 'MONTHLY',
        validFrom: '2026-01-01',
        validUntil: null,
      };

      it('is not guessed to be one payment of the first year', async () => {
        const proposed = await awaiting({ termMonths: 24 });
        await save(proposed.id, h.assessmentBody({ quote: monthly })).expect(200);

        const refused = await complete(proposed.id).expect(422);

        expect(h.codeOf(refused)).toBe('ASSESSMENT.INCOMPLETE');
        expect(missingOf(refused)).toEqual(['quote.paymentFrequency', 'quote.commitmentMonths']);
        expect((await h.assessmentWire(proposed.id, itInCharge.account)).pricing.status).toBe('MISSING');
        expect(await stateOf(proposed.id)).toBe('AWAITING_IT_ASSESSMENT');
      });

      it('with a contract of twelve months paid by the year binds the first payment and forecasts the second', async () => {
        const proposed = await awaiting({ termMonths: 24 });
        await save(
          proposed.id,
          h.assessmentBody({
            quote: { ...monthly, commitmentMonths: 12, paymentFrequency: 'ANNUAL', firstPaymentOn: `${year}-11-01` },
          }),
        ).expect(200);

        const done = h.dataOf<{ request: AccessRequestWire }>(await complete(proposed.id).expect(200)).request;

        expect(done.pricing).toMatchObject({
          status: 'PRICED',
          amount: { amount: '96.00', currency: 'USD' },
          periodCount: 2,
          bindingPeriodCount: 1,
          firstDueOn: `${year}-11-01`,
          lastDueOn: `${year + 1}-11-01`,
        });
        expect(done).toMatchObject({ expectedSpendOn: `${year}-11-01`, budgetYear: year });
      });

      it('paid up front once is the whole term in one payment that binds', async () => {
        const proposed = await awaiting({ termMonths: 24 });
        await save(proposed.id, h.assessmentBody({ quote: { ...monthly, paymentFrequency: 'UPFRONT_ONCE' } })).expect(
          200,
        );

        const done = h.dataOf<{ request: AccessRequestWire }>(await complete(proposed.id).expect(200)).request;

        expect(done.pricing).toMatchObject({
          amount: { amount: '192.00', currency: 'USD' },
          periodCount: 1,
          bindingPeriodCount: 1,
        });
      });

      it('is refused when the payment is shorter than the billing cycle of the price', async () => {
        const proposed = await awaiting({ termMonths: 24 });
        await save(
          proposed.id,
          h.assessmentBody({
            quote: { ...monthly, billingCycle: 'ANNUAL', commitmentMonths: 12, paymentFrequency: 'MONTHLY' },
          }),
        ).expect(200);

        const refused = await complete(proposed.id).expect(422);

        expect(h.codeOf(refused)).toBe('ASSESSMENT.PAYMENT_FREQUENCY_INVALID');
      });
    });

    it('sends on a tool that does the same work as one already in the catalog, and keeps the suggestion (AC-5)', async () => {
      const proposed = await awaiting();
      const figma = await h.planOf(await h.subscription(10));
      await save(proposed.id, h.assessmentBody({ equivalentPlanId: figma })).expect(200);

      await complete(proposed.id).expect(200);

      const wire = await h.assessmentWire(proposed.id, designer.account);
      expect(wire.equivalentTool).toMatchObject({ planId: figma });
      expect(await stateOf(proposed.id)).toBe('AWAITING_SPEND_SUBMISSION');
    });

    describe('highly sensitive data (AC-7)', () => {
      it('is sent on with the word that there is no opinion and why, and gains no step', async () => {
        const proposed = await awaiting();
        await save(proposed.id, h.assessmentBody({ dataSensitivity: 'HIGH' })).expect(200);

        expect(missingOf(await complete(proposed.id).expect(422))).toEqual(['opinion.status']);
        await save(proposed.id, { opinion: { status: 'NOT_AVAILABLE' } }).expect(200);
        expect(missingOf(await complete(proposed.id).expect(422))).toEqual(['opinion.note']);
        await save(proposed.id, {
          opinion: { status: 'NOT_AVAILABLE', note: 'No owner of an equivalent tool' },
        }).expect(200);
        await complete(proposed.id).expect(200);

        expect((await stepsOf(proposed.id)).map((step) => step.kind)).toEqual(['NEED', 'IT_ASSESSMENT']);
        expect((await h.assessmentWire(proposed.id, head.account)).opinion).toEqual({
          status: 'NOT_AVAILABLE',
          note: 'No owner of an equivalent tool',
        });
      });
    });

    describe('what is not completed here (AC-11)', () => {
      it('internal software is completed by registering it, however much is filled', async () => {
        const proposed = await awaiting();
        await save(proposed.id, h.assessmentBody({ classification: 'INTERNAL' })).expect(200);

        const refused = await complete(proposed.id).expect(409);

        expect(h.codeOf(refused)).toBe('ASSESSMENT.INTERNAL_COMPLETES_BY_REGISTRATION');
        expect(await stateOf(proposed.id)).toBe('AWAITING_IT_ASSESSMENT');
      });

      it('a tool that cannot be controlled is refused at the gate, not sent to the spending approver', async () => {
        const proposed = await awaiting();
        await save(proposed.id, h.assessmentBody({ controlLevel: 'UNCONTROLLABLE' })).expect(200);

        const refused = await complete(proposed.id).expect(409);

        expect(h.codeOf(refused)).toBe('ASSESSMENT.CONTROL_LEVEL_UNCONTROLLABLE');
        expect(await stateOf(proposed.id)).toBe('AWAITING_IT_ASSESSMENT');
      });

      it('has no classification before it is given, and none that is free', async () => {
        const proposed = await awaiting();

        const refused = await complete(proposed.id).expect(422);

        expect(missingOf(refused)).toEqual(['classification']);
      });
    });

    it('shows the spending approver the estimated tax by the default profile, blocks nothing, and Finance sees the vendor to declare (AC-13)', async () => {
      const proposed = await awaiting();
      const vendor = await h.vendorOf(await h.plan('K2'));
      await save(proposed.id, h.assessmentBody({ vendorId: vendor.id })).expect(200);

      await complete(proposed.id).expect(200);

      const seen = await h.assessmentWire(proposed.id, boss.account);
      const missing = h.dataOf<{ items: Array<{ id: string }> }>(
        await request(h.server())
          .get('/api/v1/vendors')
          .query({ taxProfile: 'MISSING', search: vendor.name })
          .set(h.as(h.finance))
          .expect(200),
      ).items;
      expect(seen.costEstimate).toMatchObject({
        label: 'ESTIMATE_NO_PROFILE',
        basis: 'DEFAULT_NO_PROFILE',
        preTax: { amount: '48.00', currency: 'USD' },
      });
      expect(missing.map((item) => item.id)).toContain(vendor.id);
      expect(await stateOf(proposed.id)).toBe('AWAITING_SPEND_SUBMISSION');
    });
  });

  describe('linking the plan the IT Admin registered (AC-4, AC-8)', () => {
    let registered: string;
    beforeAll(async () => {
      registered = await h.plan('K5');
    });
    const decidedForSpend = async (): Promise<AccessRequestWire> => {
      const proposed = await awaiting();
      // The spending approver decides in a later part of this work; here the request is put where that decision leaves it.
      await h.ctx.sql.query(`UPDATE access_requests SET state = 'AWAITING_EXECUTION' WHERE id = $1`, [proposed.id]);

      return proposed;
    };

    it.each([
      ['while the assessment is not done', 'AWAITING_IT_ASSESSMENT'],
      ['before the spending approver has decided', 'AWAITING_SPEND_SUBMISSION'],
    ])('is not allowed %s: the software cannot enter the catalog by way of the request', async (_name, state) => {
      const proposed = await awaiting();
      await h.ctx.sql.query(`UPDATE access_requests SET state = $2::"AccessRequestState" WHERE id = $1`, [
        proposed.id,
        state,
      ]);

      const refused = await h.linkPlan(proposed.id, registered, itInCharge.account).expect(409);

      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.CATALOG_LINK_NOT_ALLOWED');
      expect(
        (await h.ctx.sql.query(`SELECT plan_id FROM access_requests WHERE id = $1`, [proposed.id])).rows[0],
      ).toEqual({ plan_id: null });
    });

    it('is for an IT Admin only', async () => {
      const proposed = await decidedForSpend();

      for (const account of [designer.account, head.account, boss.account, h.finance]) {
        await h.linkPlan(proposed.id, registered, account).expect(403);
      }
    });

    it('is refused for a plan that does not exist, and one whose software has no Business Owner who works', async () => {
      const proposed = await decidedForSpend();
      const orphan = await h.plan('K5');
      await h.ctx.sql.query(
        `UPDATE applications SET business_owner_employee_id = $2
          WHERE id = (SELECT application_id FROM plans WHERE id = $1)`,
        [orphan, (await h.staff(design, `DES-GONE${(counter += 1)}`)).employeeId],
      );
      await h.ctx.sql.query(
        `UPDATE employees SET status = 'TERMINATED'
          WHERE id = (SELECT business_owner_employee_id FROM applications
                       WHERE id = (SELECT application_id FROM plans WHERE id = $1))`,
        [orphan],
      );

      const missing = await h
        .linkPlan(proposed.id, '00000000-0000-4000-8000-000000000000', itInCharge.account)
        .expect(404);
      const noOwner = await h.linkPlan(proposed.id, orphan, itInCharge.account).expect(409);

      expect(h.codeOf(missing)).toBe('ACCESS_REQUEST.PLAN_NOT_FOUND');
      expect(h.codeOf(noOwner)).toBe('ACCESS_REQUEST.BUSINESS_OWNER_REQUIRED');
    });

    it('is the only way to a seat: no grant before the plan is linked, a grant after (AC-8)', async () => {
      const proposed = await decidedForSpend();
      const before = await h.grant({ requestId: proposed.id });

      const linked = h.dataOf<{ request: AccessRequestWire }>(
        await h.linkPlan(proposed.id, registered, itInCharge.account).expect(200),
      ).request;
      const granted = await h.grant({ requestId: proposed.id });
      const again = await h.linkPlan(proposed.id, registered, itInCharge.account).expect(409);

      expect(before.status).toBe(409);
      expect(h.codeOf(before)).toBe('PROVISIONING.REQUEST_NOT_IN_CATALOG');
      expect(linked.plan?.planId).toBe(registered);
      expect(granted.status).toBe(201);
      expect(await stateOf(proposed.id)).toBe('EXECUTING');
      expect(h.codeOf(again)).toBe('ACCESS_REQUEST.CATALOG_LINK_NOT_ALLOWED');
      const seats = await h.ctx.sql.query(`SELECT 1 FROM license_assignments WHERE plan_id = $1`, [registered]);
      expect(seats.rowCount).toBe(1);
      const events = await h.auditEvents('ACCESS_REQUEST', proposed.id);
      expect(events.map((event) => event.action)).toContain('ACCESS_REQUEST.CATALOG_LINKED');
    });
  });
});
