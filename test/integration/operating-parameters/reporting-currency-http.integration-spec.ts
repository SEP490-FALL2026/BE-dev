import request from 'supertest';
import { SeatHarness } from '../../support/seat-baseline-harness';

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
  const events = () => h.auditOf('Organization');

  it('QĐ-111an: is dong, and the Super Admin reads it', async () => {
    expect(h.dataOf<{ currency: string }>(await get().expect(200))).toEqual({ currency: 'VND' });
  });

  it('QĐ-111an: no route sets it: a PUT, even from the Super Admin, is 404 and nothing changes or is audited', async () => {
    const before = (await events()).length;

    const response = await request(h.server()).put('/api/v1/reporting-currency').set(asAdmin).send({ currency: 'USD' });

    expect(response.status).toBe(404);
    expect(h.dataOf<{ currency: string }>(await get().expect(200))).toEqual({ currency: 'VND' });
    expect((await events()).length).toBe(before);
  });

  it('is for the Super Admin alone: Finance, the IT Admin and an employee are refused, and without a token 401', async () => {
    for (const account of [h.finance, h.it1, h.employee]) {
      expect(h.codeOf(await get(h.as(account)).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
    }
    expect(h.codeOf(await request(h.server()).get('/api/v1/reporting-currency').expect(401))).toBe(
      'AUTHENTICATION_REQUIRED',
    );
  });
});
