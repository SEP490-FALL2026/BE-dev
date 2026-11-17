import type { NestedArrayEntry } from './api-collection-registry';

/** The nested arrays of the answers added by `MF3-B.5` (the transfer with its grace and old rights, P7, and the transfer of the person who asks, P8, `QĐ-110p`, of `mf2-mf3`). */
export const NESTED_ARRAYS_MF3B: readonly NestedArrayEntry[] = [
  {
    key: 'departmentTransferGet#oldRights',
    classification: 'bounded',
    findings: [],
    owner: 'g6-transfer-record',
    businessMaximum: {
      maxItems: 200,
      source:
        'OLD_RIGHTS_MAX in transfer-grace.dto.ts, the maxItems of the array: the personal rights of one person (the limit of the rights of one person, API-LIST-DETAIL.1)',
    },
    rationale:
      'The personal rights of the old department of the person who moved, each with whether it is still held and the task that takes it away.',
    removeWhen: 'Review when OLD_RIGHTS_MAX changes.',
  },
  {
    key: 'departmentTransferGet#commitmentsReleased',
    classification: 'bounded',
    findings: [],
    owner: 'g6-transfer-record',
    businessMaximum: {
      maxItems: 200,
      source:
        'OLD_RIGHTS_MAX in transfer-grace.dto.ts, the maxItems of the array: the personal rights of one person (the limit of the rights of one person, API-LIST-DETAIL.1)',
    },
    rationale:
      'What went back to the budget of the old department the day the transfer took effect, one entry for each currency, never more than the rights of the person.',
    removeWhen: 'Review when OLD_RIGHTS_MAX changes.',
  },
  {
    key: 'departmentTransferGet#snapshot.before.rights',
    classification: 'bounded',
    findings: [],
    owner: 'g6-transfer-record',
    businessMaximum: {
      maxItems: 200,
      source:
        'OLD_RIGHTS_MAX in transfer-grace.dto.ts, the maxItems of the array: the personal rights of one person (the limit of the rights of one person, API-LIST-DETAIL.1)',
    },
    rationale: 'The rights of the person the day the transfer took effect.',
    removeWhen: 'Review when OLD_RIGHTS_MAX changes.',
  },
  {
    key: 'departmentTransferGet#snapshot.after.rights',
    classification: 'bounded',
    findings: [],
    owner: 'g6-transfer-record',
    businessMaximum: {
      maxItems: 200,
      source:
        'OLD_RIGHTS_MAX in transfer-grace.dto.ts, the maxItems of the array: the personal rights of one person (the limit of the rights of one person, API-LIST-DETAIL.1)',
    },
    rationale: 'What became of each of those rights when the transfer closed.',
    removeWhen: 'Review when OLD_RIGHTS_MAX changes.',
  },
  {
    key: 'meDepartmentTransferGet#rights',
    classification: 'bounded',
    findings: [],
    owner: 'g6-transfer-record',
    businessMaximum: {
      maxItems: 200,
      source:
        'OLD_RIGHTS_MAX in transfer-grace.dto.ts, the maxItems of the array: the personal rights of one person (the limit of the rights of one person, API-LIST-DETAIL.1)',
    },
    rationale: 'The rights of the old department the person who asks still holds while the grace lasts.',
    removeWhen: 'Review when OLD_RIGHTS_MAX changes.',
  },
];
