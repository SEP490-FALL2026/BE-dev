import { PrismaService } from '../../../src/infrastructure/database/prisma.service';
import {
  TransactionRunner,
  TransientDatabaseError,
  toTransientError,
} from '../../../src/infrastructure/database/transaction-runner';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';
import { PgRelay } from '../../support/pg-relay';
import { testConfig } from '../../support/test-config';

describe('database unavailable (integration)', () => {
  let database: DisposableDatabase;
  let relay: PgRelay;
  let prisma: PrismaService;
  let runner: TransactionRunner;

  const settings = {
    DB_LOCK_TIMEOUT_MS: 500,
    DB_STATEMENT_TIMEOUT_MS: 1500,
    DB_TRANSACTION_TIMEOUT_MS: 4000,
    DB_TRANSACTION_MAX_WAIT_MS: 2000,
    DB_CONNECT_TIMEOUT_MS: 1000,
    DB_QUERY_TIMEOUT_MS: 2000,
  };

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    const direct = new URL(database.url);
    relay = await PgRelay.start(direct.hostname, Number(direct.port || 5432));
    direct.port = String(relay.port);
    prisma = new PrismaService(testConfig({ ...settings, DATABASE_URL: direct.toString() }));
    runner = new TransactionRunner(prisma, testConfig(settings));
  }, 60000);

  afterAll(async () => {
    relay?.resume();
    await prisma?.$disconnect();
    await relay?.stop();
    if (database) await dropDisposableDatabase(database);
  });

  it('answers while the database is reachable', async () => {
    const rows = await prisma.$queryRaw<{ one: number }[]>`SELECT 1 AS one`;
    expect(rows[0].one).toBe(1);
  });

  it('ends a request on an unresponsive database within the client-side limit as a transient error', async () => {
    relay.pause();
    const startedAt = Date.now();
    try {
      await expect(runner.run((tx) => tx.$queryRaw`SELECT 1`)).rejects.toBeInstanceOf(TransientDatabaseError);
      expect(Date.now() - startedAt).toBeLessThan(5000);
    } finally {
      relay.resume();
    }
  }, 15000);

  it('ends a bare query on an unresponsive database as a transient error too', async () => {
    relay.pause();
    const startedAt = Date.now();
    try {
      const outcome = await prisma.$queryRaw`SELECT 1`.catch((error: unknown) => error);
      expect(toTransientError(outcome)).toBeInstanceOf(TransientDatabaseError);
      expect(Date.now() - startedAt).toBeLessThan(5000);
    } finally {
      relay.resume();
    }
  }, 15000);

  it('recovers by itself once the database answers again', async () => {
    const rows = await runner.run((tx) => tx.$queryRaw<{ one: number }[]>`SELECT 1 AS one`);
    expect(rows[0].one).toBe(1);
  }, 15000);
});
