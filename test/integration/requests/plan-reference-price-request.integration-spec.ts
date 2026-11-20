import request from 'supertest';
import { Department, Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();

/**
 * `QĐ-113a` on a real database: a request is priced by the subscription that prices its plan first, and by the reference price of the plan only when
 * no subscription does. The preview says which (`priceSource`); the catalog of requestable software counts a plan the reference price prices as priced;
 * and the row refuses a price on a K5 plan and a price of 0 whoever writes it.
 */
describe('the reference price of a plan in requests (integration, real PostgreSQL)', () => {
  let design: Department;
  let designer: Person;

  const setReference = (planId: string, amountMinor: number | null, currency: string | null = 'VND') =>
    h.ctx.sql.query(`UPDATE plans SET reference_price_minor = $2, reference_price_currency = $3 WHERE id = $1`, [
      planId,
      amountMinor,
      amountMinor === null ? null : currency,
    ]);
  const priceSourceOf = async (planId: string) => (await h.previewed(designer, planId)).priceSource;

  beforeAll(async () => {
    await h.start();
    design = await h.departmentWithUnit('P-DES');
    const executive = await h.departmentWithUnit('P-EXE');
    const head = await h.staff(design, 'DES-H1');
    designer = await h.staff(design, 'DES-E1');
    const boss = await h.staff(executive, 'EXE-C1');
    await h.makeHead(design, head);
    await h.makeHead(executive, await h.staff(executive, 'EXE-H1'));
    await h.setRole('SPENDING_APPROVER', boss);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('prices the preview from the reference price of a plan no subscription prices, and says so', async () => {
    const planId = await h.plan('K2');
    expect((await h.previewed(designer, planId)).pricing.status).toBe('MISSING');
    expect(await priceSourceOf(planId)).toBeNull();

    await setReference(planId, 500_000);
    const preview = await h.previewed(designer, planId, { termMonths: 1 });

    expect(preview).toMatchObject({
      priceSource: 'PLAN_REFERENCE',
      pricing: { status: 'PRICED', kind: 'RECURRING', unitPrice: { amount: '500000', currency: 'VND' } },
    });
  });

  it('prefers the price of a subscription to the reference price of the same plan', async () => {
    const planId = await h.planOf(await h.subscription(10)); // 1 000 000 VND per seat per month
    await setReference(planId, 500_000);

    expect(await h.previewed(designer, planId)).toMatchObject({
      priceSource: 'SUBSCRIPTION',
      pricing: { status: 'PRICED', unitPrice: { amount: '1000000', currency: 'VND' } },
    });
  });

  it('counts a plan the reference price prices as one that can be priced in the catalog of requestable software', async () => {
    const planId = await h.plan('K2');
    const row = async () =>
      h.dataOf<{ price: { status: string } }>(
        await request(h.server()).get(`/api/v1/requestable-plans/${planId}`).set(h.as(designer.account)).expect(200),
      ).price.status;

    expect(await row()).toBe('MISSING');
    await setReference(planId, 750_000);
    expect(await row()).toBe('PRICED');
    expect((await h.previewed(designer, planId)).pricing.status).toBe('PRICED');
  });

  describe('the row refuses what the service refuses (CHECK, raw SQL)', () => {
    const refusal = async (planId: string, amountMinor: number) => {
      try {
        await setReference(planId, amountMinor);

        return null;
      } catch (error) {
        return (error as { code?: string }).code ?? 'unknown';
      }
    };

    it('refuses a price on a K5 plan', async () => {
      expect(await refusal(await h.plan('K5'), 1000)).toBe('23514');
    });

    it('refuses a price of 0 and a negative one, and accepts one above zero', async () => {
      const planId = await h.plan('K2');

      expect(await refusal(planId, 0)).toBe('23514');
      expect(await refusal(planId, -1)).toBe('23514');
      expect(await refusal(planId, 1)).toBeNull();
    });

    it('refuses a price in another currency', async () => {
      const planId = await h.plan('K2');

      await expect(setReference(planId, 20, 'USD')).rejects.toMatchObject({ code: '23514' });
    });
  });
});
