import {
  CLI_COLD_START_MS,
  cliWorkingDirectory,
  runCli,
  stopCliProcesses,
  type CliResult,
} from '../support/cli-process';
import { INSTALLATION_USAGE } from '../../src/modules/installation/installation.arguments';

/**
 * R-13: the installation command is an operator tool, so what matters is what an operator sees. These cases
 * run the real entry point (src/installation-cli.ts through ts-node) as a child process and check exit code
 * and output. They need no database: the command must fail on its own environment before any prompt or query.
 *
 * - `--help` works with nothing configured.
 * - A missing DATABASE_URL is reported by name, as one clean line, before the password prompt, with no stack.
 *   (Without `abortOnError: false` Nest would print nothing and exit 1; the case would then fail on the message.)
 * - A rejected DATABASE_URL never echoes the password it contained.
 */
/** ts-node compiles the whole module graph on a cold cache. */
const COLD_START_MS = CLI_COLD_START_MS;

const REQUIRED_ARGUMENTS = [
  ...['--timezone', 'Asia/Ho_Chi_Minh', '--currency', 'VND'],
  ...['--organization-name', 'Cong ty Thu nghiem Review'],
  ...['--department-code', 'IT', '--department-name', 'Phong Cong nghe Thong tin'],
  ...['--admin-code', 'SA001', '--admin-name', 'Quan tri Gia lap'],
  ...['--admin-email', 'sa.review@example.test', '--admin-hire-date', '2026-01-05'],
  ...['--operator-reference', 'REVIEW-G0G1-20261014', '--environment', 'LOCAL_TEST'],
];

describe('installation command (integration, spawned process)', () => {
  let workingDirectory: string;

  beforeAll(() => {
    // An empty directory, so no .env file can be picked up from the working directory.
    workingDirectory = cliWorkingDirectory('slm-installation-cli');
  });

  afterAll(() => {
    stopCliProcesses();
  });

  /** Runs the command with a minimal environment and no stdin; the child is killed if it hangs. */
  const run = (args: string[], extraEnvironment: Record<string, string> = {}): Promise<CliResult> =>
    runCli('installation-cli.ts', args, {
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
      expect(result.stdout).toContain('Usage');
      expect(result.stdout).toMatch(/exit codes?/i);
      expect(result.stderr).toBe('');
    },
    COLD_START_MS,
  );

  it(
    'reports a missing DATABASE_URL by name, before asking for a password, without a stack',
    async () => {
      const result = await run(REQUIRED_ARGUMENTS);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Environment validation failed: "DATABASE_URL" is required');
      expect(stackLines(result.stderr)).toEqual([]);
      // Validation happens before the prompt: the operator is never asked for a password first.
      expect(result.stdout).not.toContain('Password');
    },
    COLD_START_MS,
  );

  it(
    'prints exactly the usage for --help, and exactly the reason plus the usage for an unknown option (H6.3/ROOT.1 parity)',
    async () => {
      const help = await run(['--help']);
      const unknown = await run(['--bogus']);

      expect(help).toEqual({ code: 0, stdout: `${INSTALLATION_USAGE}\n`, stderr: '' });
      expect(unknown).toEqual({ code: 1, stdout: '', stderr: `Unknown option '--bogus'\n\n${INSTALLATION_USAGE}\n` });
    },
    COLD_START_MS * 2,
  );

  it(
    'refuses the options of the earlier command (a Cost Center, a job title, an IT employee) as unknown, before any database is read (QĐ-87f)',
    async () => {
      for (const option of ['--cost-center-code', '--job-title', '--it-code']) {
        const result = await run([...REQUIRED_ARGUMENTS, option, 'X']);

        expect(result).toEqual({
          code: 1,
          stdout: '',
          stderr: `Unknown option '${option}'\n\n${INSTALLATION_USAGE}\n`,
        });
      }
    },
    COLD_START_MS * 3,
  );

  it(
    'reaches the password prompt in development with only a database URL: it never needs the API secrets (E3)',
    async () => {
      const result = await run(REQUIRED_ARGUMENTS, {
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:s3cr3t-pw@127.0.0.1:1/x',
      });

      expect(result).toEqual({
        code: 1,
        stdout: 'You are creating the Super Admin account. Choose its password now.\n',
        stderr:
          'A password can only be entered at an interactive terminal; it is never taken from arguments, the environment or a pipe.\n',
      });
    },
    COLD_START_MS,
  );

  it(
    'with --password-stdin and nothing on standard input, stops before any write with one clean line, no prompt and no stack (Prompt 06)',
    async () => {
      const result = await run([...REQUIRED_ARGUMENTS, '--password-stdin'], {
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:s3cr3t-pw@127.0.0.1:1/x',
      });

      expect(result).toEqual({
        code: 1,
        stdout: '',
        stderr: 'No password was received on standard input (the input ended at once). Nothing was changed.\n',
      });
    },
    COLD_START_MS,
  );

  it(
    'with --password-stdin still validates the environment first and never reads standard input for it (Prompt 06)',
    async () => {
      const result = await run([...REQUIRED_ARGUMENTS, '--password-stdin']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Environment validation failed: "DATABASE_URL" is required');
      expect(stackLines(result.stderr)).toEqual([]);
      expect(result.stdout).toBe('');
    },
    COLD_START_MS,
  );

  it(
    'refuses a value given to --password-stdin, attached or as the next word, with the usage and without echoing it (Prompt 06)',
    async () => {
      for (const extra of [['--password-stdin=never-printed-canary'], ['--password-stdin', 'never-printed-canary']]) {
        const result = await run([...REQUIRED_ARGUMENTS, ...extra]);

        expect(result.code).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain(INSTALLATION_USAGE);
        expect(result.stderr).not.toContain('never-printed-canary');
      }
    },
    COLD_START_MS * 2,
  );

  it(
    'rejects an unusable DATABASE_URL with a clean message that does not echo the password in it',
    async () => {
      const result = await run(REQUIRED_ARGUMENTS, { DATABASE_URL: 'mysql://user:s3cr3t-pw@127.0.0.1:1/x' });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Environment validation failed');
      expect(stackLines(result.stderr)).toEqual([]);
      expect(result.stdout).not.toContain('Password');
      expect(result.stdout).not.toContain('s3cr3t-pw');
      expect(result.stderr).not.toContain('s3cr3t-pw');
    },
    COLD_START_MS,
  );
});
