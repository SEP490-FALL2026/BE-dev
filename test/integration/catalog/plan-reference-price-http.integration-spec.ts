import request from 'supertest';
import { declareApplication } from '../../support/builders/catalog.builder';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();
const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };

interface PlanWire {
  id: string;
  provisioningType: string;
  referencePrice: { amount: string; currency: string } | null;
}

const dong = (amount: string) => ({ amount, currency: 'VND' });

/**
 * `QĐ-113a`: a paid plan (K1, K2, K4) may carry a reference price in dong, before tax; the plan answers it, the list shows it, a change sets or clears it
 * (`null`), another currency is refused with its own code, and the row keeps the kind rule even when a change moves the kind. Over HTTP on real PostgreSQL.
 */
describe('the reference price of a plan (integration, real PostgreSQL)', () => {
  const body = (applicationId: string, type: string, extra: object = {}) => ({
    applicationId,
    name: h.unique('Plan'),
    provisioningType: type,
    ...(type === 'K4' ? {} : { pricingModel: 'PER_SEAT' }),
    controlLevel: 'FULL',
    ...extra,
  });
  const declare = (payload: object) => request(h.server()).post('/api/v1/plans').set(h.as(h.it1)).send(payload);
  const patch = (id: string, payload: object) =>
    request(h.server()).patch(`/api/v1/plans/${id}`).set(h.as(h.it1)).send(payload);
  const read = async (id: string) =>
    h.dataOf<PlanWire>(await request(h.server()).get(`/api/v1/plans/${id}`).set(h.as(h.it1)).expect(200));
  let licensed: string;
  let saas: string;

  beforeAll(async () => {
    await h.start();
    licensed = await declareApplication(h.ctx, h.it1.accessToken, {
      name: h.unique('Licensed'),
      kind: 'LICENSED',
      vendorName: h.unique('Vendor'),
      dataSensitivity: 'LOW',
      communication: NO,
    });
    saas = await declareApplication(h.ctx, h.it1.accessToken, {
      name: h.unique('Saas'),
      kind: 'SAAS',
      vendorName: h.unique('Vendor'),
      dataSensitivity: 'LOW',
      communication: NO,
    });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('is null when the plan does not say it, and optional on declaring', async () => {
    const created = h.dataOf<PlanWire>(await declare(body(saas, 'K2')).expect(201));

    expect(created.referencePrice).toBeNull();
    expect((await read(created.id)).referencePrice).toBeNull();
  });

  it.each([['K1'], ['K2'], ['K4']])('is kept on a %s plan, shown on the plan and in the list', async (type) => {
    const created = h.dataOf<PlanWire>(
      await declare(body(type === 'K4' ? licensed : saas, type, { referencePrice: dong('500000') })).expect(201),
    );

    expect(created.referencePrice).toEqual(dong('500000'));
    expect((await read(created.id)).referencePrice).toEqual(dong('500000'));
    const listed = h.dataOf<{ items: PlanWire[] }>(
      await request(h.server()).get('/api/v1/plans').set(h.as(h.it1)).expect(200),
    );
    expect(listed.items.find((plan) => plan.id === created.id)?.referencePrice).toEqual(dong('500000'));
  });

  it('is set, changed and cleared by a change; resending the same price changes nothing', async () => {
    const created = h.dataOf<PlanWire>(await declare(body(saas, 'K2')).expect(201));

    expect(h.dataOf<PlanWire>(await patch(created.id, { referencePrice: dong('600000') }).expect(200))).toMatchObject({
      referencePrice: dong('600000'),
    });
    expect(
      h.dataOf<PlanWire>(await patch(created.id, { referencePrice: dong('600000') }).expect(200)).referencePrice,
    ).toEqual(dong('600000'));
    expect(h.dataOf<PlanWire>(await patch(created.id, { referencePrice: null }).expect(200)).referencePrice).toBeNull();
  });

  it('refuses another currency than dong with its own code, and writes nothing', async () => {
    const named = h.unique('Named');
    const refused = await declare(
      body(saas, 'K2', { name: named, referencePrice: { amount: '20', currency: 'USD' } }),
    ).expect(422);

    expect(h.codeOf(refused)).toBe('PLAN.REFERENCE_PRICE_NOT_VND');
    const { rowCount } = await h.ctx.sql.query('SELECT 1 FROM plans WHERE name = $1', [named]);
    expect(rowCount).toBe(0);
  });

  it('refuses zero and a negative amount: a price of 0 is no price, as a request counts it', async () => {
    for (const amount of ['0', '-1']) {
      expect(h.codeOf(await declare(body(saas, 'K2', { referencePrice: dong(amount) })).expect(422))).toBe(
        'PLAN.REFERENCE_PRICE_NOT_POSITIVE',
      );
    }
    const created = h.dataOf<PlanWire>(await declare(body(saas, 'K2', { referencePrice: dong('1000') })).expect(201));
    expect(h.codeOf(await patch(created.id, { referencePrice: dong('0') }).expect(422))).toBe(
      'PLAN.REFERENCE_PRICE_NOT_POSITIVE',
    );
  });

  it('refuses an amount with decimals of a currency that has none', async () => {
    expect(h.codeOf(await declare(body(saas, 'K2', { referencePrice: dong('1000.5') })).expect(422))).toBe(
      'MONEY_SCALE_EXCEEDED',
    );
  });

  it('judges the kind and the plan before the money: a K5 plan given dollars is not applicable, a missing plan is not found', async () => {
    const internal = await declareApplication(h.ctx, h.it1.accessToken, {
      name: h.unique('Internal'),
      kind: 'INTERNAL',
      dataSensitivity: 'LOW',
      communication: NO,
    });
    const k5 = h.dataOf<PlanWire>(
      await declare({ applicationId: internal, name: h.unique('Plan'), provisioningType: 'K5' }).expect(201),
    );
    const usd = { amount: '20', currency: 'USD' };

    expect(h.codeOf(await patch(k5.id, { referencePrice: usd }).expect(422))).toBe(
      'PLAN.REFERENCE_PRICE_NOT_APPLICABLE',
    );
    await patch('00000000-0000-4000-8000-000000000000', { referencePrice: usd }).expect(404);
  });

  it('is refused on a plan of another kind than K1, K2 and K4', async () => {
    const refused = await request(h.server())
      .post('/api/v1/applications')
      .set(h.as(h.it1))
      .send({
        name: h.unique('Portal'),
        plan: { name: 'Portal access', provisioningType: 'K5', referencePrice: dong('1000') },
      })
      .expect(422);

    expect(h.codeOf(refused)).toBe('PLAN.REFERENCE_PRICE_NOT_APPLICABLE');
  });

  it('is cleared when the kind moves between K1/K2 and K4, kept between K1 and K2', async () => {
    const k4 = h.dataOf<PlanWire>(await declare(body(licensed, 'K4', { referencePrice: dong('9000000') })).expect(201));

    const moved = h.dataOf<PlanWire>(await patch(k4.id, { provisioningType: 'K1' }).expect(200));
    expect(moved.referencePrice).toBeNull();

    const again = h.dataOf<PlanWire>(await patch(moved.id, { referencePrice: dong('450000') }).expect(200));
    expect(again.referencePrice).toEqual(dong('450000'));
    const keptAsK2 = h.dataOf<PlanWire>(await patch(moved.id, { provisioningType: 'K2' }).expect(200));
    expect(keptAsK2.referencePrice).toEqual(dong('450000'));
  });

  it('is entered again with the change when the kind moves to K4', async () => {
    const k1 = h.dataOf<PlanWire>(await declare(body(licensed, 'K1', { referencePrice: dong('300000') })).expect(201));

    const moved = h.dataOf<PlanWire>(
      await patch(k1.id, { provisioningType: 'K4', pricingModel: null, referencePrice: dong('7000000') }).expect(200),
    );

    expect(moved).toMatchObject({ provisioningType: 'K4', referencePrice: dong('7000000') });
  });
});
