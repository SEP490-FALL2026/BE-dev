import type { NestedArrayEntry } from './api-collection-registry';

const source =
  'VENDOR_ADMINS_MAX in subscription.dto.ts, the maxItems of vendorAdmins: the members of the workspace profile of a plan (at most 20 people)';

/** The nested arrays of the subscription answers added by `X-IT.5` (the admins of the plan at the vendor, P19, `QĐ-110k`, of `mf2-mf3`). */
export const NESTED_ARRAYS_XIT: readonly NestedArrayEntry[] = ['subscriptionGet', 'subscriptionList'].map(
  (operation): NestedArrayEntry => ({
    key: `${operation}#vendorAdmins`,
    classification: 'bounded',
    findings: [],
    owner: 'catalog-subscription-read-model',
    businessMaximum: { maxItems: 20, source },
    rationale:
      'Who administers the plan of the subscription at the vendor, from its workspace profile, each with whether they work now as an IT Admin.',
    removeWhen: 'Review when VENDOR_ADMINS_MAX changes.',
  }),
);
