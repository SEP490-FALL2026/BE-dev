import request from 'supertest';
import { AuditService } from '../../src/modules/audit/audit.service';
import { ApiAccount, adminToken, createActivatedAccount } from '../support/api-accounts';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../support/http-test-app';

interface RateWire {
  id: string;
  currency: string;
  rateDate: string;
  rate: string;
  reportingCurrency: string;
  source: string;
  createdAt: string;
}

interface ErrorBody {
  error: { code: string; details?: Record<string, unknown> };
}

const daysFromNow = (days: number): string => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

describe('currencies and exchange rates over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let finance: ApiAccount;
  let it1: ApiAccount;
  const server = () => ctx.app.getHttpServer();
  const asFinance = () => ({ Authorization: `Bearer ${finance.accessToken}` });
  const asIt = () => ({ Authorization: `Bearer ${it1.accessToken}` });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    const admin = await adminToken(ctx, seed);
    finance = await createActivatedAccount(ctx, seed, {
      code: 'E-FIN',
      email: 'fin@acme.vn',
      roles: ['FINANCE'],
      admin,
    });
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', roles: ['IT_ADMIN'], admin });
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  const dataOf = (response: request.Response) => (response.body as { data: RateWire }).data;
  const errorOf = (response: request.Response) => (response.body as ErrorBody).error;
  const record = (body: object, headers: Record<string, string> = asFinance()) =>
    request(server()).post('/api/v1/exchange-rates').set(headers).send(body);
  const rateRows = async () =>
    (
      await ctx.sql.query<{ currency: string; rate_date: string; rate: string; source: string }>(
        `SELECT currency, to_char(rate_date, 'YYYY-MM-DD') AS rate_date, rate::text AS rate, source::text AS source
           FROM exchange_rates ORDER BY currency, rate_date`,
      )
    ).rows;
  const auditActions = async (resourceId: string) =>
    (
      await ctx.sql.query<{ action: string; before: unknown; after: unknown }>(
        'SELECT action, before, after FROM audit_events WHERE resource_id = $1 ORDER BY occurred_at, id',
        [resourceId],
      )
    ).rows;

  describe('recording a rate (AC-4)', () => {
    it('rolls the rate back when its audit event cannot be written: both commit together or neither does', async () => {
      const audit = ctx.app.get(AuditService, { strict: false });
      const spy = jest.spyOn(audit, 'record').mockRejectedValueOnce(new Error('audit store down'));
      const before = (await rateRows()).length;

      await record({ currency: 'CNY', rateDate: '2026-09-03', rate: '3500' }).expect(500);

      spy.mockRestore();
      expect(await rateRows()).toHaveLength(before);
      await record({ currency: 'CNY', rateDate: '2026-09-03', rate: '3500' }).expect(201);
    });

    it('lets Finance enter a rate by hand: stored exactly, marked MANUAL, and audited with who did it', async () => {
      const response = await record({ currency: 'USD', rateDate: '2026-09-01', rate: '25431.50' }).expect(201);

      expect((response.body as { message: string }).message).toBe('EXCHANGE_RATE.RECORDED');
      expect(dataOf(response)).toMatchObject({
        currency: 'USD',
        rateDate: '2026-09-01',
        rate: '25431.5',
        reportingCurrency: 'VND',
        source: 'MANUAL',
      });
      expect((await rateRows()).filter((row) => row.currency === 'USD')).toEqual([
        { currency: 'USD', rate_date: '2026-09-01', rate: '25431.5000000000', source: 'MANUAL' },
      ]);
      expect(await auditActions(dataOf(response).id)).toEqual([
        {
          action: 'EXCHANGE_RATE.RECORDED',
          before: null,
          after: {
            currency: 'USD',
            rateDate: '2026-09-01',
            rate: '25431.5',
            reportingCurrency: 'VND',
            source: 'MANUAL',
          },
        },
      ]);
      const actor = await ctx.sql.query<{ actor_kind: string; actor_app_user_id: string; actor_roles: string[] }>(
        'SELECT actor_kind, actor_app_user_id, actor_roles FROM audit_events WHERE resource_id = $1',
        [dataOf(response).id],
      );
      expect(actor.rows[0]).toMatchObject({ actor_kind: 'USER', actor_app_user_id: finance.appUserId });
      expect(actor.rows[0].actor_roles).toEqual(['FINANCE']);
    });

    it('turns the IT Admin away from entering one: 403, nothing stored, nothing audited', async () => {
      const before = (await rateRows()).length;
      const audits = await ctx.sql.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_events WHERE action = 'EXCHANGE_RATE.RECORDED'`,
      );

      const response = await record({ currency: 'EUR', rateDate: '2026-09-01', rate: '27000' }, asIt()).expect(403);

      expect(errorOf(response).code).toBe('AUTHORIZATION.FORBIDDEN');
      expect(await rateRows()).toHaveLength(before);
      const after = await ctx.sql.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_events WHERE action = 'EXCHANGE_RATE.RECORDED'`,
      );
      expect(after.rows[0].n).toBe(audits.rows[0].n);
    });

    it('refuses a second rate for the same currency and date and leaves the first untouched', async () => {
      await record({ currency: 'GBP', rateDate: '2026-09-02', rate: '32000' }).expect(201);

      const response = await record({ currency: 'GBP', rateDate: '2026-09-02', rate: '33000' }).expect(409);

      expect(errorOf(response).code).toBe('EXCHANGE_RATE.ALREADY_RECORDED');
      expect((await rateRows()).filter((row) => row.currency === 'GBP')).toEqual([
        { currency: 'GBP', rate_date: '2026-09-02', rate: '32000.0000000000', source: 'MANUAL' },
      ]);
    });

    it('lets exactly one of two simultaneous entries for the same currency and date succeed', async () => {
      const results = await Promise.all([
        record({ currency: 'SGD', rateDate: '2026-09-03', rate: '19000' }),
        record({ currency: 'SGD', rateDate: '2026-09-03', rate: '19001' }),
      ]);

      expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
      expect((await rateRows()).filter((row) => row.currency === 'SGD')).toHaveLength(1);
    });

    it.each([
      [
        'a currency the system does not support',
        { currency: 'XYZ', rateDate: '2026-09-04', rate: '1' },
        'CURRENCY_NOT_SUPPORTED',
      ],
      [
        'more than ten decimals',
        { currency: 'EUR', rateDate: '2026-09-04', rate: '25000.12345678901' },
        'RATE_SCALE_EXCEEDED',
      ],
      ['a rate of zero', { currency: 'EUR', rateDate: '2026-09-04', rate: '0' }, 'RATE_OUT_OF_RANGE'],
      ['a negative rate', { currency: 'EUR', rateDate: '2026-09-04', rate: '-5' }, 'RATE_OUT_OF_RANGE'],
      ['a rate of 10^10', { currency: 'EUR', rateDate: '2026-09-04', rate: '10000000000' }, 'RATE_OUT_OF_RANGE'],
      [
        'the reporting currency itself',
        { currency: 'VND', rateDate: '2026-09-04', rate: '1' },
        'EXCHANGE_RATE.SAME_AS_REPORTING_CURRENCY',
      ],
      [
        'a date in the future',
        { currency: 'EUR', rateDate: daysFromNow(3), rate: '27000' },
        'EXCHANGE_RATE.DATE_IN_FUTURE',
      ],
      ['a date before 2000', { currency: 'EUR', rateDate: '1999-12-31', rate: '27000' }, 'EXCHANGE_RATE.DATE_TOO_OLD'],
    ])('turns away %s with 422 and stores nothing', async (_name, body, code) => {
      const before = await rateRows();

      const response = await record(body).expect(422);

      expect(errorOf(response).code).toBe(code);
      expect(await rateRows()).toEqual(before);
    });
  });

  describe('reading rates and currencies', () => {
    it('lists the supported currencies with their minor digits for Finance and the IT Admin', async () => {
      for (const headers of [asFinance(), asIt()]) {
        const response = await request(server()).get('/api/v1/currencies').set(headers).expect(200);

        const items = (response.body as { data: { items: { code: string; name: string; minorUnit: number }[] } }).data
          .items;
        expect(items).toHaveLength(11);
        expect(items.find((item) => item.code === 'VND')).toMatchObject({ code: 'VND', minorUnit: 0 });
        expect(items.find((item) => item.code === 'USD')).toMatchObject({ code: 'USD', minorUnit: 2 });
      }
    });

    it('lets the IT Admin read rates, newest date first, filtered by currency and date range, in pages', async () => {
      for (const day of ['05', '06', '07'])
        await record({ currency: 'JPY', rateDate: `2026-08-${day}`, rate: '170' }).expect(201);

      const all = await request(server()).get('/api/v1/exchange-rates?currency=JPY').set(asIt()).expect(200);
      const data = (all.body as { data: { items: RateWire[]; pagination: { totalItems: number } } }).data;
      expect(data.items.map((item) => item.rateDate)).toEqual(['2026-08-07', '2026-08-06', '2026-08-05']);
      expect(data.pagination.totalItems).toBe(3);

      const ranged = await request(server())
        .get('/api/v1/exchange-rates?currency=JPY&from=2026-08-06&to=2026-08-06')
        .set(asFinance())
        .expect(200);
      expect((ranged.body as { data: { items: RateWire[] } }).data.items.map((item) => item.rateDate)).toEqual([
        '2026-08-06',
      ]);

      const paged = await request(server())
        .get('/api/v1/exchange-rates?currency=JPY&page=2&pageSize=2')
        .set(asFinance())
        .expect(200);
      expect((paged.body as { data: { items: RateWire[] } }).data.items.map((item) => item.rateDate)).toEqual([
        '2026-08-05',
      ]);
    });
  });
});
