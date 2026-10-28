/**
 * The role matrix of H7 as pure rules over facts read from the PostgreSQL catalog (spec
 * `docs/workspace/items/h7-postgresql-runtime-role-separation`). `ops:db-roles` judges the deploy/runtime pair; the API
 * and the worker judge their own login at start-up. No I/O here, so every rule has a unit test of its own.
 */

/** Table privileges the runtime role holds on every application table. */
const RUNTIME_DML = ['DELETE', 'INSERT', 'SELECT', 'UPDATE'];

/**
 * Tables whose runtime privileges differ from plain DML: Prisma's migration history (written by the deploy role only)
 * and the append-only Audit Trail (`INV-05`; its triggers refuse UPDATE/DELETE/TRUNCATE, the privileges refuse them first).
 */
export const RUNTIME_TABLE_EXCEPTIONS: Readonly<Record<string, readonly string[]>> = {
  _prisma_migrations: [],
  audit_events: ['INSERT', 'SELECT'],
  // The basis of an owner assignment is evidence added by a command and never changed (its triggers refuse it first).
  subscription_owner_assignments: ['INSERT', 'SELECT'],
  // The same for the two records of QĐ-87d(1): the basis of a link made by procedure, and the one activation row.
  cost_center_department_links: ['INSERT', 'SELECT'],
  cost_center_direction_activations: ['INSERT', 'SELECT'],
  // The approval ticket of an event about the Super Admin (spec L.2) and the history of the edits of a budget version (F66) are
  // added to and never changed or deleted (their triggers refuse it first).
  super_admin_event_tickets: ['INSERT', 'SELECT'],
  budget_version_history: ['INSERT', 'SELECT'],
};

export interface RoleFacts {
  name: string;
  superuser: boolean;
  createdb: boolean;
  createrole: boolean;
  replication: boolean;
  bypassrls: boolean;
  canLogin: boolean;
  /** Roles this one is a member of. */
  memberOf: number;
  /** Roles that are members of this one. */
  members: number;
  /** `ALTER ROLE … SET` entries, in any database (one could set `session_replication_role`). */
  settings: number;
}

export interface SeparationFacts {
  deploy: RoleFacts | null;
  runtime: RoleFacts | null;
  databaseOwner: string;
  /** Relations, routines, types and schemas of this database owned by the runtime role. */
  runtimeOwnedObjects: number;
  /** Objects of schema `public` (extension members aside) owned by another role than the deploy role: `kind name (owner)`. */
  foreignOwnedObjects: string[];
  /** Effective privileges of the runtime role (PUBLIC included) on every table, view and foreign table of `public`. */
  tables: { name: string; privileges: string[] }[];
  sequences: { name: string; privileges: string[] }[];
  schemaPrivileges: string[];
  databasePrivileges: string[];
  /** What the deploy role's default privileges give the runtime role on future tables and sequences of `public`. */
  defaultPrivileges: { tables: string[]; sequences: string[] };
  securityDefinerRoutines: string[];
}

export interface RoleFinding {
  code: string;
  subject?: string;
}

const ATTRIBUTES = [
  ['superuser', 'SUPERUSER'],
  ['createdb', 'CREATEDB'],
  ['createrole', 'CREATEROLE'],
  ['replication', 'REPLICATION'],
  ['bypassrls', 'BYPASSRLS'],
] as const;

const sorted = (values: readonly string[]): string[] => [...values].sort();
const sameSet = (left: readonly string[], right: readonly string[]): boolean =>
  sorted(left).join(',') === sorted(right).join(',');
const describe = (values: readonly string[]): string => (values.length ? sorted(values).join(', ') : 'none');

/** A login role of the matrix: no elevated attribute, no membership either way, no per-role setting. */
export function judgeRole(prefix: 'DEPLOY' | 'RUNTIME', role: RoleFacts | null): RoleFinding[] {
  if (!role) return [{ code: `${prefix}_ROLE_MISSING` }];
  const findings: RoleFinding[] = ATTRIBUTES.filter(([key]) => role[key]).map(([, code]) => ({
    code: `${prefix}_${code}`,
  }));
  if (!role.canLogin) findings.push({ code: `${prefix}_NO_LOGIN` });
  if (role.memberOf > 0 || role.members > 0) findings.push({ code: `${prefix}_MEMBERSHIP` });
  if (role.settings > 0) findings.push({ code: `${prefix}_ROLE_SETTINGS` });
  return findings;
}

function exact(code: string, subject: string, actual: readonly string[], expected: readonly string[]): RoleFinding[] {
  return sameSet(actual, expected)
    ? []
    : [{ code, subject: `${subject}: expected ${describe(expected)}, has ${describe(actual)}` }];
}

/** Every way the deploy/runtime pair differs from the matrix; empty means the separation holds. */
export function judgeSeparation(facts: SeparationFacts): RoleFinding[] {
  const findings = [...judgeRole('DEPLOY', facts.deploy), ...judgeRole('RUNTIME', facts.runtime)];
  if (!facts.runtime) return findings;

  if (facts.deploy && facts.databaseOwner !== facts.deploy.name) findings.push({ code: 'DEPLOY_NOT_DATABASE_OWNER' });
  if (facts.runtimeOwnedObjects > 0) findings.push({ code: 'RUNTIME_OWNS_OBJECTS' });
  findings.push(...facts.foreignOwnedObjects.map((subject) => ({ code: 'OBJECT_NOT_OWNED_BY_DEPLOY', subject })));
  for (const table of facts.tables) {
    findings.push(
      ...exact(
        'RUNTIME_TABLE_PRIVILEGES',
        table.name,
        table.privileges,
        RUNTIME_TABLE_EXCEPTIONS[table.name] ?? RUNTIME_DML,
      ),
    );
  }
  for (const sequence of facts.sequences) {
    findings.push(...exact('RUNTIME_SEQUENCE_PRIVILEGES', sequence.name, sequence.privileges, ['USAGE']));
  }
  findings.push(...exact('RUNTIME_SCHEMA_PRIVILEGES', 'public', facts.schemaPrivileges, ['USAGE']));
  findings.push(...exact('RUNTIME_DATABASE_PRIVILEGES', 'database', facts.databasePrivileges, ['CONNECT']));
  findings.push(...exact('DEFAULT_PRIVILEGES_TABLES', 'future tables', facts.defaultPrivileges.tables, RUNTIME_DML));
  findings.push(
    ...exact('DEFAULT_PRIVILEGES_SEQUENCES', 'future sequences', facts.defaultPrivileges.sequences, ['USAGE']),
  );
  findings.push(...facts.securityDefinerRoutines.map((subject) => ({ code: 'SECURITY_DEFINER_ROUTINE', subject })));

  return findings;
}

/** What the API or the worker reads about its own login (`current_user`) before it does any work. */
export interface RuntimeIdentityFacts {
  role: string;
  superuser: boolean;
  createdb: boolean;
  createrole: boolean;
  replication: boolean;
  bypassrls: boolean;
  memberships: number;
  ownsDatabase: boolean;
  /** Relations, routines, types and schemas of this database it owns: an owner is the deploy role, not the runtime one. */
  ownedObjects: number;
  /** `origin` unless something set `replica`/`local`, which silences the triggers that hold the invariants. */
  sessionReplicationRole: string;
}

/** The reasons the login must not serve the API or the worker; empty means it is a runtime role. */
export function judgeRuntimeIdentity(facts: RuntimeIdentityFacts): string[] {
  const reasons: string[] = ATTRIBUTES.filter(([key]) => facts[key]).map(([, code]) => code);
  if (facts.memberships > 0) reasons.push('MEMBERSHIP');
  if (facts.ownsDatabase) reasons.push('OWNS_DATABASE');
  if (facts.ownedObjects > 0) reasons.push('OWNS_OBJECTS');
  if (facts.sessionReplicationRole !== 'origin') reasons.push('SESSION_REPLICATION_ROLE');
  return reasons;
}
