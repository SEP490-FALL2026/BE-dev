import {
  CLI_COLD_START_MS,
  cliWorkingDirectory,
  runCli,
  stopCliProcesses,
  type CliResult,
} from '../../support/cli-process';
import { RECOVERY_USAGE } from '../../../src/cli/recover/recover.arguments';

/**
 * US-01-09: the recovery command is an operator tool, so what matters is what an operator sees. These cases run the
 * real entry point (src/cli.ts recover through ts-node) as a child process and check exit code and output. They need
 * no database: the command must answer on its own arguments and environment before it touches anything.
 */
/** ts-node compiles the whole module graph on a cold cache. */
const COLD_START_MS = CLI_COLD_START_MS;

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

describe('recovery command (integration, spawned process)', () => {
  let workingDirectory: string;

  beforeAll(() => {
    // An empty directory, so no .env file can be picked up from the working directory.
    workingDirectory = cliWorkingDirectory('slm-recovery-cli');
  });

  afterAll(() => {
    stopCliProcesses();
  });

  /** Runs the command with a minimal environment and no stdin; the child is killed if it hangs. */
  const run = (args: string[], extraEnvironment: Record<string, string> = {}): Promise<CliResult> =>
    runCli('recover', args, {
      cwd: workingDirectory,
      environment: { NODE_ENV: 'production', ...extraEnvironment },
      timeoutMs: COLD_START_MS - 10000,
    });

  const stackLines = (text: string): string[] => text.split(/\r?\n/).filter((line) => /^\s+at /.test(line));

  it(
    'prints the usage and exits 0 for --help, with nothing configured',
    async () => {
      const result = await run(['--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage: pnpm ops:recover');
      expect(result.stdout).toContain('account (EMPLOYEE)');
      expect(result.stdout).not.toContain('no role');
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
        LICENSE_KEY_VAULT_KEY: Buffer.alloc(32, 6).toString('base64'),
        LICENSE_KEY_VAULT_KEY_ID: 'recovery-vault-1',
        LICENSE_KEY_FINGERPRINT_PEPPER: 'recovery-spec-fingerprint-pepper-0123',
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
