import { Client } from 'pg';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { InstallationService } from '../../src/modules/installation/installation.service';
import { INSPECTION_USAGE } from '../../src/modules/installation/inspect/inspection.arguments';
import { InstallationInspectionService } from '../../src/modules/installation/inspect/inspection.service';
import { CLI_COLD_START_MS, cliWorkingDirectory, runCli, stopCliProcesses } from '../support/cli-process';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';

/**
 * H6.1 `pnpm ops:inspect` on a real PostgreSQL: the real entry point as a child process with the database settings
 * only (no secret), across a database before migrations, after migrations, installed and incomplete; and the proof,
 * at the database, that it writes nothing.
 */
const input = {
  timeZone: 'Asia/Ho_Chi_Minh',
  reportingCurrency: 'VND',
  organizationName: 'Acme Software',
  costCenterCode: 'CC-ENG',
  costCenterName: 'Engineering',
  departmentCode: 'P-ENG',
  departmentName: 'Engineering',
  jobTitleName: 'Software Engineer',
  superAdmin: {
    employeeCode: 'E001',
    fullName: 'Pham Bao',
    workEmail: 'bao@acme.vn',
    employmentType: 'STAFF',
    hireDate: '2024-03-01',
  },
  itAdmin: {
    employeeCode: 'E002',
    fullName: 'Tran An',
    workEmail: 'an@acme.vn',
    employmentType: 'STAFF',
    hireDate: '2024-03-05',
  },
  operatorReference: 'CHG-1234',
  environment: 'LOCAL_TEST',
};
/** Everything the report must never contain: identities, names, codes and the secret-shaped values. */
const NEVER_PRINTED = ['bao@acme.vn', 'an@acme.vn', 'Pham Bao', 'Tran An', 'E001', 'E002', 'Acme Software', 'argon2'];

describe('ops:inspect (integration, real PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let cwd: string;

  const inspect = (args: string[] = [], environment: Record<string, string> = {}) =>
    runCli('inspect-cli.ts', args, {
      cwd,
      environment: { NODE_ENV: 'production', DATABASE_URL: database.url, ...environment },
    });

  /** One hash per table of every row: equal before and after means nothing was written. */
  const fingerprint = async (): Promise<Record<string, string>> => {
    const tables = await sql.query<{ name: string }>(
      `SELECT quote_ident(table_schema) || '.' || quote_ident(table_name) AS name FROM information_schema.tables
       WHERE table_schema IN ('public', 'test_harness') AND table_type = 'BASE TABLE' ORDER BY 1`,
    );
    const result: Record<string, string> = {};
    for (const { name } of tables.rows) {
      const row = await sql.query<{ hash: string }>(
        `SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS hash FROM ${name} t`,
      );
      result[name] = row.rows[0].hash;
    }
    return result;
  };

  beforeAll(async () => {
    cwd = cliWorkingDirectory('slm-inspect-cli');
    database = await provisionDisposableDatabase();
    sql = new Client({ connectionString: database.url });
    await sql.connect();
  }, 90000);

  afterAll(async () => {
    stopCliProcesses();
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  it(
    'prints the usage and exits 0 for --help, and refuses an unknown option with exit 1',
    async () => {
      await expect(runCli('inspect-cli.ts', ['--help'], { cwd, environment: {} })).resolves.toEqual({
        code: 0,
        stdout: `${INSPECTION_USAGE}\n`,
        stderr: '',
      });
      const unknown = await runCli('inspect-cli.ts', ['--write'], { cwd, environment: {} });
      expect(unknown).toEqual({ code: 1, stdout: '', stderr: `Unknown option '--write'\n\n${INSPECTION_USAGE}\n` });
    },
    CLI_COLD_START_MS,
  );

  it(
    'reports NOT_INSTALLED with every migration pending on a database nothing was applied to (exit 2)',
    async () => {
      const result = await inspect();

      expect(result.code).toBe(2);
      expect(result.stderr).toBe('');
      expect(result.stdout).toMatch(
        /^Installation: NOT_INSTALLED\nProblems: none\nMigrations: (\d+) committed, 0 applied, \1 pending, 0 failed, 0 unknown\n/,
      );
      expect(result.stdout).toContain('Next: apply the migrations (pnpm db:migrate:deploy)');
    },
    CLI_COLD_START_MS,
  );

  it(
    'reports NOT_INSTALLED after the migrations, before the installation (exit 2)',
    async () => {
      await migrateDisposableDatabase(database);
      const result = await inspect(['--json']);

      expect(result.code).toBe(2);
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: 'NOT_INSTALLED',
        problems: [],
        migrations: { pending: [], failed: [], unknown: [] },
        organization: null,
      });
    },
    CLI_COLD_START_MS,
  );

  describe('after an installation', () => {
    beforeAll(async () => {
      process.env.TEST_DATABASE_URL = database.url;
      const { InstallationModule } = await import('../../src/modules/installation/installation.module');
      const app = await NestFactory.createApplicationContext(InstallationModule, { logger: false });
      try {
        await app.get(InstallationService).install(input, 'a long enough passphrase');
      } finally {
        await app.close();
      }
    }, 90000);

    it(
      'reports INSTALLED with exit 0, the same in both forms, byte-stable, with only a masked email',
      async () => {
        const before = await fingerprint();
        const text = await inspect();
        const again = await inspect();
        const json = await inspect(['--json']);

        expect(text.code).toBe(0);
        expect(again).toEqual(text);
        expect(json.code).toBe(0);
        const lines = text.stdout.split('\n');
        expect(lines[2]).toMatch(/^Migrations: (\d+) committed, \1 applied, 0 pending, 0 failed, 0 unknown$/);
        expect([...lines.slice(0, 2), ...lines.slice(3)]).toEqual([
          'Installation: INSTALLED',
          'Problems: none',
          'Organization: present (Asia/Ho_Chi_Minh, VND)',
          'Bootstrap records: complete',
          'Super Admin: 1 holder, ACTIVE, ACTIVATED, b***@a***.vn',
          'Accounts: 1 (ACTIVE_ACTIVATED 1, ACTIVE_INVITED 0, LOCKED_ACTIVATED 0, LOCKED_INVITED 0)',
          'Direct roles: SUPER_ADMIN 1, IT_ADMIN 0, FINANCE 0, EMPLOYEE 0',
          'Approval roles: SPENDING_APPROVER 0, CONFLICT_SUBSTITUTE 0, FALLBACK_APPROVER 0',
          'Departments: 1 active, 1 without a current head, 1 without a usable IT Admin',
          '',
        ]);
        expect(JSON.parse(json.stdout)).toMatchObject({
          status: 'INSTALLED',
          problems: [],
          superAdmin: { holders: 1, status: 'ACTIVE', activationState: 'ACTIVATED', maskedEmail: 'b***@a***.vn' },
          accounts: { total: 1 },
          departments: { active: 1, withoutCurrentHead: 1, withoutUsableItAdmin: 1 },
        });
        for (const output of [text.stdout, json.stdout, text.stderr, json.stderr]) {
          for (const secret of [...NEVER_PRINTED, database.url]) expect(output).not.toContain(secret);
        }
        expect(await fingerprint()).toEqual(before);
      },
      CLI_COLD_START_MS * 3,
    );

    it(
      'reports INCOMPLETE (exit 2) for a locked Super Admin and a failed migration, and changes neither',
      async () => {
        await sql.query(`UPDATE app_users SET status = 'LOCKED'`);
        await sql.query(
          `INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count)
           VALUES ('p23-failed', 'x', '29991231000000_unfinished', now(), 0)`,
        );
        try {
          const before = await fingerprint();
          const result = await inspect(['--json']);

          expect(result.code).toBe(2);
          expect(JSON.parse(result.stdout)).toMatchObject({
            status: 'INCOMPLETE',
            problems: ['MIGRATIONS_FAILED', 'SUPER_ADMIN_NOT_USABLE'],
            migrations: { failed: ['29991231000000_unfinished'] },
            superAdmin: { status: 'LOCKED' },
          });
          expect(await fingerprint()).toEqual(before);
        } finally {
          await sql.query(`DELETE FROM _prisma_migrations WHERE id = 'p23-failed'`);
          await sql.query(`UPDATE app_users SET status = 'ACTIVE'`);
        }
      },
      CLI_COLD_START_MS,
    );

    it(
      'fails with exit 1 and the error name only when the database does not answer',
      async () => {
        const result = await inspect([], { DATABASE_URL: 'postgresql://app:s3cr3t-value@127.0.0.1:1/nowhere' });

        expect(result.code).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toMatch(/^The inspection failed: \w+\n$/);
        expect(result.stderr).not.toContain('s3cr3t-value');
      },
      CLI_COLD_START_MS,
    );

    it(
      'needs DATABASE_URL in production and nothing else: no auth, outbox, mail, Redis or storage setting',
      async () => {
        const missing = await runCli('inspect-cli.ts', [], { cwd, environment: { NODE_ENV: 'production' } });

        expect(missing).toEqual({
          code: 1,
          stdout: '',
          stderr: 'Environment validation failed: "DATABASE_URL" is required\n',
        });
      },
      CLI_COLD_START_MS,
    );

    describe('the inspection graph cannot write (rule 1)', () => {
      let app: INestApplicationContext;

      beforeAll(async () => {
        process.env.TEST_DATABASE_URL = database.url;
        const { InspectionModule } = await import('../../src/modules/installation/inspect/inspection.module');
        app = await NestFactory.createApplicationContext(InspectionModule, { logger: false });
      }, 90000);

      afterAll(async () => {
        await app?.close();
      });

      it('is refused by PostgreSQL (25006) for a write outside and inside a transaction', async () => {
        const before = await fingerprint();
        const prisma = app.get(PrismaService);

        await expect(prisma.$executeRaw`UPDATE organizations SET name = name`).rejects.toThrow(
          /read-only transaction|25006/,
        );
        await expect(
          app.get(TransactionRunner).run((tx) => tx.$executeRaw`UPDATE organizations SET name = name`),
        ).rejects.toThrow(/read-only transaction|25006/);
        await expect(app.get(InstallationInspectionService).inspect()).resolves.toMatchObject({ status: 'INSTALLED' });
        expect(await fingerprint()).toEqual(before);
      });
    });
  });
});
