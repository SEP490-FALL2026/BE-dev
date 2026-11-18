import { Client } from 'pg';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { FinanceApi } from '../../../src/modules/finance/public/finance.api';
import { HttpTestApp, createHttpTestApp, seedInstallation } from '../../support/http-test-app';
import { waitForLockWaiters } from '../../support/lock-wait';

describe('the reporting currency under the application (integration, DB-01)', () => {
  let ctx: HttpTestApp;
  let changer: Client;
  let finance: FinanceApi;
  let runner: TransactionRunner;

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    await seedInstallation(ctx.app);
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

  it('DB-01: a snapshot waits for a change of the reporting currency in flight and is frozen in the new one', async () => {
    await changer.query('BEGIN');
    await changer.query(`UPDATE organizations SET reporting_currency = 'USD'`);

    const freezing = runner.run((tx) =>
      finance.snapshotMoney(tx, { amountMinor: 5000n, currency: 'USD' }, '2026-09-01'),
    );
    await waitForLockWaiters(ctx.sql, 1, 5_000);
    await changer.query('COMMIT');

    // The USD amount is the reporting currency now: the snapshot is rate 1 in USD, which the old reporting currency would have refused.
    expect(await freezing).toMatchObject({
      reportingCurrency: 'USD',
      rateSource: 'SAME_CURRENCY',
      reportingAmountMinor: 5000n,
    });

    await ctx.sql.query(`UPDATE organizations SET reporting_currency = 'VND'`);
  }, 60_000);
});
