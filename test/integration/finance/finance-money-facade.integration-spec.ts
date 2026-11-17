import { randomUUID } from 'node:crypto';
import {
  CurrencyNotSupportedError,
  MoneyOutOfRangeError,
  MoneyScaleExceededError,
} from '../../../src/core/money/money.errors';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { FinanceApi } from '../../../src/modules/finance/public/finance.api';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../../support/http-test-app';

describe('the finance facade: money in, the snapshot of the same currency out (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let finance: FinanceApi;
  let runner: TransactionRunner;

  const insertRate = async (currency: string, date: string, rate: string): Promise<string> => {
    const id = randomUUID();
    await ctx.sql.query(
      `INSERT INTO exchange_rates (id, organization_id, currency, rate_date, rate) VALUES ($1, $2, $3, $4, $5)`,
      [id, seed.organizationId, currency, date, rate],
    );

    return id;
  };

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    finance = ctx.app.get(FinanceApi, { strict: false });
    runner = ctx.app.get(TransactionRunner, { strict: false });
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  describe('parseMoney', () => {
    it('reads the amount with the minor digits of its currency', async () => {
      expect(await finance.parseMoney({ amount: '1200.5', currency: 'USD' }, 'unitPrice')).toEqual({
        amountMinor: 120050n,
        currency: 'USD',
      });
      expect(await finance.parseMoney({ amount: '30000000', currency: 'VND' }, 'unitPrice')).toEqual({
        amountMinor: 30000000n,
        currency: 'VND',
      });
    });

    it('refuses decimals a currency does not have, a currency it does not know, and an amount too large', async () => {
      await expect(finance.parseMoney({ amount: '1200.5', currency: 'VND' }, 'unitPrice')).rejects.toBeInstanceOf(
        MoneyScaleExceededError,
      );
      await expect(finance.parseMoney({ amount: '1.00', currency: 'XYZ' }, 'unitPrice')).rejects.toBeInstanceOf(
        CurrencyNotSupportedError,
      );
      await expect(
        finance.parseMoney({ amount: '10000000000000.01', currency: 'USD' }, 'unitPrice'),
      ).rejects.toBeInstanceOf(MoneyOutOfRangeError);
    });

    it('says where the amount sat in the body on every money error it throws', async () => {
      await expect(finance.parseMoney({ amount: '1200.5', currency: 'VND' }, 'lines.2.amount')).rejects.toMatchObject({
        path: 'lines.2.amount',
      });
      await expect(finance.parseMoney({ amount: '1.00', currency: 'XYZ' }, 'originalPrice')).rejects.toMatchObject({
        path: 'originalPrice',
      });
      await expect(
        finance.parseMoney({ amount: '10000000000000.01', currency: 'USD' }, 'requestedAmount'),
      ).rejects.toMatchObject({ path: 'requestedAmount' });
      await expect(finance.parseMoney({ amount: '1e5', currency: 'USD' }, 'unitPrice')).rejects.toMatchObject({
        path: 'unitPrice',
      });
    });
  });

  describe('snapshotMoney', () => {
    const snapshot = (amountMinor: bigint, currency: string, date: string) =>
      runner.run((tx) => finance.snapshotMoney(tx, { amountMinor, currency }, date));

    it('QĐ-111an: records the organization reporting currency as itself: rate 1, SAME_CURRENCY, no rate row used', async () => {
      expect(await snapshot(1500000n, 'VND', '2026-09-05')).toEqual({
        rate: 10n ** 10n,
        rateDate: '2026-09-05',
        rateSource: 'SAME_CURRENCY',
        reportingAmountMinor: 1500000n,
        reportingCurrency: 'VND',
        exchangeRateId: null,
      });
    });

    it('QĐ-111an: money in another currency is a programming error: nothing converts it, even with a rate an older release entered for that day', async () => {
      await insertRate('USD', '2026-09-01', '25000');

      await expect(snapshot(120000n, 'USD', '2026-09-01')).rejects.toThrow(/USD.*reporting currency VND/);
      await expect(snapshot(100n, 'XYZ', '2026-09-01')).rejects.toThrow(/XYZ.*reporting currency VND/);
    });

    it('refuses a rate date that is not a business date instead of reaching SQL with it', async () => {
      await expect(snapshot(100n, 'VND', '2026-13-45')).rejects.toBeInstanceOf(RangeError);
    });
  });
});
