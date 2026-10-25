import { Client } from 'pg';
import { writeCliFailure as fail } from './infrastructure/cli/cli-runtime';
import {
  DatabaseRoleReport,
  provisionDatabaseRoles,
  reconcileDatabaseRoles,
  verifyDatabaseRoles,
} from './infrastructure/database/roles/database-role-provisioning';
import {
  DatabaseRoleSettingsError,
  PostgresLogin,
  readProvisionSettings,
  readReconcileSettings,
} from './infrastructure/database/roles/database-role-settings';
import {
  DATABASE_ROLES_USAGE,
  DatabaseRolesArgumentError,
  parseDatabaseRolesArguments,
} from './infrastructure/database/roles/database-roles.arguments';
import { databaseRolesJson, formatDatabaseRoles } from './infrastructure/database/roles/database-roles-report';

/** Exit codes are part of the command's contract (see --help); the deploy workflow stops on anything but 0. */
const EXIT = { done: 0, failed: 1, refused: 2 } as const;

/** The error's name, SQLSTATE and first line, with anything that looks like a URL or a SCRAM verifier masked. */
function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error';
  const code = (error as { code?: unknown }).code;
  const line = error.message
    .split('\n')[0]
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '<url>')
    .replace(/SCRAM-SHA-256\$\S+/g, '<verifier>');
  return `${error.name}${typeof code === 'string' ? ` [${code}]` : ''}: ${line}`;
}

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseDatabaseRolesArguments(process.argv.slice(2));
  } catch (error) {
    if (error instanceof DatabaseRolesArgumentError) return fail(`${error.message}\n\n${DATABASE_ROLES_USAGE}`);
    throw error;
  }
  if (parsed.help) {
    process.stdout.write(`${DATABASE_ROLES_USAGE}\n`);
    return EXIT.done;
  }
  const { command } = parsed;

  // The settings are read before any connection: an incomplete or aliased set is refused without touching the server.
  let run: (client: Client) => Promise<DatabaseRoleReport>;
  let login: PostgresLogin;
  try {
    if (command === 'provision') {
      const settings = readProvisionSettings(process.env);
      login = settings.bootstrap;
      run = (client) => provisionDatabaseRoles(client, settings);
    } else {
      const settings = readReconcileSettings(process.env);
      login = settings.connection;
      run = (client) =>
        command === 'reconcile'
          ? reconcileDatabaseRoles(client, settings.runtimeRole)
          : verifyDatabaseRoles(client, settings.runtimeRole);
    }
  } catch (error) {
    if (error instanceof DatabaseRoleSettingsError) return fail(`ops:db-roles ${command} refused: ${error.message}`);
    throw error;
  }

  const client = new Client({
    connectionString: login.connectionString,
    port: Number(login.port),
    connectionTimeoutMillis: 10000,
    application_name: 'slm-db-roles',
  });
  try {
    await client.connect();
    const report = await run(client);
    process.stdout.write(parsed.json ? databaseRolesJson(report) : formatDatabaseRoles(report));
    return report.outcome === 'DONE' || report.outcome === 'CONSISTENT' ? EXIT.done : EXIT.refused;
  } catch (error) {
    return fail(`ops:db-roles ${command} failed: ${describeFailure(error)}`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`ops:db-roles failed: ${describeFailure(error)}\n`);
    process.exitCode = EXIT.failed;
  },
);
