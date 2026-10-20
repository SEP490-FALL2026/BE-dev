import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { DatabaseEnvironmentVariables } from '../config/env-schema';
import { createPostgresPool } from './pg-pool';
import { DATABASE_SESSION_OPTIONS, DatabaseSessionOptions } from './read-only-session.module';

const logger = new Logger('PrismaService');

/**
 * Startup parameters of every connection. The adapter reads and writes timestamptz as if the session zone were UTC. On
 * a server whose default TimeZone is anything else, every instant is silently shifted by the offset (observed on a
 * PostgreSQL started in Asia/Bangkok), so the zone is pinned per connection and the result does not depend on how the
 * server was installed. A read-only command graph (ReadOnlyDatabaseSessionModule) also opens every transaction
 * read-only, so the server itself refuses any write.
 */
export function postgresSessionOptions(session: DatabaseSessionOptions | undefined): string {
  return session?.readOnly ? '-c TimeZone=UTC -c default_transaction_read_only=on' : '-c TimeZone=UTC';
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(
    config: ConfigService<DatabaseEnvironmentVariables, true>,
    @Optional() @Inject(DATABASE_SESSION_OPTIONS) session?: DatabaseSessionOptions,
  ) {
    // DATABASE_URL is already resolved per environment by validateEnvironment, so this
    // adapter has nothing left to decide.
    const pool = createPostgresPool(
      {
        connectionString: config.get('DATABASE_URL', { infer: true }),
        options: postgresSessionOptions(session),
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
