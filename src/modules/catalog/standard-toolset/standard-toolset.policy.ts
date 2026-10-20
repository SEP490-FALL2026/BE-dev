import {
  ToolsetPlanDuplicateError,
  ToolsetReasonRequiredError,
  ToolsetTooManyPlansError,
} from './standard-toolset.errors';

export const MAX_TOOLSET_PLANS = 50;

/**
 * The input of a change as it is kept: the reason trimmed and required (`AC-2`), the plan ids in lower case and in order, at
 * most fifty and none twice. The checks run in that order, so a change with no reason is refused for it whatever else is
 * wrong. An empty list is allowed: IT may empty a toolset. Whether the plans are in the catalog is the service's to check.
 */
export function cleanToolsetInput(input: { planIds: readonly string[]; reason: string }): {
  planIds: string[];
  reason: string;
} {
  const reason = input.reason.trim();
  if (reason.length === 0) throw new ToolsetReasonRequiredError();
  if (input.planIds.length > MAX_TOOLSET_PLANS) throw new ToolsetTooManyPlansError();

  const planIds = input.planIds.map((id) => id.toLowerCase());
  const seen = new Set<string>();
  for (const id of planIds) {
    if (seen.has(id)) throw new ToolsetPlanDuplicateError(id);
    seen.add(id);
  }

  return { planIds: planIds.sort(), reason };
}

/** True when two sorted lists of plan ids are the same plans. */
export function sameToolset(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
