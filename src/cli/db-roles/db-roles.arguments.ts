import { parseArgs } from 'node:util';
import { DatabaseRoleCommand } from '../../infrastructure/database/roles/database-role-provisioning';

export class DatabaseRolesArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseRolesArgumentError';
  }
}

export const DATABASE_ROLES_USAGE = `Usage: pnpm ops:db-roles <provision | reconcile | verify> [--json]

Separates the PostgreSQL identities of a production database (H7, docs/guides/containers.md#postgresql-roles-h7): the
cluster superuser administers roles only, the deploy role owns the schema (migrations, preflight, backup), the runtime
role (API, worker) has DML on the application tables only. Never prints a URL or a password.

Commands
  provision   As the cluster superuser (DATABASE_BOOTSTRAP_URL): create or correct the deploy role and the runtime role
              with the passwords of DATABASE_DEPLOY_URL and DATABASE_RUNTIME_URL, give the database and every object of
              schema public to the deploy role, grant the runtime role and verify. Once per installation, after a
              restore, or to rotate a password. One transaction.
  reconcile   As the deploy role (DATABASE_URL) after every migration: grant the runtime role (DATABASE_RUNTIME_ROLE)
              again and verify. One transaction.
  verify      The checks of reconcile in a read-only transaction; writes nothing.

Options
  --json    One JSON object instead of the text report
  --help

Exit codes: 0 done or consistent · 2 refused or inconsistent, nothing written (every finding is named) · 1 error.`;

const COMMANDS: readonly DatabaseRoleCommand[] = ['provision', 'reconcile', 'verify'];
const OPTIONS = { json: { type: 'boolean' }, help: { type: 'boolean' } } as const;

export type ParsedDatabaseRolesArguments =
  { help: true } | { help: false; command: DatabaseRoleCommand; json: boolean };

/** One command and `--json`; `--help`. Anything else is refused. A leading `--` (forwarded by pnpm) is ignored. */
export function parseDatabaseRolesArguments(argv: readonly string[]): ParsedDatabaseRolesArguments {
  const args = argv[0] === '--' ? argv.slice(1) : [...argv];
  let parsed: { values: { json?: boolean; help?: boolean }; positionals: string[] };
  try {
    parsed = parseArgs({ args, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    throw new DatabaseRolesArgumentError(error instanceof Error ? error.message : String(error));
  }
  if (parsed.values.help) return { help: true };

  const [command, ...rest] = parsed.positionals;
  if (!COMMANDS.includes(command as DatabaseRoleCommand) || rest.length > 0) {
    throw new DatabaseRolesArgumentError('Name exactly one command: provision, reconcile or verify.');
  }
  return { help: false, command: command as DatabaseRoleCommand, json: parsed.values.json === true };
}
