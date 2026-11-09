import { randomUUID } from 'node:crypto';
import {
  CurrencyNotSupportedError,
  MoneyOutOfRangeError,
  MoneyScaleExceededError,
} from '../../../src/core/money/money.errors';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { FinanceApi } from '../../../src/modules/finance/public/finance.api';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../../support/http-test-app';

describe('the finance facade: money in, conversion snapshot out (integration, real PostgreSQL)', () => {
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
      expect(await finance.parseMoney({ amount: '1200.5', currency: 'USD' })).toEqual({
        amountMinor: 120050n,
        currency: 'USD',
      });
      expect(await finance.parseMoney({ amount: '30000000', currency: 'VND' })).toEqual({
        amountMinor: 30000000n,
        currency: 'VND',
      });
    });

    it('refuses decimals a currency does not have, a currency it does not know, and an amount too large', async () => {
      await expect(finance.parseMoney({ amount: '1200.5', currency: 'VND' })).rejects.toBeInstanceOf(
        MoneyScaleExceededError,
      );
      await expect(finance.parseMoney({ amount: '1.00', currency: 'XYZ' })).rejects.toBeInstanceOf(
        CurrencyNotSupportedError,
      );
      await expect(finance.parseMoney({ amount: '10000000000000.01', currency: 'USD' })).rejects.toBeInstanceOf(
        MoneyOutOfRangeError,
      );
    });
  });

  describe('snapshotMoney', () => {
    const snapshot = (amountMinor: bigint, currency: string, date: string) =>
      runner.run((tx) => finance.snapshotMoney(tx, { amountMinor, currency }, date));

    it('M1: freezes 1,200.00 USD at the 25,000 rate of that very day as 30,000,000 VND, naming the rate used', async () => {
      const rateId = await insertRate('USD', '2026-09-01', '25000');

      const result = await snapshot(120000n, 'USD', '2026-09-01');

      expect(result).toEqual({
        status: 'CONVERTED',
        snapshot: {
          rate: 25000n * 10n ** 10n,
          rateDate: '2026-09-01',
          rateSource: 'MANUAL',
          reportingAmountMinor: 30000000n,
          reportingCurrency: 'VND',
          exchangeRateId: rateId,
        },
      });
    });

    it('M2: a later rate does not change the snapshot already taken, and does not apply to another day', async () => {
      await insertRate('USD', '2026-10-01', '26000');

      const september = await snapshot(120000n, 'USD', '2026-09-01');
      const october = await snapshot(120000n, 'USD', '2026-10-01');

      expect(september).toMatchObject({ status: 'CONVERTED', snapshot: { reportingAmountMinor: 30000000n } });
      expect(october).toMatchObject({ status: 'CONVERTED', snapshot: { reportingAmountMinor: 31200000n } });
    });

    it('M16: with no rate for that day it is MISSING_RATE; a rate for another day, earlier or later, does not stand in', async () => {
      await insertRate('EUR', '2026-09-10', '27000');
      await insertRate('EUR', '2026-09-12', '27500');

      expect(await snapshot(100n, 'EUR', '2026-09-11')).toEqual({ status: 'MISSING_RATE' });

      await insertRate('EUR', '2026-09-11', '27200');
      expect(await snapshot(100n, 'EUR', '2026-09-11')).toMatchObject({ status: 'CONVERTED' });
    });

    it('records the organization reporting currency as itself: rate 1, SAME_CURRENCY, no rate row used', async () => {
      const result = await snapshot(1500000n, 'VND', '2026-09-05');

      expect(result).toEqual({
        status: 'CONVERTED',
        snapshot: {
          rate: 10n ** 10n,
          rateDate: '2026-09-05',
          rateSource: 'SAME_CURRENCY',
          reportingAmountMinor: 1500000n,
          reportingCurrency: 'VND',
          exchangeRateId: null,
        },
      });
    });

    it('converts through a rate with ten decimals read back from PostgreSQL, and rounds a half away from zero', async () => {
      const rateId = await insertRate('GBP', '2026-09-20', '25431.5000000001');

      // 100.00 GBP x 25431.5000000001 = 2,543,150.00001 VND -> 2543150
      expect(await snapshot(10000n, 'GBP', '2026-09-20')).toMatchObject({
        status: 'CONVERTED',
        snapshot: { rate: 254315000000001n, reportingAmountMinor: 2543150n, exchangeRateId: rateId },
      });
      // 0.03 GBP x 25431.5000000001 = 762.945000000003 VND -> 763
      expect(await snapshot(3n, 'GBP', '2026-09-20')).toMatchObject({ snapshot: { reportingAmountMinor: 763n } });

      await insertRate('GBP', '2026-09-21', '25450');
      // 0.01 GBP x 25450 = exactly 254.5 VND -> 255 (the half moves away from zero)
      expect(await snapshot(1n, 'GBP', '2026-09-21')).toMatchObject({ snapshot: { reportingAmountMinor: 255n } });
    });

    it('refuses a rate date that is not a business date instead of reaching SQL with it', async () => {
      await expect(snapshot(100n, 'USD', '2026-13-45')).rejects.toBeInstanceOf(RangeError);
    });

    it('refuses a currency the system does not support', async () => {
      await expect(snapshot(100n, 'XYZ', '2026-09-01')).rejects.toBeInstanceOf(CurrencyNotSupportedError);
    });
  });
});
