import { Global, Module } from '@nestjs/common';

/** How the PostgreSQL sessions of a graph are opened. Absent means the default read-write session. */
export interface DatabaseSessionOptions {
  readOnly: boolean;
}

export const DATABASE_SESSION_OPTIONS = Symbol('DATABASE_SESSION_OPTIONS');

/**
 * For a command that must never write (operational-commands rule 1): every connection of the graph opens with
 * `default_transaction_read_only=on`, so PostgreSQL itself refuses any write (SQLSTATE 25006), even one a later change
 * slips into a query or a callback. Global so the one `PrismaService` of the graph sees it; only a read-only command
 * graph imports it, never the API, the worker or a command that writes (module-graph.spec.ts).
 */
@Global()
@Module({
  providers: [{ provide: DATABASE_SESSION_OPTIONS, useValue: { readOnly: true } satisfies DatabaseSessionOptions }],
  exports: [DATABASE_SESSION_OPTIONS],
})
export class ReadOnlyDatabaseSessionModule {}
