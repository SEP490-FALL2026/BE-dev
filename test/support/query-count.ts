import { PgRelay } from './pg-relay';

/** What ran while the work ran: its result and the SQL text of every executed statement, in order. */
export interface CountedStatements<T> {
  result: T;
  /** SQL text only, never bind values; transaction control and session settings included (see dataStatements). */
  statements: string[];
}

/** Transaction control and session settings: every request carries them, whatever the shape of its queries. */
const SESSION_STATEMENT =
  /^\s*(?:BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|SET\b|SELECT\s+set_config\b)/i;
/** A table after FROM or JOIN, bare or quoted, with or without its schema. */
const TABLE_REFERENCE = /\b(?:FROM|JOIN)\s+((?:"[^"]+"|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|[A-Za-z_][\w$]*))?)/gi;

/**
 * API-LIST-DETAIL.1 (LD-R3): counts the statements an application executes through a PgRelay, so a collection or
 * detail test can prove a constant number of statements, a direct projection and no per-row fan-out. Test-only: it
 * reads the relay's view of the wire, so the product's PrismaService, its logging and its dependencies stay unchanged.
 * Wire the application through the relay with createHttpTestApp({ appDatabaseUrl }); statements on other connections
 * that go through the same relay during `run` are counted too, so keep fixtures and assertions on the direct URL.
 */
export class QueryCounter {
  private constructor(private readonly relay: PgRelay) {}

  static on(relay: PgRelay): QueryCounter {
    return new QueryCounter(relay);
  }

  async run<T>(work: () => Promise<T>): Promise<CountedStatements<T>> {
    const statements: string[] = [];
    const stop = this.relay.observe((sql) => statements.push(sql));
    try {
      return { result: await work(), statements };
    } finally {
      stop();
    }
  }
}

/** The statements that read or write data: without transaction control and session settings. */
export function dataStatements(statements: readonly string[]): string[] {
  return statements.filter((statement) => !SESSION_STATEMENT.test(statement));
}

/** The tables a statement reads or joins, lower-case and without schema or quotes, in order of appearance. */
export function tablesOf(statement: string): string[] {
  return [...statement.matchAll(TABLE_REFERENCE)].map((match) => {
    const parts = match[1].split('.');
    return parts[parts.length - 1].trim().replace(/^"|"$/g, '').toLowerCase();
  });
}
