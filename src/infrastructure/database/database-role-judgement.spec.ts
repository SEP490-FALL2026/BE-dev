import {
  RoleFacts,
  RuntimeIdentityFacts,
  SeparationFacts,
  judgeRuntimeIdentity,
  judgeSeparation,
} from './database-role-judgement';

const DML = ['DELETE', 'INSERT', 'SELECT', 'UPDATE'];
const role = (name: string, overrides: Partial<RoleFacts> = {}): RoleFacts => ({
  name,
  superuser: false,
  createdb: false,
  createrole: false,
  replication: false,
  bypassrls: false,
  canLogin: true,
  memberOf: 0,
  members: 0,
  settings: 0,
  ...overrides,
});
const healthy = (): SeparationFacts => ({
  deploy: role('slm_deploy'),
  runtime: role('slm_runtime'),
  databaseOwner: 'slm_deploy',
  runtimeOwnedObjects: 0,
  foreignOwnedObjects: [],
  tables: [
    { name: '_prisma_migrations', privileges: [] },
    { name: 'app_users', privileges: DML },
    { name: 'audit_events', privileges: ['INSERT', 'SELECT'] },
  ],
  sequences: [{ name: 'probe_seq', privileges: ['USAGE'] }],
  schemaPrivileges: ['USAGE'],
  databasePrivileges: ['CONNECT'],
  defaultPrivileges: { tables: DML, sequences: ['USAGE'] },
  securityDefinerRoutines: [],
});
const codes = (facts: SeparationFacts): string[] => judgeSeparation(facts).map((finding) => finding.code);

describe('judgeSeparation', () => {
  it('accepts the role matrix of the spec', () => {
    expect(judgeSeparation(healthy())).toEqual([]);
  });

  it('accepts a database with no table yet (provisioned before the first migration)', () => {
    expect(judgeSeparation({ ...healthy(), tables: [], sequences: [] })).toEqual([]);
  });

  it.each([
    ['superuser', 'SUPERUSER'],
    ['createdb', 'CREATEDB'],
    ['createrole', 'CREATEROLE'],
    ['replication', 'REPLICATION'],
    ['bypassrls', 'BYPASSRLS'],
  ] as const)('refuses either role with %s', (attribute, code) => {
    expect(codes({ ...healthy(), deploy: role('slm_deploy', { [attribute]: true }) })).toEqual([`DEPLOY_${code}`]);
    expect(codes({ ...healthy(), runtime: role('slm_runtime', { [attribute]: true }) })).toEqual([`RUNTIME_${code}`]);
  });

  it('refuses memberships in both directions, role settings and a role that cannot log in', () => {
    expect(codes({ ...healthy(), runtime: role('slm_runtime', { memberOf: 1 }) })).toEqual(['RUNTIME_MEMBERSHIP']);
    expect(codes({ ...healthy(), deploy: role('slm_deploy', { members: 1 }) })).toEqual(['DEPLOY_MEMBERSHIP']);
    expect(codes({ ...healthy(), runtime: role('slm_runtime', { settings: 2 }) })).toEqual(['RUNTIME_ROLE_SETTINGS']);
    expect(codes({ ...healthy(), runtime: role('slm_runtime', { canLogin: false }) })).toEqual(['RUNTIME_NO_LOGIN']);
  });

  it('refuses missing roles', () => {
    expect(codes({ ...healthy(), deploy: null })).toContain('DEPLOY_ROLE_MISSING');
    expect(codes({ ...healthy(), runtime: null })).toEqual(['RUNTIME_ROLE_MISSING']);
  });

  it('requires the deploy role to own the database and every object, and the runtime role to own nothing', () => {
    expect(codes({ ...healthy(), databaseOwner: 'app' })).toEqual(['DEPLOY_NOT_DATABASE_OWNER']);
    expect(codes({ ...healthy(), runtimeOwnedObjects: 1 })).toEqual(['RUNTIME_OWNS_OBJECTS']);
    expect(judgeSeparation({ ...healthy(), foreignOwnedObjects: ['table audit_events (app)'] })).toEqual([
      { code: 'OBJECT_NOT_OWNED_BY_DEPLOY', subject: 'table audit_events (app)' },
    ]);
  });

  it('compares the effective table privileges of the runtime role with the exact expected set', () => {
    const tables = (privileges: Record<string, string[]>): SeparationFacts => ({
      ...healthy(),
      tables: healthy().tables.map((table) => ({ ...table, privileges: privileges[table.name] ?? table.privileges })),
    });

    expect(judgeSeparation(tables({ _prisma_migrations: ['SELECT'] }))).toEqual([
      { code: 'RUNTIME_TABLE_PRIVILEGES', subject: '_prisma_migrations: expected none, has SELECT' },
    ]);
    expect(judgeSeparation(tables({ audit_events: [...DML] }))).toEqual([
      {
        code: 'RUNTIME_TABLE_PRIVILEGES',
        subject: 'audit_events: expected INSERT, SELECT, has DELETE, INSERT, SELECT, UPDATE',
      },
    ]);
    expect(codes(tables({ app_users: [...DML, 'TRUNCATE'] }))).toEqual(['RUNTIME_TABLE_PRIVILEGES']);
    expect(codes(tables({ app_users: ['SELECT'] }))).toEqual(['RUNTIME_TABLE_PRIVILEGES']);
  });

  it('checks sequences, the schema, the database and the default privileges of future objects', () => {
    expect(codes({ ...healthy(), sequences: [{ name: 'probe_seq', privileges: ['UPDATE', 'USAGE'] }] })).toEqual([
      'RUNTIME_SEQUENCE_PRIVILEGES',
    ]);
    expect(codes({ ...healthy(), schemaPrivileges: ['CREATE', 'USAGE'] })).toEqual(['RUNTIME_SCHEMA_PRIVILEGES']);
    expect(codes({ ...healthy(), databasePrivileges: ['CONNECT', 'TEMPORARY'] })).toEqual([
      'RUNTIME_DATABASE_PRIVILEGES',
    ]);
    expect(codes({ ...healthy(), defaultPrivileges: { tables: [], sequences: ['USAGE'] } })).toEqual([
      'DEFAULT_PRIVILEGES_TABLES',
    ]);
    expect(codes({ ...healthy(), defaultPrivileges: { tables: DML, sequences: [] } })).toEqual([
      'DEFAULT_PRIVILEGES_SEQUENCES',
    ]);
  });

  it('refuses a SECURITY DEFINER routine, which would run as the owner for the runtime role', () => {
    expect(judgeSeparation({ ...healthy(), securityDefinerRoutines: ['escalate()'] })).toEqual([
      { code: 'SECURITY_DEFINER_ROUTINE', subject: 'escalate()' },
    ]);
  });
});

describe('judgeRuntimeIdentity (API and worker start-up)', () => {
  const runtime = (overrides: Partial<RuntimeIdentityFacts> = {}): RuntimeIdentityFacts => ({
    role: 'slm_runtime',
    superuser: false,
    createdb: false,
    createrole: false,
    replication: false,
    bypassrls: false,
    memberships: 0,
    ownsDatabase: false,
    ownedObjects: 0,
    sessionReplicationRole: 'origin',
    ...overrides,
  });

  it('accepts the runtime role', () => {
    expect(judgeRuntimeIdentity(runtime())).toEqual([]);
  });

  it('names every reason the cluster superuser is refused', () => {
    expect(
      judgeRuntimeIdentity(
        runtime({
          superuser: true,
          createdb: true,
          createrole: true,
          replication: true,
          bypassrls: true,
          ownsDatabase: true,
          ownedObjects: 300,
        }),
      ),
    ).toEqual(['SUPERUSER', 'CREATEDB', 'CREATEROLE', 'REPLICATION', 'BYPASSRLS', 'OWNS_DATABASE', 'OWNS_OBJECTS']);
  });

  it('refuses the deploy role (an owner), a member of any role and disabled triggers', () => {
    expect(judgeRuntimeIdentity(runtime({ ownsDatabase: true, ownedObjects: 120 }))).toEqual([
      'OWNS_DATABASE',
      'OWNS_OBJECTS',
    ]);
    expect(judgeRuntimeIdentity(runtime({ memberships: 1 }))).toEqual(['MEMBERSHIP']);
    expect(judgeRuntimeIdentity(runtime({ sessionReplicationRole: 'replica' }))).toEqual(['SESSION_REPLICATION_ROLE']);
  });
});
