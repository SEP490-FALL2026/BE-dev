import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { DatabaseEnvironmentVariables } from '../config/env-schema';
import { createPostgresPool } from './pg-pool';

const logger = new Logger('PrismaService');

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<DatabaseEnvironmentVariables, true>) {
    // DATABASE_URL is already resolved per environment by validateEnvironment, so this
    // adapter has nothing left to decide.
    const pool = createPostgresPool(
      {
        connectionString: config.get('DATABASE_URL', { infer: true }),
        // The adapter reads and writes timestamptz as if the session zone were UTC. On a server
        // whose default TimeZone is anything else, every instant is silently shifted by the offset
        // (observed on a PostgreSQL started in Asia/Bangkok). Pin the zone per connection so the
        // result does not depend on how the database server was installed.
        options: '-c TimeZone=UTC',
        // statement_timeout (TransactionRunner) is enforced by the server, so it cannot fire when
        // the server never answers (paused container, dropped network path). These two limits are
        // enforced here, so such a request fails in bounded time instead of waiting forever (R-02).
        // A connection whose query timed out retires itself (pg-pool.ts, N-1).
        connectionTimeoutMillis: config.get('DB_CONNECT_TIMEOUT_MS', { infer: true }),
        query_timeout: config.get('DB_QUERY_TIMEOUT_MS', { infer: true }),
        // Server-side backstop: PostgreSQL ends a session left idle inside a transaction.
        idle_in_transaction_session_timeout: config.get('DB_IDLE_IN_TRANSACTION_TIMEOUT_MS', { infer: true }),
        // Lets the operating system notice a dead peer on an idle pooled connection.
        keepAlive: true,
      },
      {
        onRetire: () =>
          logger.warn(
            'A database connection was retired (client-side query timeout, or released inside a transaction)',
          ),
      },
    );
    // The service owns this pool, so $disconnect ends it too.
    const adapter = new PrismaPg(pool, { disposeExternalPool: true });
    super({ adapter });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
