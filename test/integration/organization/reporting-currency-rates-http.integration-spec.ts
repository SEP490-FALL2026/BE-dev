import request from 'supertest';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();

describe('the reporting currency once a rate is entered (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await h.start();
  }, 180000);

  afterAll(async () => {
    await h.stop();
  });

  const asAdmin = () => ({ Authorization: `Bearer ${h.admin}` });
  const put = (currency: string) =>
    request(h.server()).put('/api/v1/reporting-currency').set(asAdmin()).send({ currency });

  it('AC-9: is free to change before the first rate, and locked after it, whatever the new currency is', async () => {
    await put('USD').expect(200);
    await put('VND').expect(200);

    await request(h.server())
      .post('/api/v1/exchange-rates')
      .set(h.as(h.finance))
      .send({ currency: 'USD', rateDate: '2026-10-01', rate: '25000' })
      .expect(201);

    for (const currency of ['EUR', 'USD']) {
      const response = await put(currency).expect(409);
      expect(h.codeOf(response)).toBe('REPORTING_CURRENCY.LOCKED');
      expect(h.detailsOf(response)).toEqual({ reason: 'EXCHANGE_RATE' });
    }
    const current = await request(h.server()).get('/api/v1/reporting-currency').set(asAdmin()).expect(200);
    expect(h.dataOf(current)).toEqual({ currency: 'VND' });
    expect(h.dataOf(await put('VND').expect(200))).toEqual({ currency: 'VND', changed: false });
  });
});
