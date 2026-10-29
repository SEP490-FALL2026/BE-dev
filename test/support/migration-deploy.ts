import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { appendFileSync } from 'node:fs';

/**
 * The Prisma CLI of the integration harness (H7-RUN-01): one `prisma migrate deploy` as a child process, timed by phase,
 * stopped at its limit, and never left running. `disposable-database.ts` calls it for the one migrated template of a
 * run and for the suites that must deploy themselves (the PostgreSQL role suites, a stalled deploy); every other suite
 * gets a copy of that template. No URL, no credential in what it reports. Nothing here asserts.
 */
export const MIGRATE_TIMEOUT_MS = 60000;

/**
 * Where the time of one `prisma migrate deploy` went (H7-RUN-01), in milliseconds from the start of the setup. No URL, no
 * credential: Prisma's output is kept only for a failure, with every URL removed.
 */
export interface MigrationPhases {
  outcome: 'applied' | 'failed' | 'timed-out' | 'cloned';
  timeoutMs: number;
  /** Connecting to the database and reading the harness marker, before Prisma starts. */
  reachableMs: number;
  /** First output of the Prisma process: Node and the CLI loaded. */
  startedMs: number | null;
  /** First line about the migration history: Prisma connected and read `_prisma_migrations`. */
  historyMs: number | null;
  /** The Prisma process exited. */
  exitedMs: number | null;
  /** Its output pipes closed: no helper process still holds them. */
  closedMs: number | null;
  exitCode: number | null;
  output: string;
}

const running = new Set<ChildProcess>();
let started = 0;

/** Prisma processes started and not yet closed (0 after every setup, failed or not). */
export function runningMigrations(): number {
  return running.size;
}

/** Prisma processes started by this test file so far: a suite that got the template copy started none. */
export function prismaProcessesStarted(): number {
  return started;
}
process.once('exit', () => {
  for (const child of running) stopProcessTree(child);
});

/**
 * Stops the Prisma CLI and every process it started. The CLI runs `migrate deploy` in a separate schema-engine process
 * that owns the database connection and talks to the CLI over pipes: a SIGKILL of the CLI alone leaves that engine
 * running, blocked on its statement and still holding the session (H7-RUN-01, seen on Linux CI). On POSIX the CLI leads
 * its own process group (`detached`), so one signal reaches the engine; Windows has no groups, `taskkill /T` walks the
 * tree while the CLI is still alive.
 */
function stopProcessTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid !== undefined && child.exitCode === null && child.signalCode === null) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        // The group is already gone.
      }
    }
  }
  child.kill('SIGKILL');
}

export function deployMigrations(url: string, reachableMs: number, timeoutMs: number): Promise<MigrationPhases> {
  const base = performance.now() - reachableMs;
  const at = (): number => Math.round(performance.now() - base);
  const phases: MigrationPhases = {
    outcome: 'failed',
    timeoutMs,
    reachableMs: Math.round(reachableMs),
    startedMs: null,
    historyMs: null,
    exitedMs: null,
    closedMs: null,
    exitCode: null,
    output: '',
  };
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: url,
        TEST_DATABASE_URL: url,
        // No update check (P28-13): the Prisma CLI otherwise calls checkpoint.prisma.io from a detached child and can
        // wait on it, so a slow network stalled a deploy past the time limit; the child also held its working directory.
        CHECKPOINT_DISABLE: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      // POSIX: a process group of its own, so stopping it reaches the schema engine too (stopProcessTree).
      detached: process.platform !== 'win32',
      windowsHide: true,
    });
    running.add(child);
    started += 1;
    const read = (chunk: Buffer): void => {
      phases.startedMs ??= at();
      phases.output += chunk.toString('utf8');
      if (
        phases.historyMs === null &&
        /Applying migration|No pending migrations|migrations? (?:have|has) been|Error/.test(phases.output)
      )
        phases.historyMs = at();
    };
    child.stdout?.on('data', read);
    child.stderr?.on('data', read);
    const timer = setTimeout(() => {
      phases.outcome = 'timed-out';
      stopProcessTree(child);
    }, timeoutMs);
    child.on('exit', (code) => {
      phases.exitedMs = at();
      phases.exitCode = code;
    });
    child.on('close', () => {
      clearTimeout(timer);
      running.delete(child);
      phases.closedMs = at();
      if (phases.outcome !== 'timed-out') phases.outcome = phases.exitCode === 0 ? 'applied' : 'failed';
      resolve(phases);
    });
  });
}

/** Diagnostics only: one JSON line per deploy to `TEST_MIGRATION_TIMINGS_FILE` when it is set (H7-RUN-01). */
export function recordTimings(database: string, phases: MigrationPhases): void {
  const file = process.env.TEST_MIGRATION_TIMINGS_FILE;
  if (!file) return;
  const caller = /test[\\/]integration[\\/]([\w.-]+)/.exec(new Error().stack ?? '')?.[1] ?? 'unknown';
  // Phases only: Prisma's output stays out of the file.
  const timings = { ...phases, output: undefined };
  appendFileSync(file, `${JSON.stringify({ suite: caller, database, ...timings })}\n`);
}

/** Diagnostics only: the copy of the migrated template a suite got instead of a deploy, in the same timing file. */
export function recordCopy(database: string, elapsedMs: number): void {
  const elapsed = Math.round(elapsedMs);
  recordTimings(database, {
    outcome: 'cloned',
    timeoutMs: 0,
    reachableMs: 0,
    startedMs: null,
    historyMs: null,
    exitedMs: elapsed,
    closedMs: elapsed,
    exitCode: null,
    output: '',
  });
}

/**
 * Why a deploy failed, so a failure reads as what it was (P28-13, H7-RUN-01): the time limit with the phase it stopped in,
 * or Prisma's own error (a migration that does not apply). The tail of Prisma's output is kept with every URL removed;
 * Prisma prints host, database and the failing statement's message, never a password.
 */
export function migrationFailure(phases: MigrationPhases): string {
  const timeline = `phases (ms): reachable ${phases.reachableMs}, Prisma started ${phases.startedMs ?? '-'}, history read ${phases.historyMs ?? '-'}, exited ${phases.exitedMs ?? '-'}, pipes closed ${phases.closedMs ?? '-'}`;
  if (phases.outcome === 'timed-out') {
    return `Migration deployment did not finish within ${phases.timeoutMs / 1000} s on the disposable database (the process was stopped); ${timeline}.`;
  }
  const output = phases.output
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '<url>')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .slice(-12)
    .join('\n');

  return `Migration deployment failed on the disposable database (exit ${phases.exitCode ?? '-'}; ${timeline}). Prisma said:\n${output}`;
}
