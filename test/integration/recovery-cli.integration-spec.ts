import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { RECOVERY_USAGE } from '../../src/modules/identity-access/recovery/recovery.arguments';

/**
 * US-01-09: the recovery command is an operator tool, so what matters is what an operator sees. These cases run the
 * real entry point (src/recovery-cli.ts through ts-node) as a child process and check exit code and output. They need
 * no database: the command must answer on its own arguments and environment before it touches anything.
 */
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const CLI = join(PROJECT_ROOT, 'src', 'recovery-cli.ts');
const TS_NODE = require.resolve('ts-node/register/transpile-only');
/** ts-node compiles the whole module graph on a cold cache. */
const COLD_START_MS = 120000;

const TICKET = [
  '--ticket',
  'R-2026-014',
  '--approved-by',
  'cto@acme.vn',
  '--operator',
  'ops-1',
  '--environment',
  'SHARED',
];

interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

describe('recovery command (integration, spawned process)', () => {
  let workingDirectory: string;

  beforeAll(() => {
    // An empty directory, so no .env file can be picked up from the working directory.
    workingDirectory = mkdtempSync(join(tmpdir(), 'slm-recovery-cli-'));
  });

  afterAll(() => {
    rmSync(workingDirectory, { recursive: true, force: true });
  });

  const run = (args: string[], extraEnvironment: Record<string, string> = {}): Promise<CliResult> =>
    new Promise((resolveRun, rejectRun) => {
      const environment: Record<string, string> = {
        NODE_ENV: 'production',
        TS_NODE_TRANSPILE_ONLY: 'true',
        TS_NODE_PROJECT: join(PROJECT_ROOT, 'tsconfig.json'),
        ...extraEnvironment,
      };
      for (const name of ['PATH', 'SystemRoot', 'TEMP', 'TMP']) {
        const value = process.env[name];
        if (value !== undefined) environment[name] = value;
      }

      const child = spawn(process.execPath, ['-r', TS_NODE, CLI, ...args], {
        cwd: workingDirectory,
        env: environment,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => void (stdout += chunk.toString('utf8')));
      child.stderr.on('data', (chunk: Buffer) => void (stderr += chunk.toString('utf8')));

      const killer = setTimeout(() => {
        child.kill('SIGKILL');
        rejectRun(new Error(`recovery command did not finish in time\nstdout: ${stdout}\nstderr: ${stderr}`));
      }, COLD_START_MS - 10000);
      child.on('error', (error) => {
        clearTimeout(killer);
        rejectRun(error);
      });
      child.on('close', (code) => {
        clearTimeout(killer);
        resolveRun({ code, stdout, stderr });
      });
    });

  const stackLines = (text: string): string[] => text.split(/\r?\n/).filter((line) => /^\s+at /.test(line));

  it(
    'prints the usage and exits 0 for --help, with nothing configured',
    async () => {
      const result = await run(['--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage: pnpm ops:recover');
      expect(result.stdout).toMatch(/exit codes/i);
      expect(result.stderr).toBe('');
    },
    COLD_START_MS,
  );

  it(
    'prints exactly the usage for --help (H6.3/ROOT.1 parity)',
    async () => {
      expect(await run(['--help'])).toEqual({ code: 0, stdout: `${RECOVERY_USAGE}\n`, stderr: '' });
    },
    COLD_START_MS,
  );

  it(
    'reports an unexpected failure by error name only, with no stack and no configured value',
    async () => {
      const result = await run(['unlock', ...TICKET, '--account-email', 'a@acme.vn'], {
        DATABASE_URL: 'postgresql://user:s3cr3t-pw@127.0.0.1:1/x',
        CORS_ORIGINS: 'https://licenses.example.com',
        AUTH_ACCESS_TOKEN_SECRET: 'recovery-spec-access-token-secret-0123456789',
        AUTH_THROTTLE_PEPPER: 'recovery-spec-pepper-0123',
        APP_PUBLIC_URL: 'https://licenses.example.com',
        OUTBOX_PAYLOAD_KEY: Buffer.alloc(32, 4).toString('base64'),
        OUTBOX_PAYLOAD_KEY_ID: 'recovery-1',
        SMTP_HOST: 'smtp.example.com',
        SMTP_FROM: 'no-reply@licenses.example.com',
        SMTP_TLS: 'true',
        REDIS_HOST: 'redis.internal',
        REDIS_PASSWORD: 'recovery-spec-redis-password',
        OBJECT_STORAGE_ENDPOINT: 'https://storage.example.com',
        OBJECT_STORAGE_BUCKET: 'recovery-bucket',
        OBJECT_STORAGE_ACCESS_KEY_ID: 'recovery-access',
        OBJECT_STORAGE_SECRET_ACCESS_KEY: 'recovery-secret',
      });

      expect(result).toEqual({
        code: 1,
        stdout: '',
        stderr: 'The recovery failed; check the state before running it again: PrismaClientKnownRequestError\n',
      });
    },
    COLD_START_MS,
  );

  it(
    'refuses a password given as an option, by name, before any environment or database is read',
    async () => {
      const result = await run(['reset-credentials', ...TICKET, '--account-email', 'a@acme.vn', '--password', 'x']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('takes no password, code or link');
      expect(stackLines(result.stderr)).toEqual([]);
    },
    COLD_START_MS,
  );

  it(
    'names the missing part of the command as the first line, and no stack',
    async () => {
      const result = await run(['unlock', '--ticket', 'R-1', '--account-email', 'a@acme.vn']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('--environment is required.');
      expect(stackLines(result.stderr)).toEqual([]);
    },
    COLD_START_MS,
  );

  it(
    'reports a missing DATABASE_URL by name, without a stack, and echoes no password of a rejected one',
    async () => {
      const missing = await run(['unlock', ...TICKET, '--account-email', 'a@acme.vn']);
      const rejected = await run(['unlock', ...TICKET, '--account-email', 'a@acme.vn'], {
        DATABASE_URL: 'mysql://user:s3cr3t-pw@127.0.0.1:1/x',
      });

      expect(missing.code).toBe(1);
      expect(missing.stderr).toContain('Environment validation failed: "DATABASE_URL" is required');
      expect(stackLines(missing.stderr)).toEqual([]);
      expect(rejected.code).toBe(1);
      expect(rejected.stderr).toContain('Environment validation failed');
      expect(rejected.stderr).not.toContain('s3cr3t-pw');
      expect(rejected.stdout).not.toContain('s3cr3t-pw');
    },
    COLD_START_MS * 2,
  );
});
