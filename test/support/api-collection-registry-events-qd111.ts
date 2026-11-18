import type { RegistryEvent } from './api-collection-registry';

/**
 * QĐ-111g (Owner 12/11/2026): the Business Owner is gone, with the opinion on plan terms and the confirmation of a retirement. The two nested
 * arrays that carried them leave the live registry; the frozen one keeps them, so each leaves one `closed` event.
 */
export const QD111_REGISTRY_EVENTS: readonly RegistryEvent[] = [
  {
    registry: 'nested',
    key: 'planTermsGet#opinions',
    change: 'closed',
    from: 'unbounded',
    finding: 'LD-06',
    item: 'be-bugfix-2026-11-12',
    date: '2026-11-12',
    reason: 'The opinions of the Business Owner on plan terms were removed (QĐ-111g): the terms no longer embed them.',
  },
  {
    registry: 'nested',
    key: 'applicationRetirementGet#retirement.confirmations',
    change: 'closed',
    from: 'unbounded',
    finding: 'LD-06',
    item: 'be-bugfix-2026-11-12',
    date: '2026-11-12',
    reason:
      'The confirmation of a retirement by a Business Owner was removed (QĐ-111g): the retirement view carries none.',
  },
];
