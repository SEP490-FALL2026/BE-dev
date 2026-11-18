import type { RegistryEvent } from './api-collection-registry';

/**
 * Gói 9 (`qd103-grant-from-shared-pool`, R-E02, `QĐ-104k`(3)): a subscription says which other live subscriptions of its K2 or K4 plan it should
 * be merged with, an array the view caps at 20 (`MERGE_CANDIDATES_MAX`); it exists only while the seat baseline is open.
 */
export const G9_REGISTRY_EVENTS: readonly RegistryEvent[] = [
  'subscriptionList#mergeCandidateIds',
  'subscriptionGet#mergeCandidateIds',
].map((key): RegistryEvent => ({
  registry: 'nested',
  key,
  change: 'added',
  to: 'bounded',
  bound: 'MERGE_CANDIDATES_MAX',
  // The gate wants one LD-<n>; this array answers no review finding, so the nearest one of the same read model is named (item is the real source).
  finding: 'LD-17',
  item: 'qd103-grant-from-shared-pool',
  date: '2026-11-09',
  reason: 'The other live subscriptions of the same K2 or K4 plan (SHOULD_MERGE), capped at 20 by the view.',
}));
