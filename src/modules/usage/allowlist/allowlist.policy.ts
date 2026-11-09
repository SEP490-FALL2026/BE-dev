import { addDays, type BusinessDate } from '../../../core/business-date';
import { instantAtWallClock } from '../../../core/working-days';

export const AI_TOOL_KEYS = ['CLAUDE_CODE', 'CODEX', 'ANTIGRAVITY_CLI'] as const;
export type AiToolKey = (typeof AI_TOOL_KEYS)[number];

/** Tools whose reading of usage is still being proven; shown with a label, not stored. */
export const AI_TOOL_EXPERIMENTAL: ReadonlySet<AiToolKey> = new Set<AiToolKey>(['ANTIGRAVITY_CLI']);

export interface ToolMapping {
  tool: AiToolKey;
  applicationId: string;
}

export interface CollectorApplication {
  kind: 'SAAS' | 'LICENSED' | 'INTERNAL';
  isCommunicationService: boolean;
  retiredAt: Date | null;
}

export type ApplicationVerdict = 'OK' | 'NOT_FOUND' | 'NOT_ELIGIBLE';

/**
 * Whether an application may be named on the allowlist: it exists, is software the company buys (not one it built) and is not a
 * messaging or meeting service, whose usage is never collected (`ADR-10`, `QĐ-62o`), and is not retired.
 */
export function judgeApplication(application: CollectorApplication | undefined): ApplicationVerdict {
  if (!application) return 'NOT_FOUND';
  if (application.kind === 'INTERNAL' || application.isCommunicationService || application.retiredAt)
    return 'NOT_ELIGIBLE';

  return 'OK';
}

const keyOf = (mapping: ToolMapping): string => `${mapping.tool}:${mapping.applicationId}`;

/** Whether publishing `next` would change nothing: the same tools for the same applications as the version in force. */
export function isSameList(current: readonly ToolMapping[], next: readonly ToolMapping[]): boolean {
  const have = new Set(current.map(keyOf));

  return have.size === next.length && next.every((mapping) => have.has(keyOf(mapping)));
}

/** The tool keys a new version adds and removes, for the audit. */
export function changeOf(
  current: readonly ToolMapping[],
  next: readonly ToolMapping[],
): { added: string[]; removed: string[] } {
  const before = new Set(current.map((mapping) => mapping.tool));
  const after = new Set(next.map((mapping) => mapping.tool));

  return {
    added: [...after].filter((tool) => !before.has(tool)).sort(),
    removed: [...before].filter((tool) => !after.has(tool)).sort(),
  };
}

export interface PublishedVersion {
  publishedAt: Date;
  entries: readonly ToolMapping[];
}

/**
 * The tools a collector may report for a local day (`US-09-02` AC-7): a tool counts when some version that lists it was in force at
 * any moment of that day (a version is in force from its publication to the next one), so a tool allowed in the morning and removed
 * in the afternoon is still accepted for that day. The application is the one of the latest such version. Versions come oldest first.
 */
export function allowedToolsOn(
  versions: readonly PublishedVersion[],
  date: BusinessDate,
  timeZone: string,
): Map<AiToolKey, string> {
  const dayStart = instantAtWallClock({ date, msOfDay: 0 }, timeZone);
  const dayEnd = instantAtWallClock({ date: addDays(date, 1), msOfDay: 0 }, timeZone);
  const allowed = new Map<AiToolKey, string>();
  versions.forEach((version, index) => {
    const next = versions[index + 1];
    const inForce = version.publishedAt < dayEnd && (!next || next.publishedAt > dayStart);
    if (!inForce) return;
    for (const entry of version.entries) allowed.set(entry.tool, entry.applicationId);
  });

  return allowed;
}
