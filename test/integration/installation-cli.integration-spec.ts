import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const CLI = join(PROJECT_ROOT, 'src', 'installation-cli.ts');
const TS_NODE = require.resolve('ts-node/register/transpile-only');
/** ts-node compiles the whole module graph on a cold cache. */
const COLD_START_MS = 120000;

const REQUIRED_ARGUMENTS = [
  ...['--timezone', 'Asia/Ho_Chi_Minh', '--currency', 'VND'],
  ...['--organization-name', 'Cong ty Thu nghiem Review'],
  ...['--cost-center-code', 'CC-IT', '--cost-center-name', 'Khoi Cong nghe'],
  ...['--department-code', 'IT', '--department-name', 'Phong Cong nghe Thong tin'],
  ...['--job-title', 'Chuyen vien Cong nghe'],
  ...['--admin-code', 'SA001', '--admin-name', 'Quan tri Gia lap'],
  ...['--admin-email', 'sa.review@example.test', '--admin-hire-date', '2026-01-05'],
  ...['--it-code', 'IT001', '--it-name', 'Ky thuat Gia lap'],
  ...['--it-email', 'it.review@example.test', '--it-hire-date', '2026-02-02'],
  ...['--operator-reference', 'REVIEW-G0G1-20261014', '--environment', 'LOCAL_TEST'],
];

interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

describe('installation command (integration, spawned process)', () => {
  let workingDirectory: string;

  beforeAll(() => {
    // An empty directory, so no .env file can be picked up from the working directory.
    workingDirectory = mkdtempSync(join(tmpdir(), 'slm-installation-cli-'));
  });

  afterAll(() => {
    rmSync(workingDirectory, { recursive: true, force: true });
  });

  /** Runs the command with a minimal environment and no stdin; the child is killed if it hangs. */
  const run = (args: string[], extraEnvironment: Record<string, string> = {}): Promise<CliResult> =>
    new Promise((resolveRun, rejectRun) => {
      const environment: Record<string, string> = {
        NODE_ENV: 'production',
        TS_NODE_TRANSPILE_ONLY: 'true',
        // The working directory is empty, so ts-node must be told where the TypeScript project is.
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
        rejectRun(new Error(`installation command did not finish in time\nstdout: ${stdout}\nstderr: ${stderr}`));
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
