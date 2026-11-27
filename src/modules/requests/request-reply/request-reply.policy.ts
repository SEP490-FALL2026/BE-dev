import type { HumanReturn } from './request-reply.types';

/**
 * Identify the latest human return awaiting a reply.
 * If the latest return already has a reply, return null rather than falling back to an older unreplied return.
 */
export function pendingHumanReturn(input: {
  returns: readonly HumanReturn[];
  repliedStepIds: ReadonlySet<string>;
}): HumanReturn | null {
  let latest: HumanReturn | null = null;

  for (const candidate of input.returns) {
    if (latest === null || candidate.closedAt.getTime() > latest.closedAt.getTime()) {
      latest = candidate;
    }
  }

  if (latest === null || input.repliedStepIds.has(latest.stepId)) return null;
  return latest;
}
