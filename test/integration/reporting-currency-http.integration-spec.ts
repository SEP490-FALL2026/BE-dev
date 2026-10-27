import request from 'supertest';
import { SeatHarness } from '../support/seat-baseline-harness';

const h = new SeatHarness();

describe('the reporting currency over HTTP (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await h.start();
  }, 180000);

  afterAll(async () => {
    await h.stop();
  });

  const asAdmin = {
    get Authorization() {
      return `Bearer ${h.admin}`;
    },
  };
  const get = (headers: Record<string, string> = asAdmin) =>
    request(h.server()).get('/api/v1/reporting-currency').set(headers);
  const put = (body: object, headers: Record<string, string> = asAdmin) =>
    request(h.server()).put('/api/v1/reporting-currency').set(headers).send(body);
  const current = async () => h.dataOf<{ currency: string }>(await get().expect(200)).currency;
  const events = () => h.auditOf('Organization');

  it('starts as the currency the installation chose, and the Super Admin reads it', async () => {
    expect(await current()).toBe('VND');
  });

  it('AC-9: changes to another supported currency while there is no rate and no priced subscription', async () => {
    const response = await put({ currency: 'USD' }).expect(200);

    expect(h.dataOf(response)).toEqual({ currency: 'USD', changed: true });
    expect(await current()).toBe('USD');
    const audited = (await events()).filter((event) => event.action === 'ORGANIZATION.REPORTING_CURRENCY_CHANGED');
    expect(audited).toHaveLength(1);
    expect(audited[0]).toMatchObject({
      before: { currency: 'VND' },
      after: { currency: 'USD' },
      actor_roles: ['SUPER_ADMIN'],
    });
  });

  it('answers the same currency with changed false and records nothing more', async () => {
    const before = (await events()).length;

    expect(h.dataOf(await put({ currency: 'USD' }).expect(200))).toEqual({ currency: 'USD', changed: false });

    expect((await events()).length).toBe(before);
  });

  it('refuses a currency that is not supported, and a value that is not a currency code', async () => {
    expect(h.codeOf(await put({ currency: 'ZZZ' }).expect(422))).toBe('CURRENCY_NOT_SUPPORTED');
    for (const body of [
      { currency: 'usd' },
      { currency: 'US' },
      { currency: 1 },
      {},
      { currency: 'VND', extra: true },
    ]) {
      expect(h.codeOf(await put(body).expect(422))).toBe('VALIDATION_ERROR');
    }
    expect(await current()).toBe('USD');
  });

  it('AC-9: locks once a subscription has a price converted, even a price in the reporting currency itself', async () => {
    await put({ currency: 'VND' }).expect(200);
    const planId = await h.plan('K2');
    await request(h.server())
      .post('/api/v1/subscriptions')
      .set(h.as(h.it1))
      .send({
        ownerDepartmentId: h.seed.departmentId,
        planId,
        kind: 'TERM',
        unitPrice: { amount: '1000000', currency: 'VND' },
      })
      .expect(201);

    const response = await put({ currency: 'USD' }).expect(409);

    expect(h.codeOf(response)).toBe('REPORTING_CURRENCY.LOCKED');
    expect(h.detailsOf(response)).toEqual({ reason: 'CONVERTED_PRICE' });
    expect(await current()).toBe('VND');
    expect((await events()).filter((event) => event.action === 'ORGANIZATION.REPORTING_CURRENCY_CHANGED')).toHaveLength(
      2,
    );
  });

  it('is for the Super Admin alone: Finance, the IT Admin and an employee are refused, and without a token 401', async () => {
    for (const account of [h.finance, h.it1, h.employee]) {
      expect(h.codeOf(await put({ currency: 'EUR' }, h.as(account)).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
      expect(h.codeOf(await get(h.as(account)).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
    }
    expect(
      h.codeOf(await request(h.server()).put('/api/v1/reporting-currency').send({ currency: 'EUR' }).expect(401)),
    ).toBe('AUTHENTICATION_REQUIRED');
  });
});
