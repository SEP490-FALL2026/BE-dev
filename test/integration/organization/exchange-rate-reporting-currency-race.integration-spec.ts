import { Client } from 'pg';
import request from 'supertest';
import { waitForLockWaiters } from '../../support/lock-wait';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();

/**
 * P28-03 (DB-01 for exchange rates): a rate is validated, stored, audited and answered in the reporting currency that
 * governs it — the one read with the organization row held FOR SHARE in the transaction that stores it. A change of the
 * currency in flight makes the rate wait, and the rate then speaks the new currency everywhere. The order is forced
 * with a held lock and a lock wait, never a sleep.
 */
describe('recording an exchange rate while the reporting currency changes (integration, P28-03)', () => {
  let holder: Client;

  beforeAll(async () => {
    await h.start();
    holder = new Client({ connectionString: h.ctx.database.url });
    await holder.connect();
  }, 180000);

  afterAll(async () => {
    await holder?.end();
    await h.stop();
  });

  it('waits for a change of the reporting currency in flight, then records, audits and answers in the new currency', async () => {
    await holder.query('BEGIN');
    await holder.query(`UPDATE organizations SET reporting_currency = 'USD'`);

    const recording = request(h.server())
      .post('/api/v1/exchange-rates')
      .set(h.as(h.finance))
      .send({ currency: 'EUR', rateDate: '2026-10-01', rate: '1.08' })
      .then((response) => response);
    await waitForLockWaiters(h.ctx.sql, 1);
    await holder.query('COMMIT');
    const response = await recording;

    expect(response.status).toBe(201);
    const rate = h.dataOf<{ id: string; currency: string; reportingCurrency: string }>(response);
    expect(rate).toMatchObject({ currency: 'EUR', reportingCurrency: 'USD' });
    const audit = await h.ctx.sql.query<{ after: { reportingCurrency: string } }>(
      `SELECT after FROM audit_events WHERE action = 'EXCHANGE_RATE.RECORDED' AND resource_id = $1`,
      [rate.id],
    );
    expect(audit.rows.map((row) => row.after.reportingCurrency)).toEqual(['USD']);
  });

  it('refuses, after waiting, a rate for the currency the change in flight makes the reporting one', async () => {
    await holder.query('BEGIN');
    // The rate above locks the currency (now USD), so no change can commit any more: hold the row the way a change
    // does, without changing it. The request must read the currency only once that row is free.
    await holder.query(`SELECT 1 FROM organizations FOR UPDATE`);

    const recording = request(h.server())
      .post('/api/v1/exchange-rates')
      .set(h.as(h.finance))
      .send({ currency: 'USD', rateDate: '2026-10-02', rate: '1' })
      .then((response) => response);
    await waitForLockWaiters(h.ctx.sql, 1);
    await holder.query('COMMIT');
    const response = await recording;

    expect(response.status).toBe(422);
    expect(h.codeOf(response)).toBe('EXCHANGE_RATE.SAME_AS_REPORTING_CURRENCY');
  });
});
