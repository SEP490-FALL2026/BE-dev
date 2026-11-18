import type { RegistryEvent } from './api-collection-registry';

/** The events of the nested-array registry written by `X-IT.5` (the admins of the plan at the vendor on a subscription, P19, `QĐ-110k`, of `mf2-mf3`). */
export const XIT_REGISTRY_EVENTS: readonly RegistryEvent[] = ['subscriptionGet', 'subscriptionList'].map(
  (operation): RegistryEvent => ({
    registry: 'nested',
    key: `${operation}#vendorAdmins`,
    change: 'added',
    to: 'bounded',
    bound: 'VENDOR_ADMINS_MAX',
    finding: 'LD-14',
    item: 'catalog-subscription-read-model',
    date: '2026-11-13',
    reason:
      'The admins of the plan of a subscription at the vendor (P19): at most VENDOR_ADMINS_MAX, the members of the workspace profile.',
  }),
);
