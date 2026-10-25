import type { ClientBase } from 'pg';
import {
  currentRole,
  databaseOwner,
  foreignOwnedObjects,
  publicSchemaOwner,
  readRole,
  readSeparationFacts,
} from './database-role-catalog';
import { RUNTIME_TABLE_EXCEPTIONS, RoleFinding, judgeRole, judgeSeparation } from '../database-role-judgement';
import { ProvisionSettings } from './database-role-settings';
import { scramSha256Verifier } from './scram-verifier';

/**
 * The three workflows of `ops:db-roles` (H7, docs/guides/containers.md#postgresql-roles-h7). Each is one transaction that
 * ends with `judgeSeparation` on what it is about to commit: any finding rolls everything back, so a run either leaves the
 * role matrix complete or leaves the database as it found it.
 */

export type DatabaseRoleCommand = 'provision' | 'reconcile' | 'verify';
/** DONE: changed and verified · CONSISTENT: verified, nothing written · REFUSED: a precondition failed, nothing written ·
 *  INCONSISTENT: verification failed, nothing written. */
export type DatabaseRoleOutcome = 'DONE' | 'CONSISTENT' | 'REFUSED' | 'INCONSISTENT';

export interface DatabaseRoleReport {
  command: DatabaseRoleCommand;
  outcome: DatabaseRoleOutcome;
  database: string;
  deployRole: string;
  runtimeRole: string;
  createdRoles: string[];
  databaseOwnerChanged: boolean;
  transferredObjects: number;
  findings: RoleFinding[];
}

const quote = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`;
const ROLE_ATTRIBUTES = 'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT';

/**
 * The privileges of the matrix, idempotent: each grant is preceded by a revoke of everything on the same objects, so a
 * stray privilege (TRUNCATE, TEMPORARY, CREATE…) disappears and a second run yields the same ACLs. Run by the deploy role
 * (owner of every object) or by the bootstrap superuser on its behalf.
 */
export function grantStatements(
  database: string,
  deploy: string,
  runtime: string,
  presentExceptions: string[],
): string[] {
  const [db, owner, role] = [database, deploy, runtime].map(quote);
  return [
    `REVOKE ALL ON DATABASE ${db} FROM PUBLIC`,
    `REVOKE ALL ON DATABASE ${db} FROM ${role}`,
    `GRANT CONNECT ON DATABASE ${db} TO ${role}`,
    'REVOKE ALL ON SCHEMA public FROM PUBLIC',
    `REVOKE ALL ON SCHEMA public FROM ${role}`,
    `GRANT USAGE ON SCHEMA public TO ${role}`,
    'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC',
    `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${role}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
    ...presentExceptions.flatMap((table) => [
      `REVOKE ALL ON TABLE public.${quote(table)} FROM ${role}`,
      ...(RUNTIME_TABLE_EXCEPTIONS[table].length > 0
        ? [`GRANT ${RUNTIME_TABLE_EXCEPTIONS[table].join(', ')} ON TABLE public.${quote(table)} TO ${role}`]
        : []),
    ]),
    'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC',
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${role}`,
    `GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
    // Future objects of the deploy role (the next migration) are usable by the runtime role before any reconcile.
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public REVOKE ALL ON TABLES FROM ${role}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ${role}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public GRANT USAGE ON SEQUENCES TO ${role}`,
  ];
}

async function presentExceptions(client: ClientBase): Promise<string[]> {
  const { rows } = await client.query<{ name: string }>(
    `SELECT c.relname AS name FROM pg_class c
      WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY($1::text[]) ORDER BY 1`,
    [Object.keys(RUNTIME_TABLE_EXCEPTIONS)],
  );
  return rows.map((row) => row.name);
}

async function currentDatabase(client: ClientBase): Promise<string> {
  const { rows } = await client.query<{ name: string }>('SELECT current_database() AS name');
  return rows[0].name;
}

/** What a workflow decided: its report, and whether the transaction may commit. */
interface Decision {
  report: DatabaseRoleReport;
  commit: boolean;
}

/** Runs `work` in one transaction, committed only when it says so; any throw or `commit: false` rolls back. */
async function transaction(
  client: ClientBase,
  readOnly: boolean,
  work: () => Promise<Decision>,
): Promise<DatabaseRoleReport> {
  await client.query(readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
  try {
    // Bounded: a live session holding a table must not leave the command waiting for ever.
    await client.query(`SET LOCAL lock_timeout = '10s'`);
    await client.query(`SET LOCAL statement_timeout = '120s'`);
    const decision = await work();
    await client.query(decision.commit && !readOnly ? 'COMMIT' : 'ROLLBACK');
    return decision.report;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function applyGrants(client: ClientBase, deploy: string, runtime: string): Promise<void> {
  for (const statement of grantStatements(
    await currentDatabase(client),
    deploy,
    runtime,
    await presentExceptions(client),
  )) {
    await client.query(statement);
  }
}

/** Gives every foreign-owned object of `public` to the deploy role; returns how many. */
async function transferOwnership(client: ClientBase, deploy: string): Promise<number> {
  const transfers = await foreignOwnedObjects(client, deploy);
  for (const transfer of transfers) await client.query(transfer.statement);
  return transfers.length;
}

/**
 * `provision`, as the bootstrap superuser: creates or corrects both roles (password as a SCRAM verifier), makes the deploy
 * role the owner of the database and of every object of `public`, grants the matrix and verifies it. Refuses, writing
 * nothing, a bootstrap that is not a superuser and an existing role with an elevated attribute, a membership or a setting:
 * those are not silently demoted.
 */
export async function provisionDatabaseRoles(
  client: ClientBase,
  settings: ProvisionSettings,
  verifier: (password: string) => string = scramSha256Verifier,
): Promise<DatabaseRoleReport> {
  const { deploy, runtime } = settings;
  const report: DatabaseRoleReport = {
    command: 'provision',
    outcome: 'DONE',
    database: settings.database,
    deployRole: deploy.role,
    runtimeRole: runtime.role,
    createdRoles: [],
    databaseOwnerChanged: false,
    transferredObjects: 0,
    findings: [],
  };

  return transaction(client, false, async () => {
    if (!(await currentRole(client)).superuser) {
      return {
        report: { ...report, outcome: 'REFUSED', findings: [{ code: 'BOOTSTRAP_NOT_SUPERUSER' }] },
        commit: false,
      };
    }
    const existing = [
      ['DEPLOY', deploy, await readRole(client, deploy.role)],
      ['RUNTIME', runtime, await readRole(client, runtime.role)],
    ] as const;
    const refusals = existing.flatMap(([prefix, , role]) =>
      role ? judgeRole(prefix, role).filter((finding) => finding.code !== `${prefix}_NO_LOGIN`) : [],
    );
    if (refusals.length > 0) return { report: { ...report, outcome: 'REFUSED', findings: refusals }, commit: false };

    for (const [, login, role] of existing) {
      // The verifier is a hash: neither the statement nor a server log of it carries the password.
      await client.query(
        `${role ? 'ALTER' : 'CREATE'} ROLE ${quote(login.role)} WITH ${ROLE_ATTRIBUTES} PASSWORD '${verifier(login.password)}'`,
      );
      if (!role) report.createdRoles.push(login.role);
    }
    if ((await databaseOwner(client)) !== deploy.role) {
      await client.query(`ALTER DATABASE ${quote(settings.database)} OWNER TO ${quote(deploy.role)}`);
      report.databaseOwnerChanged = true;
    }
    // PostgreSQL 15+ gives `public` to pg_database_owner (so to the new database owner); an older owner is moved.
    const schemaOwner = await publicSchemaOwner(client);
    if (schemaOwner !== null && schemaOwner !== 'pg_database_owner' && schemaOwner !== deploy.role) {
      await client.query(`ALTER SCHEMA public OWNER TO ${quote(deploy.role)}`);
    }
    report.transferredObjects = await transferOwnership(client, deploy.role);
    await applyGrants(client, deploy.role, runtime.role);

    const findings = judgeSeparation(await readSeparationFacts(client, deploy.role, runtime.role));
    return findings.length > 0
      ? { report: { ...report, outcome: 'INCONSISTENT', findings }, commit: false }
      : { report, commit: true };
  });
}

/**
 * `reconcile`, as the deploy role after `migrate deploy`: grants the matrix again (the history table a fresh deploy just
 * created, a new append-only table) and verifies it. Refuses a superuser (that is the bootstrap's `provision`) and a role
 * that does not own the database.
 */
export async function reconcileDatabaseRoles(client: ClientBase, runtimeRole: string): Promise<DatabaseRoleReport> {
  return deployRoleCommand(client, runtimeRole, 'reconcile');
}

/** `verify`: the same checks in a read-only transaction; writes nothing. */
export async function verifyDatabaseRoles(client: ClientBase, runtimeRole: string): Promise<DatabaseRoleReport> {
  return deployRoleCommand(client, runtimeRole, 'verify');
}

async function deployRoleCommand(
  client: ClientBase,
  runtimeRole: string,
  command: 'reconcile' | 'verify',
): Promise<DatabaseRoleReport> {
  const readOnly = command === 'verify';
  return transaction(client, readOnly, async () => {
    const me = await currentRole(client);
    const report: DatabaseRoleReport = {
      command,
      outcome: readOnly ? 'CONSISTENT' : 'DONE',
      database: await currentDatabase(client),
      deployRole: me.name,
      runtimeRole,
      createdRoles: [],
      databaseOwnerChanged: false,
      transferredObjects: 0,
      findings: [],
    };
    const refusals: RoleFinding[] = [];
    if (me.superuser) refusals.push({ code: 'DEPLOY_SUPERUSER' });
    if ((await databaseOwner(client)) !== me.name) refusals.push({ code: 'DEPLOY_NOT_DATABASE_OWNER' });
    if (!(await readRole(client, runtimeRole))) refusals.push({ code: 'RUNTIME_ROLE_MISSING' });
    if (refusals.length > 0) return { report: { ...report, outcome: 'REFUSED', findings: refusals }, commit: false };

    // An object the deploy role does not own cannot be granted by it: report it (provision repairs it) instead of
    // failing half-way through the grants.
    if (!readOnly && (await foreignOwnedObjects(client, me.name)).length === 0) {
      await applyGrants(client, me.name, runtimeRole);
    }
    const findings = judgeSeparation(await readSeparationFacts(client, me.name, runtimeRole));
    return findings.length > 0
      ? { report: { ...report, outcome: 'INCONSISTENT', findings }, commit: false }
      : { report, commit: !readOnly };
  });
}
