import { pgConnectivityMessage, TransientDatabaseError } from '../../infrastructure/database/transaction-runner';
import { describeForOperator } from '../../infrastructure/observability/operator-error';

/**
 * A failure of `ops:demo-dataset` as the operator reads it: the kind of error, its code or SQLSTATE and whether trying
 * again can help (describeForOperator), plus the fixed message node-postgres writes for a connectivity failure
 * ("Query read timeout", "Connection terminated unexpectedly", …). A Prisma call outside TransactionRunner throws such a
 * failure as a plain `Error`, so without that message the line said only "Error". Never the message of any other error,
 * a URL, a token or a password.
 */
export function describeDemoFailure(error: unknown): string {
  const pg = pgConnectivityMessage(error instanceof TransientDatabaseError ? error.reason : error);
  const line = describeForOperator(error);

  return pg === undefined ? line : `${line} pg="${pg}"`;
}

/**
 * - `secrets`: reading the two passwords from stdin.
 * - `startup`: opening the command's Nest graph; in production this is where the runtime-role check
 *   (RuntimeDatabaseRoleGuard) runs the first database query, outside TransactionRunner.
 * - `installation-facts`, `apply-lock`, `api-proof`, `calendar`, `steps`, `lock-release`: the run itself
 *   (demo-dataset-run.ts).
 */
export type DemoRunPhase =
  'secrets' | 'startup' | 'installation-facts' | 'apply-lock' | 'api-proof' | 'calendar' | 'steps' | 'lock-release';

/** Where a run is, so the line written when it fails names the phase and how long the phase and the run lasted. */
export class DemoRunClock {
  private readonly startedAt: number;
  private phase: DemoRunPhase | 'start' = 'start';
  private phaseStartedAt: number;

  constructor(private readonly now: () => number = () => performance.now()) {
    this.startedAt = now();
    this.phaseStartedAt = this.startedAt;
  }

  enter(phase: DemoRunPhase): void {
    this.phase = phase;
    this.phaseStartedAt = this.now();
  }

  failureLine(error: unknown): string {
    const now = this.now();
    const phaseMs = Math.round(now - this.phaseStartedAt);
    const runMs = Math.round(now - this.startedAt);

    return `The demo dataset run failed in phase ${this.phase} after ${phaseMs} ms (run ${runMs} ms): ${describeDemoFailure(error)}`;
  }
}
