import type { RegistryEvent } from './api-collection-registry';
export const PROVISIONING_EVIDENCE_REGISTRY_EVENTS: readonly RegistryEvent[] = [
  {
    registry: 'exceptions',
    key: 'provisioningTaskEvidenceFileList#bounded',
    change: 'added',
    finding: 'LD-14',
    item: 'api-list-detail-contract-remediation',
    date: '2026-11-28',
    reason: 'SPEC EV-13 adds the evidence subresource of one task, projected and bounded to six files.',
    ownerDecision: 'SPEC EV-13 and Q-EV3: at most three files at completion and three at access cut, no pagination.',
  },
];
