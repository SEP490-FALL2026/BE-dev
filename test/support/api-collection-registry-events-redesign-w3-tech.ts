import type { RegistryEvent } from './api-collection-registry';

const added = (key: string, bound: string, reason: string): RegistryEvent => ({
  registry: 'nested',
  key,
  change: 'added',
  to: 'bounded',
  bound,
  finding: 'LD-14',
  item: 'g3-plan-declaration',
  date: '2026-11-25',
  reason,
});

/** The events of the nested-array registry written by the tech lane of redesign wave 3. */
export const REDESIGN_W3_TECH_REGISTRY_EVENTS: readonly RegistryEvent[] = [
  added(
    'workspaceGet#admins',
    'WORKSPACE_ADMINS_MAX',
    'The administrators of one workspace: at most WORKSPACE_ADMINS_MAX, the number the replace route takes (W3-10).',
  ),
  added(
    'workspaceGet#admins.flags',
    'WORKSPACE_ADMIN_FLAGS_MAX',
    'What a reader is warned of about one administrator: at most WORKSPACE_ADMIN_FLAGS_MAX flag (W3-10).',
  ),
  added(
    'workspaceGet#flags',
    'WORKSPACE_FLAGS_MAX',
    'What a reader is warned of about a workspace: at most WORKSPACE_FLAGS_MAX flags (W3-10).',
  ),
  added(
    'workspaceList#flags',
    'WORKSPACE_FLAGS_MAX',
    'What a reader is warned of about each workspace of a page: at most WORKSPACE_FLAGS_MAX flags (W3-10).',
  ),
  added(
    'subscriptionGet#lines',
    'SUBSCRIPTION_LINES_MAX',
    'The plan lines of a subscription period: at most SUBSCRIPTION_LINES_MAX (W3-15).',
  ),
  {
    registry: 'exceptions',
    key: 'subscriptionList#detail-reuse',
    change: 'closed',
    finding: 'LD-01',
    item: 'catalog-subscription-read-model',
    date: '2026-11-26',
    reason:
      'subscriptionGet now includes lines[] while subscriptionList returns summary fields lineCount and seatsToday (W3-15).',
  },
];
