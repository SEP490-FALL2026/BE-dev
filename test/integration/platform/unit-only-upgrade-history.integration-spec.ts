import { Client } from 'pg';
import { CLI_COLD_START_MS, cliWorkingDirectory, runCli, stopCliProcesses } from '../../support/cli-process';
import { activateCostCenterLink, lastCompatibilityMigration } from '../../support/compat-release';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';
import {
  legacyCompanyAllocation,
  legacyEmployee,
  legacyServiceAccount,
  legacyWorld,
  LegacyWorld,
} from '../../support/legacy-unit-only-fixture';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
  schemaDrift,
} from '../../support/migration-history';

/**
 * P28-01 under `P29-MIGRATION=B-FORWARD`: the merged migration `20261022120000_cost_centers_unit_only` stays byte for
 * byte, a read-only preflight (`pnpm ops:preflight`) prepares or refuses a database that has not run it yet, and a new
 * forward migration brings every history to the rule of the application — a service account is owned by the department
 * its responsible person is in on the day it was recorded (`QĐ-86c`, `seat-baseline-import.service.ts`), and charged to
 * that department's Unit. Each history is real: `prisma migrate deploy` writes `_prisma_migrations` with the checksums. The preflight is
 * the one of the FINAL release: a database before the compatibility migration that holds an organization is `BLOCKED` by
 * `COST_CENTER_DIRECTION_EXPANSION_REQUIRED` beside whatever the conversion finds (the conversion's rows are still reported), and the
 * upgrade to the final schema goes through the compatibility release and the operator's activation (spec L.10, L.11).
 */
const UNIT_ONLY = migrationEndingWith('_cost_centers_unit_only');
const LAST_MERGED = migrationEndingWith('_license_key_reveal_quota');
const FORWARD = '_service_account_owner_on_recorded_day';
/** `Asia/Ho_Chi_Minh` is UTC+7: 18:30Z on 11 October is already 12 October where the organization keeps its calendar. */
const RECORDED_AT = '2026-10-11T18:30:00Z';

interface Fixture {
  database: DisposableDatabase;
  sql: Client;
  world: LegacyWorld;
  accounts: Record<string, string>;
}

type Case = 'A' | 'B' | 'C' | 'D';

/**
 * The service accounts by case, all recorded on 12 October (the organization's calendar):
 * A — the same department on the start day and the recorded day; B — moved OPS → ENG on the recorded day, so the
 * merged migration (start day) and the application (recorded day) disagree; C — placed only from the import day, after
 * the seat started, so the merged migration finds no department; D — in no department on the recorded day.
 */
async function legacyFixture(cases: readonly Case[], options: { companyAllocation?: boolean } = {}): Promise<Fixture> {
  const database = await provisionDisposableDatabase();
  const sql = new Client({ connectionString: database.url });
  await sql.connect();
  const before = await deployMigrations(database, { through: migrationBefore(UNIT_ONLY) });
  if (before.code !== 0) throw new Error(`Deploying the history before the migration failed: ${before.stdout}`);
  const world = await legacyWorld(sql, 'Asia/Ho_Chi_Minh');
  const accounts: Record<string, string> = {};
  const service = async (key: Case, employeeId: string, validFrom: string, basis: 'ACTUAL' | 'RECORDED') => {
    accounts[key] = await legacyServiceAccount(sql, world, {
      employeeId,
      identifier: `bot-${key.toLowerCase()}`,
      validFrom,
      basis,
      createdAt: RECORDED_AT,
    });
  };
  for (const key of cases) {
    if (key === 'A') {
      const id = await legacyEmployee(sql, world, 'E-A', '2026-01-01', [{ department: 'ENG', from: '2026-01-01' }]);
      await service('A', id, '2026-10-12', 'RECORDED');
    } else if (key === 'B') {
      const id = await legacyEmployee(sql, world, 'E-B', '2026-01-01', [
        { department: 'OPS', from: '2026-01-01', to: '2026-10-12' },
        { department: 'ENG', from: '2026-10-12' },
      ]);
      await service('B', id, '2026-10-01', 'ACTUAL');
    } else if (key === 'C') {
      const id = await legacyEmployee(sql, world, 'E-C', '2026-01-01', [{ department: 'OPS', from: '2026-10-12' }]);
      await service('C', id, '2026-10-01', 'ACTUAL');
    } else {
      const id = await legacyEmployee(sql, world, 'E-D', '2026-01-01', [
        { department: 'OPS', from: '2026-01-01', to: '2026-10-05' },
      ]);
      await service('D', id, '2026-10-01', 'ACTUAL');
    }
  }
  if (options.companyAllocation) accounts.allocation = (await legacyCompanyAllocation(sql, world, 4000)).versionId;

  return { database, sql, world, accounts };
}

/**
 * The deploy of the final release over a database the compatibility release can run on: the history through the compatibility
 * release, the operator's activation of the Cost Center link, then the migrations of the final release. Returns the first non-zero exit
 * code, else 0.
 */
async function deployThroughFinal(fixture: Fixture): Promise<number | null> {
  const compatibility = await deployMigrations(fixture.database, { through: lastCompatibilityMigration() });
  if (compatibility.code !== 0) return compatibility.code;
  await activateCostCenterLink(fixture.sql, fixture.world.organizationId);

  return (await deployMigrations(fixture.database)).code;
}

/** What the final preflight adds on a database that skipped the compatibility release: the organization, by id. */
const expansionRequired = (fixture: Fixture) => ({
  code: 'COST_CENTER_DIRECTION_EXPANSION_REQUIRED',
  organizationId: fixture.world.organizationId,
});

async function finish(fixture: Fixture | undefined): Promise<void> {
  await fixture?.sql.end();
  if (fixture) await dropDisposableDatabase(fixture.database);
}

/** The service accounts by identifier with their owning department and Cost Center, and the Cost Centers left. */
async function attribution(sql: Client): Promise<{ accounts: Record<string, string>; costCenters: string[] }> {
  const rows = (
    await sql.query<{ identifier: string; department: string | null; cost_center: string }>(
      `SELECT a.account_identifier AS identifier, d.code AS department, c.code AS cost_center
         FROM license_assignments a
         LEFT JOIN departments d ON d.id = a.owning_department_id
         JOIN cost_centers c ON c.id = a.cost_center_id
        WHERE a.kind = 'SERVICE'
        ORDER BY a.account_identifier`,
    )
  ).rows;
  const costCenters = (await sql.query<{ code: string }>(`SELECT code FROM cost_centers ORDER BY code`)).rows;

  return {
    accounts: Object.fromEntries(rows.map((row) => [row.identifier, `${row.department ?? '-'}/${row.cost_center}`])),
    costCenters: costCenters.map((row) => row.code),
  };
}

/** Every row of the tables the conversion touches, as text: equal before and after means nothing was written. */
async function fingerprint(sql: Client): Promise<string> {
  const tables = ['license_assignments', 'cost_centers', 'departments', 'employee_placements', 'audit_events'];
  const parts: string[] = [];
  for (const table of tables) {
    parts.push(
      JSON.stringify((await sql.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows),
    );
  }
  const columns = await sql.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'license_assignments' ORDER BY column_name`,
  );

  return JSON.stringify({ parts, columns: columns.rows });
}

/** The migrations Prisma recorded as finished, by name. */
async function finished(sql: Client): Promise<string[]> {
  return (
    await sql.query<{ migration_name: string }>(
      `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`,
    )
  ).rows.map((row) => row.migration_name);
}

interface Preflight {
  status: 'READY' | 'BLOCKED';
  history: 'NOT_INSTALLED' | 'BEFORE_UNIT_ONLY' | 'UNIT_ONLY_APPLIED' | 'UNIT_ONLY_FAILED' | 'CONVERGED';
  blockers: Array<Record<string, string | number> & { code: string }>;
  corrections: Array<{ assignmentId: string; recordedOn: string; fromDepartment: string; toDepartment: string }>;
  companyCostCentersRemoved: Array<{ code: string; status: string }>;
}

describe('cost attribution to Units: every migration history converges (integration, P28-01, B-FORWARD)', () => {
  const preflight = async (database: DisposableDatabase): Promise<{ code: number | null; report: Preflight }> => {
    const result = await runCli('preflight', ['--json'], {
      cwd: cliWorkingDirectory('slm-preflight'),
      environment: { NODE_ENV: 'production', DATABASE_URL: database.url },
    });
    if (result.code !== 0 && result.code !== 2) throw new Error(`preflight ${result.code}: ${result.stderr}`);

    return { code: result.code, report: JSON.parse(result.stdout) as Preflight };
  };

  afterAll(() => {
    stopCliProcesses();
  });

  it(
    'a fresh database deploys every migration, has no drift and reports a converged history',
    async () => {
      const database = await provisionDisposableDatabase();
      try {
        expect((await deployMigrations(database)).code).toBe(0);
        expect((await schemaDrift(database)).code).toBe(0);
        const { code, report } = await preflight(database);
        expect(code).toBe(0);
        expect(report).toMatchObject({ status: 'READY', history: 'CONVERGED', blockers: [], corrections: [] });
      } finally {
        await dropDisposableDatabase(database);
      }
    },
    DEPLOY_TIMEOUT_MS + CLI_COLD_START_MS,
  );

  describe('a database that has not run the unit-only migration', () => {
    it(
      'is reported with what will move and blocked until the compatibility release ran, then upgrades to the recorded-day owner with an audit of the correction',
      async () => {
        let fixture: Fixture | undefined;
        try {
          fixture = await legacyFixture(['A', 'B']);
          const untouched = await fingerprint(fixture.sql);
          const { code, report } = await preflight(fixture.database);

          expect(code).toBe(2);
          expect(report.status).toBe('BLOCKED');
          expect(report.history).toBe('BEFORE_UNIT_ONLY');
          expect(report.blockers).toEqual([expansionRequired(fixture)]);
          expect(report.corrections).toEqual([
            { assignmentId: fixture.accounts.B, recordedOn: '2026-10-12', fromDepartment: 'OPS', toDepartment: 'ENG' },
          ]);
          expect(report.companyCostCentersRemoved).toEqual([
            { code: 'CC-CORP', status: 'ACTIVE' },
            { code: 'CC-OLD', status: 'INACTIVE' },
          ]);
          expect(await fingerprint(fixture.sql)).toBe(untouched);

          expect(await deployThroughFinal(fixture)).toBe(0);
          expect(await attribution(fixture.sql)).toEqual({
            accounts: { 'bot-a': 'ENG/CC-ENG', 'bot-b': 'ENG/CC-ENG' },
            costCenters: ['CC-ENG', 'CC-OPS'],
          });
          const audit = await fixture.sql.query<{ resource_id: string; before: unknown; after: unknown }>(
            `SELECT resource_id, before, after FROM audit_events WHERE action = 'LICENSE_ASSIGNMENT.OWNER_CORRECTED'`,
          );
          expect(audit.rows).toEqual([
            {
              resource_id: fixture.accounts.B,
              before: { owningDepartment: 'OPS', costCenter: 'CC-OPS' },
              after: expect.objectContaining({
                owningDepartment: 'ENG',
                costCenter: 'CC-ENG',
                recordedOn: '2026-10-12',
              }) as unknown,
            },
          ]);
          expect((await schemaDrift(fixture.database)).code).toBe(0);
          expect((await preflight(fixture.database)).report).toMatchObject({
            status: 'READY',
            history: 'CONVERGED',
            corrections: [],
          });
        } finally {
          await finish(fixture);
        }
      },
      4 * DEPLOY_TIMEOUT_MS + 2 * CLI_COLD_START_MS,
    );

    it(
      'is refused before anything is written when the merged migration cannot carry its data, naming every row',
      async () => {
        let fixture: Fixture | undefined;
        try {
          fixture = await legacyFixture(['A', 'C', 'D'], { companyAllocation: true });
          const untouched = await fingerprint(fixture.sql);
          const { code, report } = await preflight(fixture.database);

          expect(code).toBe(2);
          expect(report.status).toBe('BLOCKED');
          expect(report.blockers).toEqual([
            {
              code: 'COST_ALLOCATION_NAMES_COMPANY',
              versionId: fixture.accounts.allocation,
              version: 1,
              costCenter: 'CC-CORP',
            },
            expansionRequired(fixture),
            {
              code: 'SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_RECORDED_DAY',
              assignmentId: fixture.accounts.D,
              employeeCode: 'E-D',
              recordedOn: '2026-10-12',
            },
            {
              code: 'SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_START',
              assignmentId: fixture.accounts.C,
              employeeCode: 'E-C',
              validFrom: '2026-10-01',
            },
            // The flat-rate subscription of the allocation: a database that skipped the expansion cannot give it an owner department.
            {
              code: 'SUBSCRIPTION_OWNER_EXPANSION_REQUIRED',
              subscriptionId: (await fixture.sql.query<{ id: string }>('SELECT id FROM subscriptions')).rows[0].id,
            },
          ]);
          expect(await fingerprint(fixture.sql)).toBe(untouched);
        } finally {
          await finish(fixture);
        }
      },
      DEPLOY_TIMEOUT_MS + 2 * CLI_COLD_START_MS,
    );

    it(
      'deployed without the preflight anyway, the merged migration stops and leaves the data as it was',
      async () => {
        let fixture: Fixture | undefined;
        try {
          fixture = await legacyFixture(['C']);
          const untouched = await fingerprint(fixture.sql);

          const deploy = await deployMigrations(fixture.database);

          expect(deploy.code).not.toBe(0);
          expect(`${deploy.stdout}${deploy.stderr}`).toContain(fixture.accounts.C);
          expect(await fingerprint(fixture.sql)).toBe(untouched);
          expect(await finished(fixture.sql)).not.toContain(UNIT_ONLY);
          expect((await preflight(fixture.database)).report).toMatchObject({
            status: 'BLOCKED',
            history: 'UNIT_ONLY_FAILED',
          });
        } finally {
          await finish(fixture);
        }
      },
      2 * DEPLOY_TIMEOUT_MS + CLI_COLD_START_MS,
    );
  });

  describe('a database that already ran the unit-only migration with its original checksum (the test VPS)', () => {
    it(
      'is reported with what will move and blocked until the compatibility release ran, then the forward migration moves it to the same state as the other history',
      async () => {
        let legacy: Fixture | undefined;
        let applied: Fixture | undefined;
        try {
          applied = await legacyFixture(['A', 'B']);
          expect((await deployMigrations(applied.database, { through: LAST_MERGED })).code).toBe(0);
          expect(await finished(applied.sql)).toContain(UNIT_ONLY);
          expect((await attribution(applied.sql)).accounts['bot-b']).toBe('OPS/CC-OPS');

          const { code, report } = await preflight(applied.database);
          expect(code).toBe(2);
          expect(report).toMatchObject({ status: 'BLOCKED', history: 'UNIT_ONLY_APPLIED' });
          expect(report.blockers).toEqual([expansionRequired(applied)]);
          expect(report.corrections).toEqual([
            { assignmentId: applied.accounts.B, recordedOn: '2026-10-12', fromDepartment: 'OPS', toDepartment: 'ENG' },
          ]);

          expect(await deployThroughFinal(applied)).toBe(0);
          expect(await finished(applied.sql)).toEqual(
            expect.arrayContaining([UNIT_ONLY, expect.stringContaining(FORWARD)]),
          );
          expect((await schemaDrift(applied.database)).code).toBe(0);

          legacy = await legacyFixture(['A', 'B']);
          expect(await deployThroughFinal(legacy)).toBe(0);
          expect(await attribution(applied.sql)).toEqual(await attribution(legacy.sql));
        } finally {
          await finish(applied);
          await finish(legacy);
        }
      },
      7 * DEPLOY_TIMEOUT_MS + CLI_COLD_START_MS,
    );

    it(
      'with an account in no department on its recorded day, is refused, and the forward migration stops before writing',
      async () => {
        let fixture: Fixture | undefined;
        try {
          fixture = await legacyFixture(['D']);
          expect((await deployMigrations(fixture.database, { through: LAST_MERGED })).code).toBe(0);
          const { code, report } = await preflight(fixture.database);
          expect(code).toBe(2);
          expect(report.blockers).toEqual([
            expansionRequired(fixture),
            {
              code: 'SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_RECORDED_DAY',
              assignmentId: fixture.accounts.D,
              employeeCode: 'E-D',
              recordedOn: '2026-10-12',
            },
          ]);
          const untouched = await fingerprint(fixture.sql);

          const deploy = await deployMigrations(fixture.database);

          expect(deploy.code).not.toBe(0);
          expect(`${deploy.stdout}${deploy.stderr}`).toContain(fixture.accounts.D);
          expect(await fingerprint(fixture.sql)).toBe(untouched);
          expect((await finished(fixture.sql)).some((name) => name.endsWith(FORWARD))).toBe(false);
        } finally {
          await finish(fixture);
        }
      },
      3 * DEPLOY_TIMEOUT_MS + CLI_COLD_START_MS,
    );
  });
});
