import { Client } from 'pg';
import { NestFactory } from '@nestjs/core';
import { DEV_SEED_USAGE } from '../../src/modules/installation/dev-seed/dev-seed.arguments';
import { InstallationService } from '../../src/modules/installation/installation.service';
import { CLI_COLD_START_MS, cliWorkingDirectory, runCli, stopCliProcesses } from '../support/cli-process';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';

/**
 * H6.2 `pnpm dev:seed` as an operator runs it: the real entry point as a child process. The guard matrix needs no
 * database (a refused run never connects); the created/rerun pair runs in development against a loopback disposable
 * database with the database settings only (no secret).
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
/** Never contacted: every case that names it is refused before a connection. */
const REMOTE = 'postgresql://app:s3cr3t-value@db.example.com:5432/slm';

describe('dev:seed command (integration, spawned process)', () => {
  let cwd: string;
  let database: DisposableDatabase;
  let sql: Client;

  const seed = (args: string[], environment: Record<string, string>) =>
    runCli('dev-seed-cli.ts', args, { cwd, environment });
  const rowCount = async () =>
    (
      await sql.query<{ n: number }>(
        `SELECT ((SELECT count(*) FROM employees) + (SELECT count(*) FROM app_users) + (SELECT count(*) FROM audit_events))::int AS n`,
      )
    ).rows[0].n;

  beforeAll(async () => {
    cwd = cliWorkingDirectory('slm-dev-seed-cli');
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    process.env.TEST_DATABASE_URL = database.url;
    const { InstallationModule } = await import('../../src/modules/installation/installation.module');
    const installer = await NestFactory.createApplicationContext(InstallationModule, { logger: false });
    try {
      await installer.get(InstallationService).install(input, 'a long enough passphrase');
    } finally {
      await installer.close();
    }
    sql = new Client({ connectionString: database.url });
    await sql.connect();
  }, 120000);

  afterAll(async () => {
    stopCliProcesses();
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  it(
    'prints the usage for --help, and treats a missing or extra flag as a usage error (exit 1, nothing loaded)',
    async () => {
      await expect(seed(['--help'], {})).resolves.toEqual({ code: 0, stdout: `${DEV_SEED_USAGE}\n`, stderr: '' });
      await expect(seed([], {})).resolves.toEqual({
        code: 1,
        stdout: '',
        stderr: `--confirm-local is required: it confirms the target is a local database.\n\n${DEV_SEED_USAGE}\n`,
      });
      await expect(seed(['--confirm-local', '--force'], {})).resolves.toEqual({
        code: 1,
        stdout: '',
        stderr: `Unknown option '--force'\n\n${DEV_SEED_USAGE}\n`,
      });
    },
    CLI_COLD_START_MS * 3,
  );

  it(
    'refuses production, a Docker service name and a remote host with exit 3, writing nothing and echoing no URL',
    async () => {
      const before = await rowCount();
      const cases: [Record<string, string>, string][] = [
        [{ NODE_ENV: 'production', DATABASE_URL: database.url }, 'ENVIRONMENT_NOT_LOCAL'],
        [{ NODE_ENV: 'development', DATABASE_URL: 'postgresql://app:app@postgres:5432/slm' }, 'DATABASE_NOT_LOOPBACK'],
        [{ NODE_ENV: 'development', DATABASE_URL: REMOTE }, 'DATABASE_NOT_LOOPBACK'],
      ];
      for (const [environment, refusal] of cases) {
        const result = await seed(['--', '--confirm-local'], environment);

        expect({ refusal, code: result.code, stdout: result.stdout }).toEqual({ refusal, code: 3, stdout: '' });
        expect(result.stderr).toMatch(new RegExp(`^Refused \\(${refusal}\\): .+ Nothing was written\\.\\n$`));
        expect(result.stderr).not.toContain('s3cr3t-value');
        expect(result.stderr).not.toContain(database.url);
      }
      expect(await rowCount()).toBe(before);
    },
    CLI_COLD_START_MS * 3,
  );

  it(
    'creates the demo data once with exit 0 and a password per new account, then finds it all present with exit 2',
    async () => {
      const environment = { NODE_ENV: 'development', DATABASE_URL: database.url };

      const first = await seed(['--', '--confirm-local'], environment);
      expect(first.code).toBe(0);
      expect(first.stderr).toBe('');
      const passwords = [...first.stdout.matchAll(/password: ([A-Za-z0-9_-]{24})$/gm)].map((match) => match[1]);
      expect(passwords).toHaveLength(3);
      expect(new Set(passwords).size).toBe(3);
      expect(first.stdout).toMatch(/^dev:seed: CREATED\n/);
      expect(first.stdout).toContain('IT_ADMIN  it.admin@demo.slm.test  password: ');
      expect(first.stdout).not.toContain('bao@acme.vn');

      const afterFirst = await rowCount();
      const second = await seed(['--confirm-local'], environment);
      expect(second.code).toBe(2);
      expect(second.stdout).toMatch(/^dev:seed: ALREADY_PRESENT\n/);
      expect(second.stdout).not.toContain('password:');
      for (const password of passwords) expect(second.stdout).not.toContain(password);
      expect(await rowCount()).toBe(afterFirst);
    },
    CLI_COLD_START_MS * 2,
  );
});
