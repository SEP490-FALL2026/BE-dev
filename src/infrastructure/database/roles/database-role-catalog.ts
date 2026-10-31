import type { ClientBase } from 'pg';
import { RoleFacts, SeparationFacts } from '../database-role-judgement';

/**
 * Catalog reads of `ops:db-roles`. Every statement is constant SQL with bind parameters; identifiers that end up in
 * DDL are quoted by the server (`format('%I')`), never assembled from catalog strings here.
 */

type Rows<T> = Promise<T[]>;
const rows = async <T>(client: ClientBase, text: string, values: unknown[] = []): Rows<T> =>
  (await client.query<T & Record<string, unknown>>(text, values)).rows;

const EXTENSION_MEMBER = (catalog: string, column: string): string =>
  `EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = '${catalog}'::regclass AND d.objid = ${column} AND d.deptype = 'e')`;

export async function readRole(client: ClientBase, name: string): Promise<RoleFacts | null> {
  const [role] = await rows<RoleFacts>(
    client,
    `SELECT r.rolname AS name, r.rolsuper AS superuser, r.rolcreatedb AS createdb, r.rolcreaterole AS createrole,
            r.rolreplication AS replication, r.rolbypassrls AS bypassrls, r.rolcanlogin AS "canLogin",
            (SELECT count(*)::int FROM pg_auth_members m WHERE m.member = r.oid) AS "memberOf",
            (SELECT count(*)::int FROM pg_auth_members m WHERE m.roleid = r.oid) AS members,
            (SELECT count(*)::int FROM pg_db_role_setting s WHERE s.setrole = r.oid) AS settings
       FROM pg_roles r WHERE r.rolname = $1`,
    [name],
  );
  return role ?? null;
}

export async function currentRole(client: ClientBase): Promise<RoleFacts> {
  const [{ name }] = await rows<{ name: string }>(client, 'SELECT current_user AS name');
  return (await readRole(client, name)) as RoleFacts;
}

export async function databaseOwner(client: ClientBase): Promise<string> {
  const [{ owner }] = await rows<{ owner: string }>(
    client,
    'SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = current_database()',
  );
  return owner;
}

export async function publicSchemaOwner(client: ClientBase): Promise<string | null> {
  const [schema] = await rows<{ owner: string }>(
    client,
    `SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname = 'public'`,
  );
  return schema?.owner ?? null;
}

export interface OwnershipTransfer {
  kind: 'relation' | 'routine' | 'type';
  /** `kind name (owner)`, for the report. */
  subject: string;
  /** The `ALTER … OWNER TO` statement, built and quoted by the server. */
  statement: string;
}

/**
 * Every object of schema `public` not owned by `owner`, with the statement that gives it to `owner`: tables, views,
 * materialized views, sequences that no column owns (those follow their table), foreign tables, routines, enum/range/
 * composite types and domains. Extension members (btree_gist) stay with the extension.
 */
export async function foreignOwnedObjects(client: ClientBase, owner: string): Promise<OwnershipTransfer[]> {
  return rows<OwnershipTransfer>(
    client,
    `WITH target AS (SELECT oid FROM pg_roles WHERE rolname = $1)
     SELECT kind, subject, statement FROM (
       SELECT 'relation' AS kind,
              format('%s %s (%s)', CASE c.relkind WHEN 'S' THEN 'sequence' WHEN 'v' THEN 'view'
                     WHEN 'm' THEN 'materialized view' WHEN 'f' THEN 'foreign table' ELSE 'table' END,
                     c.relname, pg_get_userbyid(c.relowner)) AS subject,
              format('ALTER %s public.%I OWNER TO %I', CASE c.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW'
                     WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END, c.relname, $1::text)
                AS statement
         FROM pg_class c
        WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
          AND c.relowner <> (SELECT oid FROM target) AND NOT ${EXTENSION_MEMBER('pg_class', 'c.oid')}
          AND NOT (c.relkind = 'S' AND EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass
                                                 AND d.objid = c.oid AND d.deptype IN ('a', 'i')))
       UNION ALL
       SELECT 'routine',
              format('routine %s(%s) (%s)', p.proname, pg_get_function_identity_arguments(p.oid),
                     pg_get_userbyid(p.proowner)),
              format('ALTER ROUTINE public.%I(%s) OWNER TO %I', p.proname, pg_get_function_identity_arguments(p.oid),
                     $1::text)
         FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace AND p.proowner <> (SELECT oid FROM target)
          AND NOT ${EXTENSION_MEMBER('pg_proc', 'p.oid')}
       UNION ALL
       SELECT 'type',
              format('%s %s (%s)', CASE t.typtype WHEN 'd' THEN 'domain' ELSE 'type' END, t.typname,
                     pg_get_userbyid(t.typowner)),
              format('ALTER %s public.%I OWNER TO %I', CASE t.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END, t.typname,
                     $1::text)
         FROM pg_type t
        WHERE t.typnamespace = 'public'::regnamespace AND t.typowner <> (SELECT oid FROM target)
          AND t.typtype IN ('e', 'r', 'd', 'c')
          AND (t.typtype <> 'c' OR (SELECT c.relkind FROM pg_class c WHERE c.oid = t.typrelid) = 'c')
          AND NOT ${EXTENSION_MEMBER('pg_type', 't.oid')}
     ) objects ORDER BY kind, subject`,
    [owner],
  );
}

const TABLE_PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];
const SEQUENCE_PRIVILEGES = ['USAGE', 'SELECT', 'UPDATE'];

/** `array_remove(ARRAY[CASE WHEN has_x($1, object, 'P') THEN 'P' END, …], NULL)`: the privileges role $1 holds. */
const held = (check: string, object: string, privileges: readonly string[]): string =>
  `array_remove(ARRAY[${privileges.map((privilege) => `CASE WHEN ${check}($1, ${object}, '${privilege}') THEN '${privilege}' END`).join(', ')}], NULL)`;

// $1 is the runtime role in every statement below but the default privileges, which also name the deploy role ($2).

/** Relations, routines, types and schemas of this database the runtime role owns, and the database itself if it does. */
async function runtimeOwnedObjectCount(client: ClientBase, runtime: string): Promise<number> {
  const [owned] = await rows<{ count: number }>(
    client,
    `WITH r AS (SELECT oid FROM pg_roles WHERE rolname = $1)
     SELECT ((SELECT count(*) FROM pg_class WHERE relowner = (SELECT oid FROM r))
       + (SELECT count(*) FROM pg_proc WHERE proowner = (SELECT oid FROM r))
       + (SELECT count(*) FROM pg_type WHERE typowner = (SELECT oid FROM r))
       + (SELECT count(*) FROM pg_namespace WHERE nspowner = (SELECT oid FROM r))
       + (SELECT count(*) FROM pg_database WHERE datdba = (SELECT oid FROM r) AND datname = current_database()))::int
       AS count`,
    [runtime],
  );
  return owned.count;
}

function tablePrivileges(client: ClientBase, runtime: string): Rows<SeparationFacts['tables'][number]> {
  return rows(
    client,
    `SELECT c.relname AS name, ${held('has_table_privilege', 'c.oid', TABLE_PRIVILEGES)} AS privileges
       FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      ORDER BY c.relname`,
    [runtime],
  );
}

function sequencePrivileges(client: ClientBase, runtime: string): Rows<SeparationFacts['sequences'][number]> {
  return rows(
    client,
    `SELECT c.relname AS name, ${held('has_sequence_privilege', 'c.oid', SEQUENCE_PRIVILEGES)} AS privileges
       FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'S' ORDER BY c.relname`,
    [runtime],
  );
}

/** What the runtime role holds on schema `public` and on the database. */
async function schemaAndDatabasePrivileges(
  client: ClientBase,
  runtime: string,
): Promise<{ schema: string[]; database: string[] }> {
  const [access] = await rows<{ schema: string[]; database: string[] }>(
    client,
    `SELECT ${held('has_schema_privilege', `'public'`, ['USAGE', 'CREATE'])} AS schema,
            ${held('has_database_privilege', 'current_database()', ['CONNECT', 'CREATE', 'TEMPORARY'])} AS database`,
    [runtime],
  );
  return access;
}

async function defaultPrivileges(
  client: ClientBase,
  runtime: string,
  deploy: string,
): Promise<SeparationFacts['defaultPrivileges']> {
  const defaults = await rows<{ type: string; privileges: string[] }>(
    client,
    `SELECT d.defaclobjtype AS type, array_agg(a.privilege_type::text ORDER BY a.privilege_type) AS privileges
       FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
      WHERE d.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = $2)
        AND d.defaclnamespace = 'public'::regnamespace
        AND a.grantee = (SELECT oid FROM pg_roles WHERE rolname = $1)
      GROUP BY d.defaclobjtype`,
    [runtime, deploy],
  );
  return {
    tables: defaults.find((entry) => entry.type === 'r')?.privileges ?? [],
    sequences: defaults.find((entry) => entry.type === 'S')?.privileges ?? [],
  };
}

async function securityDefinerRoutines(client: ClientBase): Promise<string[]> {
  const routines = await rows<{ name: string }>(
    client,
    `SELECT format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) AS name
         FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
          AND NOT ${EXTENSION_MEMBER('pg_proc', 'p.oid')} ORDER BY 1`,
  );
  return routines.map((routine) => routine.name);
}

/** Everything `judgeSeparation` needs about the deploy/runtime pair in the connected database. */
export async function readSeparationFacts(
  client: ClientBase,
  deploy: string,
  runtime: string,
): Promise<SeparationFacts> {
  const runtimeFacts = await readRole(client, runtime);
  const facts: SeparationFacts = {
    deploy: await readRole(client, deploy),
    runtime: runtimeFacts,
    databaseOwner: await databaseOwner(client),
    runtimeOwnedObjects: 0,
    foreignOwnedObjects: (await foreignOwnedObjects(client, deploy)).map((object) => object.subject),
    tables: [],
    sequences: [],
    schemaPrivileges: [],
    databasePrivileges: [],
    defaultPrivileges: { tables: [], sequences: [] },
    securityDefinerRoutines: [],
  };
  if (!runtimeFacts) return facts;

  facts.runtimeOwnedObjects = await runtimeOwnedObjectCount(client, runtime);
  facts.tables = await tablePrivileges(client, runtime);
  facts.sequences = await sequencePrivileges(client, runtime);
  const access = await schemaAndDatabasePrivileges(client, runtime);
  facts.schemaPrivileges = access.schema;
  facts.databasePrivileges = access.database;
  facts.defaultPrivileges = await defaultPrivileges(client, runtime, deploy);
  facts.securityDefinerRoutines = await securityDefinerRoutines(client);

  return facts;
}
