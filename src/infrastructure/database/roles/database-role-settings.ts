/**
 * The settings of `ops:db-roles`, read from the environment as one set. Every message names a variable and a rule,
 * never a value: no password and no URL is ever echoed.
 */

export class DatabaseRoleSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseRoleSettingsError';
  }
}

/** One PostgreSQL login of the set; `connectionString` is passed to the driver and never printed. */
export interface PostgresLogin {
  role: string;
  password: string;
  host: string;
  port: string;
  database: string;
  connectionString: string;
}

export interface ProvisionSettings {
  database: string;
  /** The cluster superuser (`POSTGRES_USER` of the image); the only login of the set that connects. */
  bootstrap: PostgresLogin;
  deploy: PostgresLogin;
  runtime: PostgresLogin;
}

export interface ReconcileSettings {
  /** The deploy role, which owns the schema (`DATABASE_URL` of the `migrate` service). */
  connection: PostgresLogin;
  runtimeRole: string;
}

/** A role the commands create or name: lowercase, at most 63 bytes, never one of PostgreSQL's reserved `pg_` roles. */
const ROLE_NAME = /^(?!pg_)[a-z_][a-z0-9_]{0,62}$/;
const DATABASE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
/** Printable ASCII without a space: SCRAM's SASLprep leaves it unchanged, so the verifier matches what the client sends. */
const MANAGED_PASSWORD = /^[\x21-\x7e]{32,1024}$/;

function fail(name: string, rule: string): never {
  throw new DatabaseRoleSettingsError(`${name} ${rule}`);
}

/** The value of variable `name` as a PostgreSQL URL to exactly one host, with nothing that could redirect it. */
function parsePostgresUrl(value: string, name: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail(name, 'must be a PostgreSQL URL (scheme postgresql or postgres)');
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:')
    fail(name, 'must be a PostgreSQL URL (scheme postgresql or postgres)');
  // A query (host=, user=, passfile=…) or a fragment could redirect the connection away from what the rest checks.
  if (url.search || url.hash) fail(name, 'must not carry a query or a fragment');
  if (!url.hostname || url.hostname.includes(',')) fail(name, 'must name exactly one host');

  return url;
}

function readLogin(environment: Record<string, string | undefined>, name: string): PostgresLogin {
  const value = environment[name];
  if (!value) fail(name, 'is required');

  const url = parsePostgresUrl(value, name);
  const role = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!ROLE_NAME.test(role)) fail(name, 'must name a role of lowercase letters, digits and _ (not pg_…)');
  // Without one the driver would fall back to PGPASSWORD or a password file: never use a credential not named here.
  if (!password) fail(name, 'must carry the password of its role');
  if (!DATABASE_NAME.test(database)) fail(name, 'must name one database of letters, digits and _');

  return {
    role,
    password,
    host: url.hostname.toLowerCase(),
    port: url.port || '5432',
    database,
    connectionString: value,
  };
}

/** `provision`: the bootstrap login connects; the deploy and runtime logins give the roles and passwords to set. */
export function readProvisionSettings(environment: Record<string, string | undefined>): ProvisionSettings {
  const bootstrap = readLogin(environment, 'DATABASE_BOOTSTRAP_URL');
  const deploy = readLogin(environment, 'DATABASE_DEPLOY_URL');
  const runtime = readLogin(environment, 'DATABASE_RUNTIME_URL');

  for (const [name, login] of [
    ['DATABASE_DEPLOY_URL', deploy],
    ['DATABASE_RUNTIME_URL', runtime],
  ] as const) {
    if (!MANAGED_PASSWORD.test(login.password))
      fail(name, 'must carry a password of 32 to 1024 printable ASCII characters without spaces');
  }
  const logins = [bootstrap, deploy, runtime];
  if (
    logins.some(
      (login) =>
        `${login.host}:${login.port}/${login.database}` !== `${bootstrap.host}:${bootstrap.port}/${bootstrap.database}`,
    )
  )
    fail(
      'DATABASE_BOOTSTRAP_URL, DATABASE_DEPLOY_URL and DATABASE_RUNTIME_URL',
      'must name the same host, port and database',
    );
  if (new Set(logins.map((login) => login.role)).size !== 3)
    fail('DATABASE_BOOTSTRAP_URL, DATABASE_DEPLOY_URL and DATABASE_RUNTIME_URL', 'must name three different roles');
  if (new Set(logins.map((login) => login.password)).size !== 3)
    fail(
      'DATABASE_BOOTSTRAP_URL, DATABASE_DEPLOY_URL and DATABASE_RUNTIME_URL',
      'must carry three different passwords',
    );

  return { database: bootstrap.database, bootstrap, deploy, runtime };
}

/** `reconcile` and `verify`: connect as the deploy role (`DATABASE_URL`) and name the runtime role. */
export function readReconcileSettings(environment: Record<string, string | undefined>): ReconcileSettings {
  const connection = readLogin(environment, 'DATABASE_URL');
  const runtimeRole = environment.DATABASE_RUNTIME_ROLE;
  if (!runtimeRole) fail('DATABASE_RUNTIME_ROLE', 'is required');
  if (!ROLE_NAME.test(runtimeRole))
    fail('DATABASE_RUNTIME_ROLE', 'must name a role of lowercase letters, digits and _ (not pg_…)');
  if (runtimeRole === connection.role) fail('DATABASE_RUNTIME_ROLE', 'must be different from the role of DATABASE_URL');

  return { connection, runtimeRole };
}
