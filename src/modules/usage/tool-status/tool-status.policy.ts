import { businessDateAt } from '../../../core/business-date';
import type { AiToolKey } from '../allowlist/allowlist.policy';
import { CLOCK_SKEW_MS } from '../ai-usage/ai-usage-day.policy';
import type { RejectionReason } from '../intake-gate/intake-rejection.repo';

export type QuotaWindowCode =
  'PRIMARY' | 'SECONDARY' | 'SESSION' | 'WEEKLY_ALL' | 'WEEKLY_MODEL' | 'FIVE_HOUR' | 'DAILY' | 'WEEKLY';

/** The windows each tool can report; a code outside its set is a tool reporting what it cannot know. */
export const WINDOW_CODES_OF: Readonly<Record<AiToolKey, readonly QuotaWindowCode[]>> = {
  CODEX: ['PRIMARY', 'SECONDARY'],
  CLAUDE_CODE: ['SESSION', 'WEEKLY_ALL', 'WEEKLY_MODEL'],
  ANTIGRAVITY_CLI: ['FIVE_HOUR', 'DAILY', 'WEEKLY'],
};

export interface SnapshotInput {
  tool: AiToolKey;
  observedAt: Date;
  auth: { status: 'LOGGED_IN' | 'LOGGED_OUT' | 'UNKNOWN' | 'NOT_SUPPORTED' };
  quota: {
    status: 'OK' | 'NOT_SUPPORTED' | 'FAILED';
    windows: readonly { code: QuotaWindowCode; usedPercent: number; resetsAt: Date | null }[];
  };
}

export interface SnapshotEvaluationInput {
  snapshots: readonly SnapshotInput[];
  now: Date;
  acceptFromAt: Date | null;
  acceptUntilAt: Date | null;
  timeZone: string;
  allowedOn(date: string): ReadonlyMap<AiToolKey, string>;
}

/**
 * Judges each snapshot of a tool's login and quota, in a fixed order (`US-09-05` AC-13): a clock ahead of the server, an instant outside the
 * window of the machine, a tool not on the allowlist that day, a quota that contradicts itself (`OK` with no window, another status with
 * one, a window twice or one the tool does not have). Returns the reason for each snapshot, null when it may be kept.
 */
export function evaluateSnapshots(input: SnapshotEvaluationInput): (RejectionReason | null)[] {
  return input.snapshots.map((snapshot) => {
    if (snapshot.observedAt.getTime() > input.now.getTime() + CLOCK_SKEW_MS) return 'FUTURE_OBSERVED_AT';
    const observed = snapshot.observedAt.getTime();
    if (
      !input.acceptFromAt ||
      observed < input.acceptFromAt.getTime() ||
      (input.acceptUntilAt !== null && observed > input.acceptUntilAt.getTime())
    ) {
      return 'OUTSIDE_WINDOW';
    }
    if (!input.allowedOn(businessDateAt(snapshot.observedAt, input.timeZone)).has(snapshot.tool))
      return 'NOT_IN_ALLOWLIST';
    const codes = snapshot.quota.windows.map((window) => window.code);
    const knows = new Set(WINDOW_CODES_OF[snapshot.tool]);
    const contradicts =
      (snapshot.quota.status === 'OK') === (codes.length === 0) ||
      new Set(codes).size !== codes.length ||
      codes.some((code) => !knows.has(code));

    return contradicts ? 'INVALID_QUOTA' : null;
  });
}
