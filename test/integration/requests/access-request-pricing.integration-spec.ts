import { Department, Person, RequestHarness } from '../../support/request-harness';

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
  }, 240000);

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
      expect(sent).toMatchObject({ budgetYear: year });
      expect(sent).not.toHaveProperty('expectedSpendOn');
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

  describe('the budget year (US-05-02 AC-11, QĐ-98)', () => {
    it('is worked out from today, and the sender gives no day the money is expected to go out', async () => {
      const sent = await h.sent(designer, pricedPlan, { termMonths: 1 });

      expect(sent.budgetYear).toBe(year);
      expect(sent.pricing).toMatchObject({ firstDueOn: h.today(), lastDueOn: h.today() });
      for (const expectedSpendOn of [`${year + 1}-01-05`, '2026-13-40']) {
        expect(h.codeOf(await h.submit(h.form(pricedPlan, { expectedSpendOn }), designer.account).expect(422))).toBe(
          'VALIDATION_ERROR',
        );
      }
    });

    it('is the calendar year of today whatever the month, with no parameter that moves where the year begins (R-I01)', async () => {
      const sent = await h.sent(designer, pricedPlan, { termMonths: 1 });

      expect(sent.budgetYear).toBe(year);
    });
  });

  describe('internal software with no fee', () => {
    it('has no amount and no budget year, and takes no day of spending', async () => {
      const sent = await h.sent(designer, internalPlan);

      expect(sent).toMatchObject({ branch: 'INTERNAL_FREE', budgetYear: null });
      expect(sent.pricing).toMatchObject({ status: 'NOT_APPLICABLE', amount: null, periodCount: null });
      const response = await h
        .submit(h.form(internalPlan, { expectedSpendOn: h.today() }), designer.account)
        .expect(422);

      expect(h.codeOf(response)).toBe('VALIDATION_ERROR');
    });
  });
});
