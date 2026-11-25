import type { NestedArrayEntry } from './api-collection-registry';

const bounded = (key: string, maxItems: number, source: string, rationale: string): NestedArrayEntry => ({
  key,
  classification: 'bounded',
  findings: [],
  owner: 'g3-plan-declaration',
  businessMaximum: { maxItems, source },
  rationale,
  removeWhen: 'Review when the bound in the source changes.',
});

/** The nested arrays of the answers the tech lane of redesign wave 3 adds. */
export const NESTED_ARRAYS_REDESIGN_W3_TECH: readonly NestedArrayEntry[] = [
  bounded(
    'workspaceGet#admins',
    20,
    'WORKSPACE_ADMINS_MAX in workspace.dto.ts, the maxItems of the schema: the administrators of one workspace, as many as the replace route takes',
    'The administrators of one workspace (a handful: at least two, at most twenty).',
  ),
  bounded(
    'workspaceGet#admins.flags',
    1,
    'WORKSPACE_ADMIN_FLAGS_MAX in workspace.dto.ts, the maxItems of the schema: the one flag a reader sees on an administrator',
    'What a reader is warned of about one administrator.',
  ),
  bounded(
    'workspaceGet#flags',
    3,
    'WORKSPACE_FLAGS_MAX in workspace.dto.ts, the maxItems of the schema: the three flags of a workspace (ADMINS_BELOW_MINIMUM, NO_OWNER_EMAIL, NO_RESPONSIBLE)',
    'What a reader is warned of about the workspace.',
  ),
  bounded(
    'workspaceList#flags',
    3,
    'WORKSPACE_FLAGS_MAX in workspace.dto.ts, the maxItems of the schema: the three flags of a workspace (ADMINS_BELOW_MINIMUM, NO_OWNER_EMAIL, NO_RESPONSIBLE)',
    'What a reader is warned of about each workspace of the page.',
  ),
  bounded(
    'subscriptionGet#lines',
    20,
    'SUBSCRIPTION_LINES_MAX in subscription.dto.ts, the maxItems of the schema: the plan lines of one subscription period',
    'The plan lines of a subscription period (at most SUBSCRIPTION_LINES_MAX = 20).',
  ),
];
