import { businessDateAt } from '../../../src/core/business-date';
import { PrismaService } from '../../../src/infrastructure/database/prisma.service';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { DeviceAssetCodeExhaustedError } from '../../../src/modules/devices/asset-code/asset-code.errors';
import { AssetCodeRepo } from '../../../src/modules/devices/asset-code/asset-code.repo';
import { AssetCodeService } from '../../../src/modules/devices/asset-code/asset-code.service';
import { Barrier } from '../../support/concurrency-harness';
import {
  type DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';
import { testConfig } from '../../support/test-config';

const isDeadlockError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '40P01';

/** Redesign wave 2, W2-02 (c) (d): the counter behind the asset code `TYPE-YY-NNNN`, on a real PostgreSQL. */
describe('the counter of asset codes (integration, real PostgreSQL)', () => {
  let database: DisposableDatabase;
  let prisma: PrismaService;
  let runner: TransactionRunner;
  let service: AssetCodeService;

  const lastValue = async (type: string, year: number): Promise<number | null> => {
    const rows = await prisma.$queryRaw<{ last_value: number }[]>`
      SELECT last_value FROM device_code_counters WHERE device_type = ${type}::"DeviceType" AND year = ${year}::smallint`;

    return rows.length === 0 ? null : rows[0].last_value;
  };

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    const config = testConfig({ DATABASE_URL: database.url });
    prisma = new PrismaService(config);
    runner = new TransactionRunner(prisma, config);
    service = new AssetCodeService(new AssetCodeRepo());
  }, 240000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (database) await dropDisposableDatabase(database);
  });

  it('starts a type at 0001 in a year and counts up, each type and each year on its own', async () => {
    const next = (type: 'LAP' | 'PC' | 'OTH', day: string) => runner.run((tx) => service.next(tx, type, day));

    expect(await next('LAP', '2041-03-01')).toBe('LAP-41-0001');
    expect(await next('LAP', '2041-09-30')).toBe('LAP-41-0002');
    expect(await next('PC', '2041-03-01')).toBe('PC-41-0001');
    expect(await next('LAP', '2042-01-01')).toBe('LAP-42-0001');
    expect(await lastValue('LAP', 2041)).toBe(2);
  });

  it('gives two transactions that ask at once the codes 0001 and 0002, never the same one and never a deadlock (20 rounds)', async () => {
    for (let round = 0; round < 20; round += 1) {
      const year = 2050 + round;
      // The row of the counter already exists: a row that is made by the first of the two is waited for by the second whatever the lock on
      // the read is, so only a row that exists shows whether the read of the counter is locked.
      await prisma.$executeRaw`INSERT INTO device_code_counters (device_type, year, last_value) VALUES ('LAP', ${year}::smallint, 0)`;
      const barrier = new Barrier(2);
      const ask = async (): Promise<string> => {
        await barrier.wait();

        return runner.run((tx) => service.next(tx, 'LAP', `${year}-06-15`));
      };

      const outcomes = await Promise.allSettled([ask(), ask()]);

      for (const outcome of outcomes) {
        expect(outcome.status).toBe('fulfilled');
        if (outcome.status === 'rejected') expect(isDeadlockError(outcome.reason)).toBe(false);
      }
      const codes = outcomes.map((outcome) => (outcome.status === 'fulfilled' ? outcome.value : '')).sort();
      const yy = String(year % 100);

      expect(codes).toEqual([`LAP-${yy}-0001`, `LAP-${yy}-0002`]);
    }
  }, 120000);

  it('gives the number back when the transaction that took it rolls back', async () => {
    await expect(
      runner.run(async (tx) => {
        expect(await service.next(tx, 'OTH', '2045-05-05')).toBe('OTH-45-0001');
        throw new Error('the machine could not be entered');
      }),
    ).rejects.toThrow('the machine could not be entered');

    expect(await runner.run((tx) => service.next(tx, 'OTH', '2045-05-05'))).toBe('OTH-45-0001');
  });

  it('answers that no code is left once the last number was issued, and leaves the counter as it is', async () => {
    await prisma.$executeRaw`INSERT INTO device_code_counters (device_type, year, last_value) VALUES ('LAP', 2046, 9998)`;

    expect(await runner.run((tx) => service.next(tx, 'LAP', '2046-02-02'))).toBe('LAP-46-9999');
    await expect(runner.run((tx) => service.next(tx, 'LAP', '2046-02-03'))).rejects.toBeInstanceOf(
      DeviceAssetCodeExhaustedError,
    );
    expect(await lastValue('LAP', 2046)).toBe(9999);
    // The next year is a new count.
    expect(await runner.run((tx) => service.next(tx, 'LAP', '2047-01-01'))).toBe('LAP-47-0001');
  });

  it('uses the organization time zone on Dec 31 so UTC rollover still issues the local year code', async () => {
    const dec31Local = businessDateAt(new Date('2026-12-31T16:59:59.000Z'), 'Asia/Ho_Chi_Minh');
    const jan01Local = businessDateAt(new Date('2026-12-31T17:00:00.000Z'), 'Asia/Ho_Chi_Minh');
    const utcMomentDec31Later = businessDateAt(new Date('2026-12-31T18:00:00.000Z'), 'UTC');

    expect(dec31Local).toBe('2026-12-31');
    expect(jan01Local).toBe('2027-01-01');
    expect(utcMomentDec31Later).toBe('2026-12-31');

    expect(await runner.run((tx) => service.next(tx, 'PC', dec31Local))).toBe('PC-26-0001');
    expect(await runner.run((tx) => service.next(tx, 'PC', jan01Local))).toBe('PC-27-0001');
  });
});
