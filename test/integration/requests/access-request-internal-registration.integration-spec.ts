import { AccessRequestWire, Department, Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();

describe('requests over HTTP: registering internal software (integration, real PostgreSQL)', () => {
  let design: Department;
  let head: Person;
  let designer: Person;
  let owner: Person; // a Business Owner who works
  let gone: Person; // one who has left
  let itAdmin: Person; // the IT Admin in charge of design
  let ownIt: Person; // an IT Admin of design who asks for software themselves
  let counter = 0;
  const year = Number(h.today().slice(0, 4));

  beforeAll(async () => {
    await h.start();
    design = await h.departmentWithUnit('P-DES');
    head = await h.staff(design, 'DES-H1');
    designer = await h.staff(design, 'DES-E1');
    owner = await h.staff(design, 'DES-BO');
    gone = await h.staff(design, 'DES-GONE');
    ownIt = await h.staff(design, 'DES-IT3', 'IT_ADMIN');
    itAdmin = { employeeId: h.it1.employeeId, account: h.it1 };
    await h.makeHead(design, head);
    await h.setItAdminInCharge(design, itAdmin);
    await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [gone.employeeId]);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const count = async (table: string) =>
    Number((await h.ctx.sql.query<{ count: string }>(`SELECT count(*) FROM ${table}`)).rows[0].count);
  const catalogRows = async () =>
    Promise.all(['applications', 'plans', 'vendors', 'contracts', 'subscriptions', 'license_assignments'].map(count));
  const row = async (id: string) =>
    (
      await h.ctx.sql.query<{ state: string; branch: string; plan_id: string | null; policy: { chain: string[] } }>(
        `SELECT state, branch, plan_id, policy FROM access_requests WHERE id = $1`,
        [id],
      )
    ).rows[0];
  /** An internal proposal the IT Admin has classified as internal, waiting for the registration. */
  const classified = async (extra: Record<string, unknown> = {}): Promise<AccessRequestWire> => {
    counter += 1;
    const proposed = await h.proposed(designer, { softwareName: `Analytics tool ${counter}`, ...extra });
    await h.decide(proposed.id, { decision: 'APPROVE' }, head.account).expect(200);
    await h
      .saveAssessment(proposed.id, { classification: 'INTERNAL', dataSensitivity: 'MEDIUM' }, itAdmin.account)
      .expect(200);

    return proposed;
  };
  const register = (id: string, body: object, account = itAdmin.account) => h.registerInternal(id, body, account);
  const asOwner = (extra: Record<string, unknown> = {}) => ({ businessOwnerEmployeeId: owner.employeeId, ...extra });

  describe('the way with no spend (US-05-20 AC-3, AC-5)', () => {
    it('registers the software with its Business Owner and a plan granted by hand, and sends the request to the IT Admin', async () => {
      const proposed = await classified();

      const done = h.dataOf<{ request: AccessRequestWire }>(await register(proposed.id, asOwner()).expect(200)).request;

      expect(done).toMatchObject({
        branch: 'INTERNAL_FREE',
        state: 'AWAITING_EXECUTION',
        pricing: { status: 'NOT_APPLICABLE', amount: null },
        policy: { hasSpendStep: false },
        plan: { applicationName: proposed.proposal?.softwareName },
      });
      expect((await row(proposed.id)).policy.chain).toEqual(['NEED', 'IT_ASSESSMENT', 'IT_EXECUTION']);
      const registered = await h.ctx.sql.query<{
        kind: string;
        owner: string;
        vendor_id: string | null;
        type: string;
        model: string | null;
      }>(
        `SELECT a.kind, a.business_owner_employee_id AS owner, a.vendor_id, p.provisioning_type AS type, p.pricing_model AS model
           FROM plans p JOIN applications a ON a.id = p.application_id WHERE p.id = $1`,
        [done.plan?.planId],
      );
      expect(registered.rows[0]).toEqual({
        kind: 'INTERNAL',
        owner: owner.employeeId,
        vendor_id: null,
        type: 'K5',
        model: null,
      });
    });

    it('makes nothing financial: no vendor, contract, subscription, seat, and no commitment', async () => {
      const proposed = await classified();
      const [, , vendors, contracts, subscriptions, seats] = await catalogRows();

      await register(proposed.id, asOwner()).expect(200);

      const [applications, plans, vendorsAfter, contractsAfter, subscriptionsAfter, seatsAfter] = await catalogRows();
      expect(vendorsAfter).toBe(vendors);
      expect(contractsAfter).toBe(contracts);
      expect(subscriptionsAfter).toBe(subscriptions);
      expect(seatsAfter).toBe(seats);
      expect(applications).toBeGreaterThan(0);
      expect(plans).toBeGreaterThan(0);
    });

    it('is granted by the IT Admin afterwards, as any internal software is, without a spending approver', async () => {
      const proposed = await classified();
      await register(proposed.id, asOwner()).expect(200);

      const granted = await h.grant({ requestId: proposed.id });

      expect(granted.status).toBe(201);
      expect(await row(proposed.id)).toMatchObject({ state: 'EXECUTING' });
      const seats = await h.ctx.sql.query(`SELECT 1 FROM license_assignments WHERE employee_id = $1`, [
        designer.employeeId,
      ]);
      expect(seats.rowCount).toBeGreaterThan(0);
    });

    it('completes the assessment: the step of the IT Admin ends and nothing more is changed', async () => {
      const proposed = await classified();

      await register(proposed.id, asOwner()).expect(200);

      const wire = await h.assessmentWire(proposed.id, itAdmin.account);
      expect(wire).toMatchObject({
        status: 'COMPLETED',
        classification: 'INTERNAL',
        step: { state: 'APPROVED' },
        proposedBusinessOwner: { employeeId: owner.employeeId },
      });
      await h.saveAssessment(proposed.id, { sso: true }, itAdmin.account).expect(409);
    });

    it('is audited with the application, the plan and the Business Owner', async () => {
      const proposed = await classified();
      await register(proposed.id, asOwner()).expect(200);

      const events = await h.auditEvents('ACCESS_REQUEST', proposed.id);
      const registered = events.find((event) => event.action === 'ACCESS_REQUEST.INTERNAL_SOFTWARE_REGISTERED');

      expect(registered?.after).toMatchObject({ businessOwnerEmployeeId: owner.employeeId, withSpend: false });
    });
  });

  describe('a Business Owner is required (AC-4, AC-9)', () => {
    it.each([
      [
        'has left the company',
        () => ({ businessOwnerEmployeeId: gone.employeeId }),
        422,
        'APPLICATION.BUSINESS_OWNER_INVALID',
      ],
      ['is not named', () => ({}), 422, 'VALIDATION_ERROR'],
      [
        'does not exist',
        () => ({ businessOwnerEmployeeId: '00000000-0000-4000-8000-000000000000' }),
        422,
        'APPLICATION.BUSINESS_OWNER_INVALID',
      ],
    ])(
      'refuses a Business Owner who %s, registers nothing and keeps the request with the IT Admin',
      async (_name, body, status, code) => {
        const proposed = await classified();
        const before = await catalogRows();

        const response = await register(proposed.id, body()).expect(status);

        expect(h.codeOf(response)).toBe(code);
        expect(await catalogRows()).toEqual(before);
        expect(await row(proposed.id)).toMatchObject({
          state: 'AWAITING_IT_ASSESSMENT',
          plan_id: null,
          branch: 'NEW_SOFTWARE',
        });
        expect((await h.assessmentWire(proposed.id, itAdmin.account)).step).toMatchObject({ state: 'PENDING' });
      },
    );

    it('is not rejected for lacking one: it waits, and the registration can be made later on the same request', async () => {
      const proposed = await classified();
      await register(proposed.id, { businessOwnerEmployeeId: gone.employeeId }).expect(422);

      await register(proposed.id, asOwner()).expect(200);

      expect(await row(proposed.id)).toMatchObject({ state: 'AWAITING_EXECUTION' });
    });

    it('is refused when the name is taken, and nothing is registered', async () => {
      const first = await classified({ softwareName: 'Shared name' });
      const second = await classified({ softwareName: 'Shared name' });
      await register(first.id, asOwner()).expect(200);
      const before = await catalogRows();

      const response = await register(second.id, asOwner()).expect(409);

      expect(h.codeOf(response)).toBe('APPLICATION.NAME_TAKEN');
      expect(await catalogRows()).toEqual(before);
      expect(await row(second.id)).toMatchObject({ state: 'AWAITING_IT_ASSESSMENT' });
    });

    it('may give another name than the one proposed', async () => {
      const proposed = await classified();

      const done = h.dataOf<{ request: AccessRequestWire }>(
        await register(proposed.id, asOwner({ softwareName: 'Internal reports portal' })).expect(200),
      ).request;

      expect(done.plan?.applicationName).toBe('Internal reports portal');
    });
  });

  describe('only software the company built goes this way (AC-6, AC-8)', () => {
    it('is not for software classified as paid or licensed, or not classified at all', async () => {
      const paid = await classified();
      await h.saveAssessment(paid.id, { classification: 'PAID_LICENSED' }, itAdmin.account).expect(200);
      const unclassified = await h.proposed(designer, { softwareName: 'Unclassified' });
      await h.decide(unclassified.id, { decision: 'APPROVE' }, head.account).expect(200);
      const before = await catalogRows();

      const refusedPaid = await register(paid.id, asOwner()).expect(409);
      const refusedNone = await register(unclassified.id, asOwner()).expect(409);

      expect(h.codeOf(refusedPaid)).toBe('ASSESSMENT.NOT_INTERNAL');
      expect(h.codeOf(refusedNone)).toBe('ASSESSMENT.NOT_INTERNAL');
      expect(await catalogRows()).toEqual(before);
      expect(await row(paid.id)).toMatchObject({ state: 'AWAITING_IT_ASSESSMENT', branch: 'NEW_SOFTWARE' });
    });

    it('is not done for a request whose need was refused', async () => {
      const proposed = await h.proposed(designer, { softwareName: 'Refused tool' });
      await h.decide(proposed.id, { decision: 'REJECT', reason: 'Not needed' }, head.account).expect(200);
      const before = await catalogRows();

      const response = await register(proposed.id, asOwner()).expect(409);

      expect(h.codeOf(response)).toBe('ACCESS_REQUEST.NOT_AWAITING_ASSESSMENT');
      expect(await catalogRows()).toEqual(before);
      expect(await row(proposed.id)).toMatchObject({ state: 'REJECTED' });
    });

    it('is not done before the need is approved, nor twice', async () => {
      const waiting = await h.proposed(designer, { softwareName: 'Waiting tool' });
      const done = await classified();
      await register(done.id, asOwner()).expect(200);

      expect(h.codeOf(await register(waiting.id, asOwner()).expect(409))).toBe(
        'ACCESS_REQUEST.NOT_AWAITING_ASSESSMENT',
      );
      expect(h.codeOf(await register(done.id, asOwner()).expect(409))).toBe('ACCESS_REQUEST.NOT_AWAITING_ASSESSMENT');
    });
  });

  describe('who registers it', () => {
    it.each([
      ['the person who asked', () => designer],
      ['the head', () => head],
    ])('is not %s', async (_name, who) => {
      const proposed = await classified();

      await register(proposed.id, asOwner(), who().account).expect(403);
      await register(proposed.id, asOwner(), h.finance).expect(403);
    });

    it('is not an IT Admin for a request they asked for', async () => {
      counter += 1;
      const own = await h.proposed(ownIt, { softwareName: `Own tool ${counter}` });
      await h.decide(own.id, { decision: 'APPROVE' }, head.account).expect(200);

      const response = await register(own.id, asOwner(), ownIt.account).expect(403);

      expect(h.codeOf(response)).toBe('ACCESS_REQUEST.OWN_REQUEST');
    });
  });

  describe('when the grant itself needs a payment (AC-10)', () => {
    const quote = (over: Record<string, unknown> = {}) => ({
      unitPrice: { amount: '8', currency: 'USD' },
      billingCycle: 'MONTHLY',
      validFrom: `${year}-01-01`,
      validUntil: null,
      commitmentMonths: 6,
      paymentFrequency: 'MONTHLY',
      ...over,
    });

    it('registers the software without a spending approver, and keeps the spend step with the amount of the quote', async () => {
      const proposed = await classified();

      const done = h.dataOf<{ request: AccessRequestWire }>(
        await register(proposed.id, asOwner({ spend: { quote: quote() } })).expect(200),
      ).request;

      expect(done).toMatchObject({
        branch: 'NEW_SOFTWARE',
        state: 'AWAITING_SPEND_SUBMISSION',
        pricing: { status: 'PRICED', amount: { amount: '48.00', currency: 'USD' }, bindingPeriodCount: 6 },
        policy: { hasSpendStep: true },
      });
      expect(done.plan?.planId).toBeTruthy();
      expect((await row(proposed.id)).policy.chain).toContain('SPEND_APPROVAL');
    });

    it('is refused as a whole when the quote cannot price it: the software is not registered either', async () => {
      const proposed = await classified();
      const before = await catalogRows();

      const response = await register(
        proposed.id,
        asOwner({ spend: { quote: quote({ validFrom: '2020-01-01', validUntil: '2020-12-31' }) } }),
      ).expect(422);

      expect(h.codeOf(response)).toBe('ASSESSMENT.QUOTE_NOT_IN_FORCE');
      expect(await catalogRows()).toEqual(before);
      expect(await row(proposed.id)).toMatchObject({ state: 'AWAITING_IT_ASSESSMENT', plan_id: null });
    });
  });
});
