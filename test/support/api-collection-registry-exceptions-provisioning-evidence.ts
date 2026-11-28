import type { CollectionException } from './api-collection-registry';
export const PROVISIONING_EVIDENCE_COLLECTIONS: readonly CollectionException[] = [
  {
    operationId: 'provisioningTaskEvidenceFileList',
    classification: 'bounded',
    findings: [],
    owner: 'api-list-detail-contract-remediation',
    businessMaximum: {
      maxItems: 6,
      source:
        'SPEC EV-13; evidenceFileSchema response items.max(6) and DocumentRepo.listReadyOfProvisioningTask take:6; two stages of at most three files.',
    },
    rationale: 'The immutable evidence of one completion and one access cut.',
    removeWhen: 'Review on any change of the two stages, attachment write limits, response maximum or repository take.',
    itemProperties: ['attachedAt', 'contentType', 'fileName', 'id', 'sizeBytes', 'stage'],
  },
];
