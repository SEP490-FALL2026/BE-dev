import { Client } from 'pg';
import request from 'supertest';
import { ReportingCurrencyNotSupportedError } from '../../../src/core/money/money.errors';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { FinanceApi } from '../../../src/modules/finance/public/finance.api';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import {
  HttpTestApp,
  SeededInstallation,
  createHttpTestApp,
  insertEmployeeFixture,
  seedInstallation,
} from '../../support/http-test-app';
import { waitForLockWaiters } from '../../support/lock-wait';

const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };

describe('the reporting currency under the application (integration, DB-01 and DB-02)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let it1: ApiAccount;
  let changer: Client;
  let finance: FinanceApi;
  let runner: TransactionRunner;
  const server = () => ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });
  const dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    const admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', role: 'IT_ADMIN', admin });
    await insertEmployeeFixture(ctx.app, seed, { code: 'E-OWN', email: 'owner@acme.vn' });
    finance = ctx.app.get(FinanceApi, { strict: false });
    runner = ctx.app.get(TransactionRunner, { strict: false });
    changer = new Client({ connectionString: ctx.database.url });
    await changer.connect();
  }, 120000);

  afterEach(async () => {
    await changer.query('ROLLBACK').catch(() => undefined);
  });

  afterAll(async () => {
    await changer?.end();
    await ctx?.close();
  });

  const planId = async (): Promise<string> => {
    const application = dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/applications')
        .set(as(it1))
        .send({
          name: 'Figma',
          kind: 'SAAS',
          vendorName: 'Figma Inc',
          dataSensitivity: 'LOW',
          communication: NO,
        })
        .expect(201),
    );

    return dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/plans')
        .set(as(it1))
        .send({
          applicationId: application.id,
          name: 'Pro',
          provisioningType: 'K2',
          pricingModel: 'PER_SEAT',
          controlLevel: 'FULL',
        })
        .expect(201),
    ).id;
  };

  it('DB-01: a conversion waits for a change of the reporting currency in flight and is made in the new one', async () => {
    await changer.query('BEGIN');
    await changer.query(`UPDATE organizations SET reporting_currency = 'USD'`);

    const converting = runner.run((tx) =>
      finance.snapshotMoney(tx, { amountMinor: 5000n, currency: 'USD' }, '2026-09-01'),
    );
    await waitForLockWaiters(ctx.sql, 1, 5_000);
    await changer.query('COMMIT');

    // The USD price now needs no rate: it is the reporting currency, so the snapshot is rate 1 in USD, not VND.
    expect(await converting).toMatchObject({
      status: 'CONVERTED',
      snapshot: { reportingCurrency: 'USD', rateSource: 'SAME_CURRENCY', reportingAmountMinor: 5000n },
    });

    await ctx.sql.query(`UPDATE organizations SET reporting_currency = 'VND'`);
  }, 60_000);

  it('DB-02: a price recorded when the reporting currency is not in the table answers 409 with a code, not 500', async () => {
    const plan = await planId();
    await ctx.sql.query('ALTER TABLE organizations DROP CONSTRAINT organizations_reporting_currency_fkey');
    await ctx.sql.query(`UPDATE organizations SET reporting_currency = 'MYR'`);
    try {
      const response = await request(server())
        .post('/api/v1/subscriptions')
        .set(as(it1))
        .send({
          ownerDepartmentId: seed.departmentId,
          planId: plan,
          kind: 'TERM',
          unitPrice: { amount: '1200.00', currency: 'USD' },
        });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        error: { code: 'REPORTING_CURRENCY_NOT_SUPPORTED', details: { currency: 'MYR' } },
      });
      expect((await ctx.sql.query('SELECT 1 FROM subscriptions')).rowCount).toBe(0);
      await expect(
        runner.run((tx) => finance.snapshotMoney(tx, { amountMinor: 100n, currency: 'USD' }, '2026-09-01')),
      ).rejects.toBeInstanceOf(ReportingCurrencyNotSupportedError);
    } finally {
      await ctx.sql.query(`UPDATE organizations SET reporting_currency = 'VND'`);
      await ctx.sql.query(
        `ALTER TABLE organizations ADD CONSTRAINT organizations_reporting_currency_fkey
           FOREIGN KEY (reporting_currency) REFERENCES currencies(code) ON DELETE RESTRICT ON UPDATE CASCADE`,
      );
    }
  }, 60_000);
});
