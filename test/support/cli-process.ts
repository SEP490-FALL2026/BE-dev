import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * The one way a test starts a command as a child process (docs/rules/operational-commands.md, rule 8). Each child and
 * each working directory is recorded **before** it is used and removed in `stopCliProcesses()` (call it from
 * `afterAll`); if Jest itself exits first, the exit hook below still kills what is left. Nothing here asserts: specs
 * keep their own expectations.
 */
export const PROJECT_ROOT = resolve(__dirname, '..', '..');
const TS_NODE = require.resolve('ts-node/register/transpile-only');
/**
 * Node 24 strips types natively and, once the module graph grows, that path fails to resolve modules that exist
 * ("Cannot find module './infrastructure/http/openapi-presentation'") when ts-node loads the graph. ts-node does the
 * compiling, so the native stripping is switched off for the child where this Node has it.
 */
const NATIVE_TYPESCRIPT_OFF: readonly string[] = process.features.typescript ? ['--no-experimental-strip-types'] : [];
/** ts-node compiles the whole module graph on a cold cache. */
export const CLI_COLD_START_MS = 120000;

export interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * On Windows a child's own helper process (Prisma's schema engine) can still hold its working directory for a moment
 * after the child exits; Node retries EBUSY/EPERM/ENOTEMPTY on removal for that case.
 */
const REMOVE = { recursive: true, force: true, maxRetries: 10, retryDelay: 200 } as const;
const running = new Set<ChildProcess>();
const directories = new Set<string>();

process.once('exit', () => {
  for (const child of running) child.kill('SIGKILL');
  for (const directory of directories) rmSync(directory, REMOVE);
});

/** An empty working directory, so no `.env` can be picked up; removed by `stopCliProcesses()`. */
export function cliWorkingDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), `${prefix}-`));
  directories.add(directory);
  return directory;
}

/**
 * Runs `src/<entry>` through ts-node with exactly `environment` plus the process basics (PATH, SystemRoot, TEMP,
 * TMP; a basic named in `environment` takes that value) and no stdin. The child is killed after `timeoutMs`.
 */
export function runCli(entry: string, args: readonly string[], options: RunOptions): Promise<CliResult> {
  return runTypeScript(join('src', entry), args, options);
}

/** Runs a repository script (a path from the project root, e.g. `scripts/dev/export-openapi.ts`) the same way. */
export function runScript(path: string, args: readonly string[], options: RunOptions): Promise<CliResult> {
  return runTypeScript(path, args, options);
}

interface RunOptions {
  cwd: string;
  environment: Record<string, string>;
  timeoutMs?: number;
}

function runTypeScript(path: string, args: readonly string[], options: RunOptions): Promise<CliResult> {
  const environment: Record<string, string> = {
    TS_NODE_TRANSPILE_ONLY: 'true',
    // The working directory is empty, so ts-node must be told where the TypeScript project is.
    TS_NODE_PROJECT: join(PROJECT_ROOT, 'tsconfig.json'),
    ...options.environment,
  };
  for (const name of ['PATH', 'SystemRoot', 'TEMP', 'TMP']) {
    const value = process.env[name];
    if (value !== undefined && !(name in options.environment)) environment[name] = value;
  }

  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      process.execPath,
      [...NATIVE_TYPESCRIPT_OFF, '-r', TS_NODE, join(PROJECT_ROOT, path), ...args],
      {
        cwd: options.cwd,
        env: environment,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    running.add(child);
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => void (stdout += chunk.toString('utf8')));
    child.stderr?.on('data', (chunk: Buffer) => void (stderr += chunk.toString('utf8')));

    const killer = setTimeout(
      () => {
        child.kill('SIGKILL');
        rejectRun(new Error(`${path} did not finish in time\nstdout: ${stdout}\nstderr: ${stderr}`));
      },
      options.timeoutMs ?? CLI_COLD_START_MS - 10000,
    );
    child.on('error', (error) => {
      clearTimeout(killer);
      running.delete(child);
      rejectRun(error);
    });
    child.on('close', (code) => {
      clearTimeout(killer);
      running.delete(child);
      resolveRun({ code, stdout, stderr });
    });
  });
}

/** Kills every child still running and removes every working directory this file created. */
export function stopCliProcesses(): void {
  for (const child of running) child.kill('SIGKILL');
  running.clear();
  for (const directory of directories) rmSync(directory, REMOVE);
  directories.clear();
}

/** How many children are still running (a spec can assert 0 after its last case). */
export function runningCliProcesses(): number {
  return running.size;
}
