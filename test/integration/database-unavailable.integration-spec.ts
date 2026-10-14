import { createServer, connect, Server, Socket } from 'node:net';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import {
  TransactionRunner,
  TransientDatabaseError,
  toTransientError,
} from '../../src/infrastructure/database/transaction-runner';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';
import { testConfig } from '../support/test-config';

/**
 * A TCP relay in front of PostgreSQL. `pause()` keeps every connection open but stops delivering
 * bytes in both directions, which is what `docker pause` or a dropped network path looks like to
 * the client: no error, no answer. `resume()` flushes what was held back.
 */
class PausableRelay {
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();
  private paused = false;
  private held: Array<() => void> = [];

  private constructor(
    private readonly upstreamHost: string,
    private readonly upstreamPort: number,
  ) {
    this.server = createServer((client) => this.accept(client));
  }

  static async start(upstreamHost: string, upstreamPort: number): Promise<PausableRelay> {
    const relay = new PausableRelay(upstreamHost, upstreamPort);
    await new Promise<void>((resolve) => relay.server.listen(0, '127.0.0.1', resolve));
    return relay;
  }

  get port(): number {
    const address = this.server.address();
    if (address === null || typeof address === 'string') throw new Error('relay is not listening');
    return address.port;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    const flush = this.held;
    this.held = [];
    for (const deliver of flush) deliver();
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private accept(client: Socket): void {
    const upstream = connect(this.upstreamPort, this.upstreamHost);
    this.sockets.add(client).add(upstream);
    const relay = (from: Socket, to: Socket) => {
      from.on('data', (chunk: Buffer) => {
        const deliver = () => {
          if (!to.destroyed) to.write(chunk);
        };
        if (this.paused) this.held.push(deliver);
        else deliver();
      });
      from.on('close', () => to.destroy());
      from.on('error', () => to.destroy());
    };
    relay(client, upstream);
    relay(upstream, client);
  }
}

describe('database unavailable (integration)', () => {
  let database: DisposableDatabase;
  let relay: PausableRelay;
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
    relay = await PausableRelay.start(direct.hostname, Number(direct.port || 5432));
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
