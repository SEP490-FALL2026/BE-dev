import { Department, Person, RequestHarness } from '../support/request-harness';

const h = new RequestHarness();

describe('requests over HTTP: the amount of a request (integration, real PostgreSQL)', () => {
  let design: Department;
  let designer: Person;
  let internalPlan: string;
  let pricedPlan: string;
  let unpricedPlan: string;

  beforeAll(async () => {
    await h.start();
    design = await h.departmentWithUnit('P-DES');
    designer = await h.staff(design, 'DES-E1');
    const head = await h.staff(design, 'DES-H1');
    await h.makeHead(design, head);
    internalPlan = await h.plan('K5');
    pricedPlan = await h.planOf(await h.subscription(10)); // 1 000 000 VND per seat per month, billed monthly
    unpricedPlan = await h.plan('K2'); // in the catalog, with no subscription to price it from
    await h.setParameter('FISCAL_YEAR_START_MONTH', 1).expect(200);
  }, 240000);

  afterEach(async () => {
    await h.setParameter('FISCAL_YEAR_START_MONTH', 1);
  });

  afterAll(async () => {
    await h.stop();
  });

  const year = Number(h.today().slice(0, 4));

  describe('paid software that has a price (US-05-02 AC-1)', () => {
    it('is the price of its plan for every billing period of the term, with the payments laid out from today', async () => {
      const sent = await h.sent(designer, pricedPlan, { termMonths: 6 });

      expect(sent.pricing).toMatchObject({
        status: 'PRICED',
        missingReason: null,
        amount: { amount: '6000000', currency: 'VND' },
        unitPrice: { amount: '1000000', currency: 'VND' },
        billingCycle: 'MONTHLY',
        periodCount: 6,
        firstDueOn: h.today(),
      });
      expect(sent).toMatchObject({ expectedSpendOn: h.today(), budgetYear: year });
    });

    it('is not something the sender can give: no amount or price in the form is accepted', async () => {
      for (const extra of [{ amount: { amount: '1', currency: 'VND' } }, { unitPrice: '1' }, { budgetYear: 2030 }]) {
        expect(h.codeOf(await h.submit(h.form(pricedPlan, extra), designer.account).expect(422))).toBe(
          'VALIDATION_ERROR',
        );
      }
    });

    it('is written into the audit trail of the request', async () => {
      const sent = await h.sent(designer, pricedPlan, { termMonths: 2 });

      const [event] = await h.auditEvents('ACCESS_REQUEST', sent.id);

      expect(event.after).toMatchObject({
        pricingStatus: 'PRICED',
        amountMinor: '2000000',
        amountCurrency: 'VND',
        budgetYear: year,
        expectedSpendOn: h.today(),
      });
    });
  });

  describe('paid software with no price (US-05-02 AC-4, QĐ-84e)', () => {
    it('is sent all the same, with no amount and the reason, and nobody gives one by hand', async () => {
      const sent = await h.sent(designer, unpricedPlan);

      expect(sent.branch).toBe('PAID_IN_CATALOG');
      expect(sent.pricing).toMatchObject({
        status: 'MISSING',
        missingReason: 'NO_PRICED_SUBSCRIPTION',
        amount: null,
        unitPrice: null,
        periodCount: null,
      });
      expect(sent.budgetYear).toBe(year);
    });

    it('also has no price when the only subscription of the plan is a draft', async () => {
      const draftPlan = await h.planOf(await h.draftSubscription());

      expect((await h.sent(designer, draftPlan)).pricing).toMatchObject({
        status: 'MISSING',
        missingReason: 'NO_PRICED_SUBSCRIPTION',
      });
    });
  });

  describe('the day the money is expected to go out (US-05-02 AC-11, QĐ-82e)', () => {
    it('fixes the budget year: a request sent in one year for the next year belongs to the next', async () => {
      const sent = await h.sent(designer, pricedPlan, { termMonths: 1, expectedSpendOn: `${year + 1}-01-05` });

      expect(sent).toMatchObject({ expectedSpendOn: `${year + 1}-01-05`, budgetYear: year + 1 });
      expect(sent.pricing).toMatchObject({ firstDueOn: `${year + 1}-01-05`, lastDueOn: `${year + 1}-01-05` });
    });

    it('follows the month the fiscal year begins in: the end of March still belongs to the year that began in April', async () => {
      await h.setParameter('FISCAL_YEAR_START_MONTH', 4).expect(200);

      const sent = await h.sent(designer, pricedPlan, { termMonths: 1, expectedSpendOn: `${year + 1}-03-31` });

      expect(sent.budgetYear).toBe(year);
    });

    it('is today when it is left out, and must be a real date', async () => {
      const sent = await h.sent(designer, pricedPlan, { termMonths: 1 });

      expect(sent.expectedSpendOn).toBe(h.today());
      expect(
        h.codeOf(await h.submit(h.form(pricedPlan, { expectedSpendOn: '2026-13-40' }), designer.account).expect(422)),
      ).toBe('VALIDATION_ERROR');
    });
  });

  describe('internal software with no fee', () => {
    it('has no amount and no expected spend date, and takes none', async () => {
      const sent = await h.sent(designer, internalPlan);

      expect(sent).toMatchObject({ branch: 'INTERNAL_FREE', expectedSpendOn: null, budgetYear: null });
      expect(sent.pricing).toMatchObject({ status: 'NOT_APPLICABLE', amount: null, periodCount: null });
      const response = await h
        .submit(h.form(internalPlan, { expectedSpendOn: h.today() }), designer.account)
        .expect(422);

      expect(h.codeOf(response)).toBe('ACCESS_REQUEST.NO_SPEND_FOR_FREE_SOFTWARE');
    });
  });
});
