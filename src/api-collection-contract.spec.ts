import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * API-LIST-DETAIL.1, LD-R2: inventory gate for every mounted collection (docs/rules/api-contract.md, section
 * "Collection và detail").
 *
 * Source: the committed openapi.json. It is generated from the mounted controllers, and the export test
 * (test/e2e/openapi-export.e2e-spec.ts) and the CI export step fail when it differs by one byte from what the code
 * exports (GATE-01). Reading it here checks the mounted routes without booting Nest in a unit test.
 *
 * A GET is a collection when `data` is an array or carries an `items` array, or when it is listed exactly in
 * NON_ENVELOPE_COLLECTIONS. Every other array below `data`, at any depth and in any GET — in a collection item, in the
 * rest of the collection's `data`, in a detail, inside an object, a union, a map or the items of another array — is
 * found by a recursive walk and must have exactly one entry in NESTED_ARRAYS (LD-R2-RV-02): a proved maximum, the
 * finding that tracks it as unbounded, or its LD-13 Owner decision. So a list cannot hide under another property and a
 * new nested array cannot pass unseen. A larger bound is caught when the schema declares `maxItems`; a code constant the
 * schema does not show is caught only by the review condition of its entry. That registry also only shrinks
 * (INITIAL_NESTED_ARRAYS pins each key with its classification).
 *
 * Every collection either meets the rule (`pageSize` with a `maximum`; an item shape that is not the shape of a detail
 * operation) or has an exact entry in COLLECTION_EXCEPTIONS. Entries use the exact operationId (no suffix, prefix or
 * glob), name the work item that removes or reviews them and pin the item's property names, so an entry whose
 * operation changed shape is stale and fails. Entries are only ever removed: the initial set is written out in
 * INITIAL_EXCEPTION_KEYS (Prompt 09, 22/10/2026) and adding one needs a new Owner decision. An entry that claims a bound
 * records `maxItems`, a positive integer, and its source; the gate reads the number and never guesses from prose, and a
 * count per parent, per year or per group is not a bound (LD-15).
 *
 * Not visible here: queries. N+1 reads, in-memory paging, a count outside the page's snapshot and a missing `select`
 * are `query` entries; the owning item proves the fix with test/support/query-count.ts and then removes the entry.
 */

type Classification =
  /** The item has exactly the shape of a detail operation's resource. Needs `maxItems` of one page. */
  | 'detail-reuse'
  /** The item carries fields only a detail needs (overfetch); `projectedFields` names them. */
  | 'detail-projection'
  /** Not paginated and no proven maximum of the whole response: a violation with an owner. */
  | 'unbounded'
  /** Not paginated, with a proven `maxItems` of the whole response: an accepted reference exception. */
  | 'bounded'
  /** The contract is fine but the repository is not (N+1, in-memory paging, count outside the snapshot, no select). */
  | 'query'
  /** The contract waits for an Owner decision (review LD-13); kept visible until it is decided and implemented. */
  | 'owner-decision';

interface BusinessMaximum {
  /**
   * The most items the bounded array can ever hold, as a positive integer: the whole response for `bounded`, one page for
   * `detail-reuse` (equal to the operation's `pageSize.maximum`), one occurrence of a nested array for a NESTED_ARRAYS
   * entry (equal to the schema's `maxItems` when it has one). A count per parent, per year or per group is not a maximum
   * unless the number of parents, years or groups is itself capped (docs/rules/api-contract.md).
   */
  maxItems: number;
  /** Where that number is enforced: the AC/FR, code constant, validation, schema maximum or database constraint. */
  source: string;
}

interface CollectionException {
  operationId: string;
  classification: Classification;
  findings: readonly string[];
  /** Folder under docs/workspace/items that removes or reviews this entry. */
  owner: string;
  rationale: string;
  removeWhen: string;
  /** The item's property names when the entry was recorded, sorted. Any other shape makes the entry stale. */
  itemProperties: readonly string[];
  businessMaximum?: BusinessMaximum;
  detailOperationId?: string;
  projectedFields?: readonly string[];
}

type NestedClassification =
  /** A proved `maxItems` for one occurrence of the array, with its exact source. */
  | 'bounded'
  /** No proved maximum: tracked by an exact review finding owned by a remediation package. */
  | 'unbounded'
  /** Whether the array stays, and how it is bounded, waits for an Owner decision (review LD-13). */
  | 'owner-decision';

interface NestedArrayEntry {
  /**
   * `operationId#path`. For a collection, the path is relative to one item, or `data.<path>` for the rest of its `data`;
   * for any other GET it is relative to `data`. Array items are walked through (`serviceLines.domains`), `[]` marks an
   * array directly inside an array and `{}` the value of a map. Exact: no glob, suffix or wildcard.
   */
  key: string;
  classification: NestedClassification;
  findings: readonly string[];
  /** Folder under docs/workspace/items that owns the source of the bound, or removes the finding. */
  owner: string;
  rationale: string;
  /** Bounded: the review condition, met by the first change of the source. Otherwise: the removal condition. */
  removeWhen: string;
  businessMaximum?: BusinessMaximum;
}

/** Collections whose items are not under `data.items`: operationId -> the array property of `data`. Exact. */
const NON_ENVELOPE_COLLECTIONS: Readonly<Record<string, string>> = {
  vendorSuggestionList: 'candidates',
};

const COLLECTION_EXCEPTIONS: readonly CollectionException[] = [
  {
    operationId: 'provisioningTaskList',
    classification: 'detail-reuse',
    findings: ['LD-08'],
    owner: 'licensing-provisioning-task-read-contracts',
    detailOperationId: 'provisioningTaskGet',
    businessMaximum: { maxItems: 100, source: 'pageSize maximum of the operation' },
    rationale:
      'The queue item is the full task of provisioningTaskGet: evidence, errors, steps and long reasons on every row.',
    removeWhen:
      'A task summary schema replaces the task schema in the list. Review maxItems when the pageSize maximum changes (the gate compares them).',
    itemProperties: [
      'accountIdentifier',
      'assignmentId',
      'attempts',
      'availableDecisions',
      'beneficiary',
      'channel',
      'claimedAt',
      'claimedBy',
      'closeReason',
      'closedAt',
      'closedBy',
      'completedAt',
      'completedBy',
      'createdAt',
      'defaultResponsibleEmployeeId',
      'doneWhen',
      'elapsedSeconds',
      'evidence',
      'failedAt',
      'failedBy',
      'failureKind',
      'failureReason',
      'handOffEvidence',
      'handedOffAt',
      'handedOffBy',
      'id',
      'inGeneralQueue',
      'kind',
      'lastError',
      'maxAttempts',
      'nextRetryAt',
      'plan',
      'requestId',
      'status',
      'steps',
      'subscriptionId',
    ],
  },
  {
    operationId: 'subscriptionList',
    classification: 'detail-reuse',
    findings: ['LD-01'],
    owner: 'catalog-subscription-read-model',
    detailOperationId: 'subscriptionGet',
    businessMaximum: { maxItems: 100, source: 'pageSize maximum of the operation' },
    rationale:
      'The list item is the subscription of subscriptionGet (chosen by spec g3-subscription-purchase); which fields stay is Owner decision 3 of LD-13.',
    removeWhen:
      'The Owner decides the list fields and a subscription summary schema ships. Review maxItems when the pageSize maximum changes (the gate compares them).',
    itemProperties: [
      'alerts',
      'allowsMidTermReduction',
      'applicationId',
      'applicationName',
      'autoRenew',
      'billingCycle',
      'createdAt',
      'endDate',
      'id',
      'kind',
      'missing',
      'missingFinancialData',
      'noticeDeadline',
      'noticePeriodDays',
      'planId',
      'planName',
      'priceSnapshot',
      'purchasedQuantity',
      'renewalDate',
      'startDate',
      'status',
      'taxEstimate',
      'taxProfile',
      'unitPrice',
      'updatedAt',
      'vendor',
      'warnings',
    ],
  },
  {
    operationId: 'standardToolsetList',
    classification: 'detail-reuse',
    findings: ['LD-07'],
    owner: 'catalog-standard-toolset-read-batching',
    detailOperationId: 'standardToolsetGet',
    businessMaximum: {
      maxItems: 100,
      source: 'pageSize maximum of the operation (the plans of each version: NESTED_ARRAYS standardToolsetList#plans)',
    },
    rationale: 'A list row is the current toolset version, the resource standardToolsetGet returns.',
    removeWhen:
      'A toolset summary schema ships, or the item records a decision that keeps this bounded reuse. Review maxItems when the pageSize maximum changes (the gate compares them).',
    itemProperties: ['changedAt', 'changedBy', 'departmentId', 'jobTitleId', 'plans', 'reason', 'version'],
  },
  {
    operationId: 'standardToolsetHistory',
    classification: 'detail-reuse',
    findings: ['LD-07'],
    owner: 'catalog-standard-toolset-read-batching',
    detailOperationId: 'standardToolsetGet',
    businessMaximum: {
      maxItems: 100,
      source:
        'pageSize maximum of the operation (the plans of each version: NESTED_ARRAYS standardToolsetHistory#plans)',
    },
    rationale: 'A history row is a full toolset version, the shape standardToolsetGet returns.',
    removeWhen:
      'A version summary schema ships, or the item records a decision that keeps this bounded reuse. Review maxItems when the pageSize maximum changes (the gate compares them).',
    itemProperties: ['changedAt', 'changedBy', 'departmentId', 'jobTitleId', 'plans', 'reason', 'version'],
  },
  {
    operationId: 'applicationList',
    classification: 'detail-projection',
    findings: ['LD-04'],
    owner: 'catalog-application-plan-read-contracts',
    projectedFields: ['communication', 'dictionaryServiceLineId', 'domains'],
    rationale:
      'The list item is the detail-lite application schema: domains (up to 20 x 1000 characters), the communication note and the dictionary link on every row.',
    removeWhen: 'An application summary schema without these fields ships with a direct select.',
    itemProperties: [
      'businessOwner',
      'businessOwnerReplacementRequired',
      'communication',
      'createdAt',
      'dataSensitivity',
      'dictionaryServiceLineId',
      'domains',
      'functionalGroup',
      'id',
      'kind',
      'name',
      'status',
      'updatedAt',
      'usageCollectionDefault',
      'vendor',
    ],
  },
  {
    operationId: 'planList',
    classification: 'detail-projection',
    findings: ['LD-05'],
    owner: 'catalog-application-plan-read-contracts',
    projectedFields: ['revocationNote'],
    rationale:
      'The list item is the plan schema with its revocation note (up to 2000 characters); the detail only adds the workspace profile.',
    removeWhen: 'A plan summary schema without the note ships.',
    itemProperties: [
      'applicationId',
      'applicationName',
      'controlLevel',
      'createdAt',
      'dataLossOnRemoval',
      'id',
      'name',
      'pricingModel',
      'provisioningType',
      'revocationNote',
      'seatTracking',
      'sharingPolicy',
      'updatedAt',
    ],
  },
  {
    operationId: 'projectList',
    classification: 'unbounded',
    findings: ['LD-12'],
    owner: 'organization-identity-read-contracts',
    rationale: 'Every project with its full description and departments; no paging and no business maximum.',
    removeWhen: 'The list is paginated with a pageSize maximum.',
    itemProperties: ['createdAt', 'departments', 'description', 'id', 'name', 'status', 'updatedAt'],
  },
  {
    operationId: 'applicationBusinessOwnerHistory',
    classification: 'unbounded',
    findings: ['LD-06'],
    owner: 'catalog-application-plan-read-contracts',
    rationale: 'Business Owner periods only grow; the history is returned whole.',
    removeWhen: 'The history is paginated or capped by a recorded business maximum.',
    itemProperties: ['assignedAt', 'assignedBy', 'employee', 'endedAt'],
  },
  {
    operationId: 'departmentWarningList',
    classification: 'unbounded',
    findings: ['LD-15'],
    owner: 'organization-identity-read-contracts',
    rationale:
      'No paging; at most two warning kinds (MISSING_HEAD, MISSING_IT_ADMIN) per active department, but the number of active departments has no hard maximum, so neither has the response.',
    removeWhen:
      'The list is paginated with a pageSize maximum, or an AC/FR, code constant or database constraint caps the complete response.',
    itemProperties: ['code', 'departmentId', 'name', 'warning'],
  },
  {
    operationId: 'nonWorkingDateList',
    classification: 'unbounded',
    findings: ['LD-15'],
    owner: 'g2-fiscal-year-operating-parameters',
    rationale:
      'No paging; the unique key allows one row per calendar date, but from and to are optional, so a call without them returns every recorded year and the response has no maximum.',
    removeWhen:
      'The list is paginated with a pageSize maximum, or the complete response gets a hard maximum (for example both from and to required with a proven maximum range).',
    itemProperties: ['date', 'reason'],
  },
  {
    operationId: 'currencyList',
    classification: 'bounded',
    findings: [],
    owner: 'g3-money-and-exchange-rates',
    businessMaximum: {
      maxItems: 11,
      source: 'seeded by migration 20261020100000; no write route, a new currency is a migration',
    },
    rationale: 'Reference data read whole by pickers.',
    removeWhen:
      'Review on any currency added or removed, a write route for currencies, or any change of the seeded dataset (migration 20261020100000).',
    itemProperties: ['code', 'minorUnit', 'name'],
  },
  {
    operationId: 'approvalRoleList',
    classification: 'bounded',
    findings: ['LD-14'],
    owner: 'g2-approval-roles',
    businessMaximum: {
      maxItems: 3,
      source:
        'APPROVAL_ROLES in approval-role.repo.ts (the history of each role: NESTED_ARRAYS approvalRoleList#history)',
    },
    rationale: 'The fixed set of configured approval roles.',
    removeWhen:
      'Review when APPROVAL_ROLES changes; the missing hasMore flag (LD-14) is fixed by organization-identity-read-contracts.',
    itemProperties: ['history', 'holder', 'role'],
  },
  {
    operationId: 'operatingParameterList',
    classification: 'bounded',
    findings: [],
    owner: 'g2-operating-parameters',
    businessMaximum: { maxItems: 15, source: 'definitions in parameter-definitions.ts' },
    rationale: 'The fixed set of parameter definitions with their current values.',
    removeWhen: 'Review on any definition added or removed, or any change of parameter-definitions.ts.',
    itemProperties: ['changedAt', 'constraints', 'default', 'description', 'isDefault', 'key', 'unit', 'value'],
  },
  {
    operationId: 'operatingParameterHistory',
    classification: 'bounded',
    findings: ['LD-14'],
    owner: 'g2-operating-parameters',
    businessMaximum: {
      maxItems: 20,
      source: 'HISTORY_LIMIT in operating-parameters.service.ts (spec g2-operating-parameters)',
    },
    rationale: 'The newest versions of one parameter.',
    removeWhen:
      'Review when HISTORY_LIMIT changes; the missing hasMore flag (LD-14) is fixed by organization-identity-read-contracts.',
    itemProperties: ['from', 'until', 'value'],
  },
  {
    operationId: 'accountCandidatesList',
    classification: 'bounded',
    findings: [],
    owner: 'us-01-account-invitation-activation',
    businessMaximum: { maxItems: 20, source: 'CANDIDATE_LIMIT in account-query.service.ts' },
    rationale: 'A picker that searches by name and returns the first matches.',
    removeWhen: 'Review when CANDIDATE_LIMIT changes or the picker needs paging.',
    itemProperties: ['department', 'employeeCode', 'fullName', 'id', 'workEmail'],
  },
  {
    operationId: 'subscriptionList',
    classification: 'query',
    findings: ['LD-01'],
    owner: 'catalog-subscription-read-model',
    rationale:
      'The tax profile is read row by row (about 300 statements for a page of 100); plan, application and vendor are included with every column.',
    removeWhen: 'A query-count test shows a constant number of statements and a direct select.',
    itemProperties: [
      'alerts',
      'allowsMidTermReduction',
      'applicationId',
      'applicationName',
      'autoRenew',
      'billingCycle',
      'createdAt',
      'endDate',
      'id',
      'kind',
      'missing',
      'missingFinancialData',
      'noticeDeadline',
      'noticePeriodDays',
      'planId',
      'planName',
      'priceSnapshot',
      'purchasedQuantity',
      'renewalDate',
      'startDate',
      'status',
      'taxEstimate',
      'taxProfile',
      'unitPrice',
      'updatedAt',
      'vendor',
      'warnings',
    ],
  },
  {
    operationId: 'planWarningList',
    classification: 'query',
    findings: ['LD-02'],
    owner: 'catalog-subscription-read-model',
    rationale: 'Every TERM subscription is read with its relations, then the page is cut with slice.',
    removeWhen: 'Paging moves into the query, proven by a query-count test.',
    itemProperties: [
      'applicationId',
      'applicationName',
      'baseDate',
      'code',
      'lastReviewedOn',
      'noticeDeadline',
      'planId',
      'planName',
      'reviewFrom',
      'subscriptionId',
    ],
  },
  {
    operationId: 'subscriptionCostAllocationHistory',
    classification: 'query',
    findings: ['LD-03'],
    owner: 'catalog-subscription-read-model',
    rationale: 'Cost Centers are read once per version.',
    removeWhen: 'One batched read per page, proven by a query-count test.',
    itemProperties: ['declaredAt', 'declaredBy', 'lines', 'totalPercent', 'version'],
  },
  {
    operationId: 'standardToolsetList',
    classification: 'query',
    findings: ['LD-07'],
    owner: 'catalog-standard-toolset-read-batching',
    rationale:
      'Versions and plans are read per head (up to about 400 statements per page) and rows are ordered by UUID.',
    removeWhen: 'Batched reads and a stable business order, proven by a query-count test.',
    itemProperties: ['changedAt', 'changedBy', 'departmentId', 'jobTitleId', 'plans', 'reason', 'version'],
  },
  {
    operationId: 'standardToolsetHistory',
    classification: 'query',
    findings: ['LD-07'],
    owner: 'catalog-standard-toolset-read-batching',
    rationale: 'Plans are read once per version.',
    removeWhen: 'One batched read per page, proven by a query-count test.',
    itemProperties: ['changedAt', 'changedBy', 'departmentId', 'jobTitleId', 'plans', 'reason', 'version'],
  },
  {
    operationId: 'provisioningTaskList',
    classification: 'query',
    findings: ['LD-08'],
    owner: 'licensing-provisioning-task-read-contracts',
    rationale: 'The plan is read once per task.',
    removeWhen: 'One batched read per page, proven by a query-count test.',
    itemProperties: [
      'accountIdentifier',
      'assignmentId',
      'attempts',
      'availableDecisions',
      'beneficiary',
      'channel',
      'claimedAt',
      'claimedBy',
      'closeReason',
      'closedAt',
      'closedBy',
      'completedAt',
      'completedBy',
      'createdAt',
      'defaultResponsibleEmployeeId',
      'doneWhen',
      'elapsedSeconds',
      'evidence',
      'failedAt',
      'failedBy',
      'failureKind',
      'failureReason',
      'handOffEvidence',
      'handedOffAt',
      'handedOffBy',
      'id',
      'inGeneralQueue',
      'kind',
      'lastError',
      'maxAttempts',
      'nextRetryAt',
      'plan',
      'requestId',
      'status',
      'steps',
      'subscriptionId',
    ],
  },
  {
    operationId: 'departmentToolsInUse',
    classification: 'query',
    findings: ['LD-09'],
    owner: 'licensing-assignment-read-contracts',
    rationale: 'Every assignment of every member is read, then the page is cut in memory.',
    removeWhen: 'Paging moves into the query, proven by a query-count test.',
    itemProperties: [
      'application',
      'assignmentId',
      'effectiveFrom',
      'effectiveFromLabel',
      'employeeCode',
      'fullName',
      'holderStatus',
      'kind',
      'plan',
      'source',
    ],
  },
  {
    operationId: 'licenseAssignmentList',
    classification: 'query',
    findings: ['LD-10'],
    owner: 'licensing-assignment-read-contracts',
    rationale:
      'The query has no select and the item carries only ids, so an IT Admin cannot show the person or Cost Center.',
    removeWhen: 'A direct select of the summary fields ships (fields per Owner decision 5 of LD-13).',
    itemProperties: [
      'accountIdentifier',
      'costCenterId',
      'createdAt',
      'effectiveFrom',
      'effectiveFromBasis',
      'effectiveFromLabel',
      'employeeId',
      'expectedEndDate',
      'failedAt',
      'grantedOn',
      'id',
      'kind',
      'planId',
      'predecessorId',
      'reason',
      'source',
      'subscriptionId',
      'validUntil',
    ],
  },
  {
    operationId: 'licenseKeyList',
    classification: 'query',
    findings: ['LD-11'],
    owner: 'licensing-assignment-read-contracts',
    rationale: 'The count and the page run in parallel outside one snapshot.',
    removeWhen: 'Count and page share one RepeatableRead transaction.',
    itemProperties: ['id', 'importedAt', 'masked', 'status', 'subscriptionId'],
  },
  {
    operationId: 'departmentMemberList',
    classification: 'query',
    findings: ['LD-11'],
    owner: 'organization-identity-read-contracts',
    rationale: 'The count and the page are two statements outside one snapshot.',
    removeWhen: 'Count and page share one RepeatableRead transaction.',
    itemProperties: ['employeeCode', 'fullName', 'hasWorkEmail', 'memberSince', 'status'],
  },
  {
    operationId: 'costCenterEmployeeList',
    classification: 'query',
    findings: ['LD-11'],
    owner: 'organization-identity-read-contracts',
    rationale: 'The count and the page are two statements outside one snapshot.',
    removeWhen: 'Count and page share one RepeatableRead transaction.',
    itemProperties: ['employeeCode', 'fullName', 'status'],
  },
  {
    operationId: 'vendorProposalList',
    classification: 'owner-decision',
    findings: ['LD-13'],
    owner: 'api-list-detail-contract-remediation',
    rationale: 'Decision 2: add proposedDomains and sourceApplicationId to the item, or add a proposal detail route.',
    removeWhen: 'The Owner decides and the chosen contract ships.',
    itemProperties: ['createdAt', 'id', 'name', 'resolvedAt', 'serviceLineId', 'status'],
  },
  {
    operationId: 'subscriptionList',
    classification: 'owner-decision',
    findings: ['LD-13'],
    owner: 'catalog-subscription-read-model',
    rationale: 'Decision 3: keep taxEstimate, priceSnapshot and alerts on every row, or move them to the detail.',
    removeWhen: 'The Owner decides and the chosen contract ships.',
    itemProperties: [
      'alerts',
      'allowsMidTermReduction',
      'applicationId',
      'applicationName',
      'autoRenew',
      'billingCycle',
      'createdAt',
      'endDate',
      'id',
      'kind',
      'missing',
      'missingFinancialData',
      'noticeDeadline',
      'noticePeriodDays',
      'planId',
      'planName',
      'priceSnapshot',
      'purchasedQuantity',
      'renewalDate',
      'startDate',
      'status',
      'taxEstimate',
      'taxProfile',
      'unitPrice',
      'updatedAt',
      'vendor',
      'warnings',
    ],
  },
  {
    operationId: 'auditEventList',
    classification: 'owner-decision',
    findings: ['LD-13'],
    owner: 'api-list-detail-contract-remediation',
    rationale:
      'Decision 4: keep full before/after payloads in the item (spec us-01-audit-trail-query), or a short item plus an event detail route; and a payload size cap.',
    removeWhen: 'The Owner decides and the chosen contract ships.',
    itemProperties: [
      'action',
      'actorAppUserId',
      'actorKind',
      'actorRoles',
      'after',
      'before',
      'correlationId',
      'id',
      'occurredAt',
      'operatorReference',
      'resourceId',
      'resourceType',
    ],
  },
  {
    operationId: 'provisioningTaskList',
    classification: 'owner-decision',
    findings: ['LD-13'],
    owner: 'licensing-provisioning-task-read-contracts',
    rationale: 'Decision 5: which identity fields of the beneficiary, default owner and claimant a task card shows.',
    removeWhen: 'The Owner decides and the chosen contract ships.',
    itemProperties: [
      'accountIdentifier',
      'assignmentId',
      'attempts',
      'availableDecisions',
      'beneficiary',
      'channel',
      'claimedAt',
      'claimedBy',
      'closeReason',
      'closedAt',
      'closedBy',
      'completedAt',
      'completedBy',
      'createdAt',
      'defaultResponsibleEmployeeId',
      'doneWhen',
      'elapsedSeconds',
      'evidence',
      'failedAt',
      'failedBy',
      'failureKind',
      'failureReason',
      'handOffEvidence',
      'handedOffAt',
      'handedOffBy',
      'id',
      'inGeneralQueue',
      'kind',
      'lastError',
      'maxAttempts',
      'nextRetryAt',
      'plan',
      'requestId',
      'status',
      'steps',
      'subscriptionId',
    ],
  },
  {
    operationId: 'licenseAssignmentList',
    classification: 'owner-decision',
    findings: ['LD-13'],
    owner: 'licensing-assignment-read-contracts',
    rationale: 'Decision 5: which identity fields of the holder an assignment row shows.',
    removeWhen: 'The Owner decides and the chosen contract ships.',
    itemProperties: [
      'accountIdentifier',
      'costCenterId',
      'createdAt',
      'effectiveFrom',
      'effectiveFromBasis',
      'effectiveFromLabel',
      'employeeId',
      'expectedEndDate',
      'failedAt',
      'grantedOn',
      'id',
      'kind',
      'planId',
      'predecessorId',
      'reason',
      'source',
      'subscriptionId',
      'validUntil',
    ],
  },
  {
    operationId: 'departmentList',
    classification: 'owner-decision',
    findings: ['LD-13'],
    owner: 'organization-identity-read-contracts',
    rationale:
      'Decision 6: keep the function text (up to 1000 characters) in the list as a field needed to choose a department, or return it only from departmentGet.',
    removeWhen: 'The Owner decides and the chosen contract ships.',
    itemProperties: [
      'code',
      'costCenter',
      'createdAt',
      'deactivatedAt',
      'function',
      'head',
      'id',
      'itAdmin',
      'memberCount',
      'name',
      'status',
      'updatedAt',
      'warnings',
    ],
  },
  {
    operationId: 'vendorGroupList',
    classification: 'owner-decision',
    findings: ['LD-13'],
    owner: 'api-list-detail-contract-remediation',
    rationale:
      'Decision 7: every service line of a group is embedded with no cap; the T-D2 maximum is an assumption, not a recorded business maximum.',
    removeWhen: 'The Owner confirms a maximum (then bounded) or the lines become a paginated subresource.',
    itemProperties: ['brandDomains', 'createdAt', 'id', 'name', 'serviceLines', 'updatedAt'],
  },
  {
    operationId: 'vendorSuggestionList',
    classification: 'unbounded',
    findings: ['LD-13'],
    owner: 'api-list-detail-contract-remediation',
    rationale:
      'Decision 7: no paging; the dictionary is read whole and every matching service line is returned. T-D2 is an assumption, not a recorded business maximum.',
    removeWhen: 'The Owner confirms the T-D2 maximum (then bounded) or the suggestions are capped.',
    itemProperties: ['groupId', 'groupName', 'serviceLineId', 'serviceLineName'],
  },
];

/**
 * Prompt 09 (22/10/2026). Keys may only be removed, here and from COLLECTION_EXCEPTIONS; adding one needs the Owner.
 * Prompt 09A (23/10/2026, Owner review LD-R2-RV-01): departmentWarningList and nonWorkingDateList corrected from
 * `bounded` to `unbounded` (LD-15) — the only change of a key, authorized by the Owner. Prompt 09B (23/10/2026,
 * LD-R2-RV-02): `vendorTaxProfileHistory#nested-bound` removed; its array is `vendorTaxProfileHistory#lines` in
 * NESTED_ARRAYS, which now holds every nested array.
 */
const INITIAL_EXCEPTION_KEYS: readonly string[] = [
  'provisioningTaskList#detail-reuse',
  'subscriptionList#detail-reuse',
  'standardToolsetList#detail-reuse',
  'standardToolsetHistory#detail-reuse',
  'applicationList#detail-projection',
  'planList#detail-projection',
  'projectList#unbounded',
  'applicationBusinessOwnerHistory#unbounded',
  'departmentWarningList#unbounded',
  'nonWorkingDateList#unbounded',
  'currencyList#bounded',
  'approvalRoleList#bounded',
  'operatingParameterList#bounded',
  'operatingParameterHistory#bounded',
  'accountCandidatesList#bounded',
  'subscriptionList#query',
  'planWarningList#query',
  'subscriptionCostAllocationHistory#query',
  'standardToolsetList#query',
  'standardToolsetHistory#query',
  'provisioningTaskList#query',
  'departmentToolsInUse#query',
  'licenseAssignmentList#query',
  'licenseKeyList#query',
  'departmentMemberList#query',
  'costCenterEmployeeList#query',
  'vendorProposalList#owner-decision',
  'subscriptionList#owner-decision',
  'auditEventList#owner-decision',
  'provisioningTaskList#owner-decision',
  'licenseAssignmentList#owner-decision',
  'departmentList#owner-decision',
  'vendorGroupList#owner-decision',
  'vendorSuggestionList#unbounded',
];

const ROLE_GRANTS =
  'AppRole has 4 values and the unique index role_grants_one_effective_per_role allows one effective grant per role';

/**
 * Every array below `data` other than a collection's own array (Prompt 09B, LD-R2-RV-02), in the order of the recursive
 * inventory. A bounded entry names the exact source that enforces its number; its review condition is met by the first
 * change of that source.
 */
const NESTED_ARRAYS: readonly NestedArrayEntry[] = [
  {
    key: 'healthGetReadiness#checks',
    classification: 'bounded',
    findings: [],
    owner: 'us-01-bootstrap-login-session',
    businessMaximum: { maxItems: 1, source: 'getReadiness in health.controller.ts passes one check (database)' },
    rationale: 'The dependency checks of readiness.',
    removeWhen: 'Review when getReadiness passes another check.',
  },
  {
    key: 'auditEventList#actorRoles',
    classification: 'bounded',
    findings: [],
    owner: 'us-01-audit-trail-query',
    businessMaximum: {
      maxItems: 6,
      source: `resolveEffectiveRoles in effective-roles.policy.ts: a set of the direct roles (${ROLE_GRANTS}) and MANAGER, SPENDING_APPROVER; AuditRepo.insert is the only writer and every caller passes actor.roles or none`,
    },
    rationale: 'The roles the actor held when the event was written.',
    removeWhen: 'Review when AppRole, the derived roles of resolveEffectiveRoles or an audit writer changes.',
  },
  {
    key: 'departmentList#warnings',
    classification: 'bounded',
    findings: [],
    owner: 'g2-department-profile',
    businessMaximum: {
      maxItems: 2,
      source:
        'department-query.service.ts builds MISSING_HEAD and MISSING_IT_ADMIN, each at most once (DepartmentWarning)',
    },
    rationale: 'The warnings of one department.',
    removeWhen: 'Review when DepartmentWarning gains a kind or the warnings are built another way.',
  },
  {
    key: 'departmentGet#warnings',
    classification: 'bounded',
    findings: [],
    owner: 'g2-department-profile',
    businessMaximum: {
      maxItems: 2,
      source:
        'department-query.service.ts builds MISSING_HEAD and MISSING_IT_ADMIN, each at most once (DepartmentWarning)',
    },
    rationale: 'The warnings of the department.',
    removeWhen: 'Review when DepartmentWarning gains a kind or the warnings are built another way.',
  },
  {
    key: 'departmentGet#headHistory',
    classification: 'bounded',
    findings: ['LD-14'],
    owner: 'g2-department-profile',
    businessMaximum: {
      maxItems: 50,
      source: 'DEPARTMENT_HEAD_HISTORY_LIMIT in department.types.ts (LIMIT of headPeriods in department-head.repo.ts)',
    },
    rationale: 'The newest head periods; the cut has no hasMore flag (LD-14).',
    removeWhen:
      'Review when DEPARTMENT_HEAD_HISTORY_LIMIT changes; the hasMore flag (LD-14) is organization-identity-read-contracts.',
  },
  {
    key: 'departmentGet#projects',
    classification: 'unbounded',
    findings: ['LD-12'],
    owner: 'organization-identity-read-contracts',
    rationale: 'Every project the department takes part in is embedded, with no limit.',
    removeWhen:
      'The profile embeds a proved number of projects, or the projects become a paginated subresource (LD-12).',
  },
  {
    key: 'departmentGet#projects.departments',
    classification: 'bounded',
    findings: [],
    owner: 'g2-department-profile',
    businessMaximum: {
      maxItems: 100,
      source: 'departmentIds .max(100) in project.dto.ts on create and update; ProjectRepo replaces the set',
    },
    rationale: 'The departments one project names.',
    removeWhen: 'Review when the departmentIds limit or the project write path changes.',
  },
  {
    key: 'projectList#departments',
    classification: 'bounded',
    findings: [],
    owner: 'g2-department-profile',
    businessMaximum: {
      maxItems: 100,
      source: 'departmentIds .max(100) in project.dto.ts on create and update; ProjectRepo replaces the set',
    },
    rationale: 'The departments one project names.',
    removeWhen: 'Review when the departmentIds limit or the project write path changes.',
  },
  {
    key: 'operatingParameterList#value',
    classification: 'bounded',
    findings: [],
    owner: 'g2-operating-parameters',
    businessMaximum: {
      maxItems: 5,
      source:
        'the longest int-list in parameter-definitions.ts (RENEWAL_ALERT_DAYS_BEFORE_DEADLINE, length 1–5), enforced by validateParameterValue',
    },
    rationale: 'A value is a list only for an int-list definition.',
    removeWhen: 'Review when an int-list definition, its length or the value validation changes.',
  },
  {
    key: 'operatingParameterList#default',
    classification: 'bounded',
    findings: [],
    owner: 'g2-operating-parameters',
    businessMaximum: {
      maxItems: 5,
      source: 'the int-list defaults in parameter-definitions.ts (3 and 2 values, within the same length limits)',
    },
    rationale: 'A default is a list only for an int-list definition.',
    removeWhen: 'Review when an int-list definition or its default changes.',
  },
  {
    key: 'operatingParameterHistory#value',
    classification: 'bounded',
    findings: [],
    owner: 'g2-operating-parameters',
    businessMaximum: {
      maxItems: 5,
      source:
        'the longest int-list in parameter-definitions.ts (RENEWAL_ALERT_DAYS_BEFORE_DEADLINE, length 1–5), enforced by validateParameterValue',
    },
    rationale: 'A past value is a list only for an int-list definition.',
    removeWhen: 'Review when an int-list definition, its length or the value validation changes.',
  },
  {
    key: 'employeeImportGet#ignoredColumns',
    classification: 'bounded',
    findings: [],
    owner: 'g2-employee-import-preview-confirm',
    businessMaximum: {
      maxItems: 40,
      source:
        'maxColumns 40 of DEFAULT_LIMITS in core/csv.ts (parseCsvRows, TOO_MANY_COLUMNS), kept by employee-import-file.ts',
    },
    rationale: 'The headers of the file no column uses.',
    removeWhen: 'Review when the CSV column limit or the employee file reading changes.',
  },
  {
    key: 'employeeImportGet#summary.newPeopleByDepartment',
    classification: 'bounded',
    findings: [],
    owner: 'g2-employee-import-preview-confirm',
    businessMaximum: {
      maxItems: 1000,
      source: 'MAX_DATA_ROWS in employee-import-file.ts: one group per department code of at most 1000 rows',
    },
    rationale: 'The new people of the file, by department.',
    removeWhen: 'Review when MAX_DATA_ROWS or the grouping changes.',
  },
  {
    key: 'employeeImportGet#summary.departmentsWithoutHead',
    classification: 'bounded',
    findings: [],
    owner: 'g2-employee-import-preview-confirm',
    businessMaximum: {
      maxItems: 1000,
      source: 'MAX_DATA_ROWS in employee-import-file.ts: departments named by at most 1000 rows',
    },
    rationale: 'The departments of the file that have no head.',
    removeWhen: 'Review when MAX_DATA_ROWS or the summary changes.',
  },
  {
    key: 'employeeImportGet#summary.reviewQueue.items',
    classification: 'bounded',
    findings: [],
    owner: 'g2-employee-import-preview-confirm',
    businessMaximum: {
      maxItems: 200,
      source: 'reviewQueue in employee-import.service.ts keeps queue.slice(0, 200) with the total (US-02-02 AC-4)',
    },
    rationale: 'Seat holders missing from the file, first 200 by code; the total is returned beside them.',
    removeWhen: 'Review when the slice or the review queue changes.',
  },
  {
    key: 'employeeImportGet#result.createdByDepartment',
    classification: 'bounded',
    findings: [],
    owner: 'g2-employee-import-preview-confirm',
    businessMaximum: {
      maxItems: 1000,
      source: 'MAX_DATA_ROWS in employee-import-file.ts: one group per department code of at most 1000 rows',
    },
    rationale: 'The people created by department.',
    removeWhen: 'Review when MAX_DATA_ROWS or the grouping changes.',
  },
  {
    key: 'employeeImportGet#result.departmentsWithoutHead',
    classification: 'bounded',
    findings: [],
    owner: 'g2-employee-import-preview-confirm',
    businessMaximum: {
      maxItems: 1000,
      source: 'MAX_DATA_ROWS in employee-import-file.ts: departments named by at most 1000 rows',
    },
    rationale: 'The departments of the created people that have no head.',
    removeWhen: 'Review when MAX_DATA_ROWS or the result changes.',
  },
  {
    key: 'employeeImportRowList#errors',
    classification: 'bounded',
    findings: [],
    owner: 'g2-employee-import-preview-confirm',
    businessMaximum: {
      maxItems: 7,
      source:
        'classify in employee-import-rows.ts and placementReasons in employee-placement.policy.ts: at most one error per column of EMPLOYEE_COLUMNS (7)',
    },
    rationale: 'The errors of one row.',
    removeWhen: 'Review when EMPLOYEE_COLUMNS or a row check changes.',
  },
  {
    key: 'employeeImportRowList#differences',
    classification: 'bounded',
    findings: [],
    owner: 'g2-employee-import-preview-confirm',
    businessMaximum: { maxItems: 6, source: 'compare in employee-import-rows.ts: the six non-key columns, each once' },
    rationale: 'How an existing person differs from the row.',
    removeWhen: 'Review when EMPLOYEE_COLUMNS or compare changes.',
  },
  {
    key: 'seatBaselineImportGet#ignoredColumns',
    classification: 'bounded',
    findings: [],
    owner: 'g4-seat-baseline-import',
    businessMaximum: {
      maxItems: 40,
      source:
        'maxColumns 40 of DEFAULT_LIMITS in core/csv.ts (parseCsvRows, TOO_MANY_COLUMNS), kept by seat-baseline-file.ts',
    },
    rationale: 'The headers of the file no column uses.',
    removeWhen: 'Review when the CSV column limit or the seat file reading changes.',
  },
  {
    key: 'seatBaselineImportRows#errors',
    classification: 'bounded',
    findings: [],
    owner: 'g4-seat-baseline-import',
    businessMaximum: {
      maxItems: 22,
      source:
        'SeatRowErrorCode (22 codes) in seat-baseline-import.types.ts; judgeAlone and the row checks in seat-baseline-rows.ts push each code at most once',
    },
    rationale: 'The errors of one row.',
    removeWhen: 'Review when SeatRowErrorCode or a row check changes.',
  },
  {
    key: 'provisioningTaskList#steps',
    classification: 'bounded',
    findings: [],
    owner: 'g4-provisioning-queue-manual',
    businessMaximum: { maxItems: 3, source: 'stepsFor in provisioning.policy.ts (K4 has the most: 3)' },
    rationale: 'The steps of one task card.',
    removeWhen: 'Review when stepsFor changes.',
  },
  {
    key: 'provisioningTaskList#availableDecisions',
    classification: 'bounded',
    findings: [],
    owner: 'g4-provisioning-failure-handling',
    businessMaximum: { maxItems: 3, source: 'availableDecisions in failure.policy.ts (RETRY, HAND_OFF, CLOSE_FAILED)' },
    rationale: 'What an IT Admin may decide on a failed task.',
    removeWhen: 'Review when availableDecisions or ProvisioningDecision changes.',
  },
  {
    key: 'provisioningTaskGet#task.steps',
    classification: 'bounded',
    findings: [],
    owner: 'g4-provisioning-queue-manual',
    businessMaximum: { maxItems: 3, source: 'stepsFor in provisioning.policy.ts (K4 has the most: 3)' },
    rationale: 'The steps of the task card.',
    removeWhen: 'Review when stepsFor changes.',
  },
  {
    key: 'provisioningTaskGet#task.availableDecisions',
    classification: 'bounded',
    findings: [],
    owner: 'g4-provisioning-failure-handling',
    businessMaximum: { maxItems: 3, source: 'availableDecisions in failure.policy.ts (RETRY, HAND_OFF, CLOSE_FAILED)' },
    rationale: 'What an IT Admin may decide on the failed task.',
    removeWhen: 'Review when availableDecisions or ProvisioningDecision changes.',
  },
  {
    key: 'vendorGroupList#brandDomains',
    classification: 'bounded',
    findings: [],
    owner: 'g3-vendor-dictionary',
    businessMaximum: {
      maxItems: 20,
      source: 'MAX_VALUES in vendor-dictionary.validation.ts (cleanDomains on every group write)',
    },
    rationale: 'The brand domains of one vendor group.',
    removeWhen: 'Review when MAX_VALUES or a dictionary write path changes.',
  },
  {
    key: 'vendorGroupList#serviceLines',
    classification: 'owner-decision',
    findings: ['LD-13'],
    owner: 'api-list-detail-contract-remediation',
    rationale:
      'Decision 7: every service line of the group is embedded with no cap; the T-D2 maximum is an assumption, not a recorded business maximum.',
    removeWhen: 'The Owner confirms a maximum (then bounded) or the lines become a paginated subresource.',
  },
  {
    key: 'vendorGroupList#serviceLines.domains',
    classification: 'bounded',
    findings: [],
    owner: 'g3-vendor-dictionary',
    businessMaximum: {
      maxItems: 20,
      source: 'MAX_VALUES in vendor-dictionary.validation.ts (cleanDomains on every service-line write)',
    },
    rationale: 'The domains of one service line.',
    removeWhen: 'Review when MAX_VALUES or a dictionary write path changes.',
  },
  {
    key: 'vendorGroupList#serviceLines.patterns',
    classification: 'bounded',
    findings: [],
    owner: 'g3-vendor-dictionary',
    businessMaximum: {
      maxItems: 20,
      source: 'MAX_VALUES in vendor-dictionary.validation.ts (cleanPatterns on every service-line write)',
    },
    rationale: 'The patterns of one service line.',
    removeWhen: 'Review when MAX_VALUES or a dictionary write path changes.',
  },
  {
    key: 'applicationList#domains',
    classification: 'bounded',
    findings: [],
    owner: 'g3-catalog-entry',
    businessMaximum: {
      maxItems: 20,
      source: 'MAX_DOMAINS in application.policy.ts (cleanApplicationDomains on create and update)',
    },
    rationale:
      'The domains of one application; that they are on the list at all is LD-04 (applicationList#detail-projection).',
    removeWhen: 'Review when MAX_DOMAINS or an application write path changes.',
  },
  {
    key: 'applicationGet#domains',
    classification: 'bounded',
    findings: [],
    owner: 'g3-catalog-entry',
    businessMaximum: {
      maxItems: 20,
      source: 'MAX_DOMAINS in application.policy.ts (cleanApplicationDomains on create and update)',
    },
    rationale: 'The domains of the application.',
    removeWhen: 'Review when MAX_DOMAINS or an application write path changes.',
  },
  {
    key: 'applicationGet#similarApplications',
    classification: 'unbounded',
    findings: ['LD-06'],
    owner: 'catalog-application-plan-read-contracts',
    rationale: 'Every other approved application of the functional group, read without take.',
    removeWhen: 'The list has a proved maximum or becomes a paginated subresource (LD-06).',
  },
  {
    key: 'applicationGet#recommendations',
    classification: 'bounded',
    findings: [],
    owner: 'g3-catalog-entry',
    businessMaximum: {
      maxItems: 1,
      source: 'recommendationsOf in application.service.ts returns none or one K2 recommendation',
    },
    rationale: 'Whether a K2 plan is worth considering.',
    removeWhen: 'Review when recommendationsOf changes.',
  },
  {
    key: 'planGet#workspaceProfile.members',
    classification: 'bounded',
    findings: [],
    owner: 'g3-plan-declaration',
    businessMaximum: {
      maxItems: 100,
      source: 'members .min(1).max(100) of workspaceProfileBodySchema in plan.dto.ts; the profile is saved whole',
    },
    rationale: 'The declared members of the workspace.',
    removeWhen: 'Review when the members limit or the workspace profile write changes.',
  },
  {
    key: 'vendorTaxProfileGet#profile.lines',
    classification: 'bounded',
    findings: [],
    owner: 'g3-vendor-tax-profile',
    businessMaximum: {
      maxItems: 20,
      source: 'MAX_LINES in tax-profile.policy.ts (cleanTaxLines on every declaration)',
    },
    rationale: 'The tax lines of the current profile.',
    removeWhen: 'Review when MAX_LINES or the declaration path changes.',
  },
  {
    key: 'vendorTaxProfileGet#defaultProfile.lines',
    classification: 'bounded',
    findings: [],
    owner: 'g3-vendor-tax-profile',
    businessMaximum: { maxItems: 2, source: 'DEFAULT_TAX_PROFILE in tax-profile.policy.ts has 2 lines' },
    rationale: 'The tax lines of the default profile.',
    removeWhen: 'Review when DEFAULT_TAX_PROFILE changes.',
  },
  {
    key: 'vendorTaxProfileHistory#lines',
    classification: 'bounded',
    findings: [],
    owner: 'g3-vendor-tax-profile',
    businessMaximum: {
      maxItems: 20,
      source: 'MAX_LINES in tax-profile.policy.ts (cleanTaxLines on every declaration)',
    },
    rationale: 'Each history row is a full profile version with its lines (was COLLECTION_EXCEPTIONS nested-bound).',
    removeWhen: 'Review when MAX_LINES or the declaration path changes.',
  },
  {
    key: 'vendorTaxEstimate#lines',
    classification: 'bounded',
    findings: [],
    owner: 'g3-vendor-tax-profile',
    businessMaximum: {
      maxItems: 20,
      source: 'estimateTax maps the vendor profile lines (MAX_LINES) or the 2 default lines one to one',
    },
    rationale: 'One estimated amount per tax line.',
    removeWhen: 'Review when MAX_LINES, DEFAULT_TAX_PROFILE or estimateTax changes.',
  },
  {
    key: 'subscriptionList#missing',
    classification: 'bounded',
    findings: [],
    owner: 'g3-subscription-purchase',
    businessMaximum: {
      maxItems: 4,
      source:
        'missingData in subscription.policy.ts: QUANTITY, START_DATE, BILLING_CYCLE and one of UNIT_PRICE or EXCHANGE_RATE',
    },
    rationale: 'The data a subscription still lacks.',
    removeWhen: 'Review when missingData or MissingItem changes.',
  },
  {
    key: 'subscriptionList#alerts.dates',
    classification: 'bounded',
    findings: [],
    owner: 'g3-subscription-purchase',
    businessMaximum: {
      maxItems: 5,
      source:
        'alertDates over RENEWAL_ALERT_DAYS_BEFORE_DEADLINE, an int-list of length 1–5 in parameter-definitions.ts',
    },
    rationale:
      'One date per configured alert offset; whether alerts stay on list rows is LD-13 decision 3 (subscriptionList#owner-decision).',
    removeWhen: 'Review when the parameter length limit or alertDates changes.',
  },
  {
    key: 'subscriptionList#warnings',
    classification: 'bounded',
    findings: [],
    owner: 'g3-subscription-purchase',
    businessMaximum: {
      maxItems: 1,
      source: 'noticeWarnings in subscription.policy.ts returns NO_ALERT_ANCHOR or nothing',
    },
    rationale: 'The data-quality warning of a subscription.',
    removeWhen: 'Review when noticeWarnings or SubscriptionWarning changes.',
  },
  {
    key: 'subscriptionGet#missing',
    classification: 'bounded',
    findings: [],
    owner: 'g3-subscription-purchase',
    businessMaximum: {
      maxItems: 4,
      source:
        'missingData in subscription.policy.ts: QUANTITY, START_DATE, BILLING_CYCLE and one of UNIT_PRICE or EXCHANGE_RATE',
    },
    rationale: 'The data the subscription still lacks.',
    removeWhen: 'Review when missingData or MissingItem changes.',
  },
  {
    key: 'subscriptionGet#alerts.dates',
    classification: 'bounded',
    findings: [],
    owner: 'g3-subscription-purchase',
    businessMaximum: {
      maxItems: 5,
      source:
        'alertDates over RENEWAL_ALERT_DAYS_BEFORE_DEADLINE, an int-list of length 1–5 in parameter-definitions.ts',
    },
    rationale: 'One date per configured alert offset.',
    removeWhen: 'Review when the parameter length limit or alertDates changes.',
  },
  {
    key: 'subscriptionGet#warnings',
    classification: 'bounded',
    findings: [],
    owner: 'g3-subscription-purchase',
    businessMaximum: {
      maxItems: 1,
      source: 'noticeWarnings in subscription.policy.ts returns NO_ALERT_ANCHOR or nothing',
    },
    rationale: 'The data-quality warning of the subscription.',
    removeWhen: 'Review when noticeWarnings or SubscriptionWarning changes.',
  },
  {
    key: 'subscriptionCostAllocationGet#allocation.lines',
    classification: 'bounded',
    findings: [],
    owner: 'g3-shared-cost-allocation',
    businessMaximum: {
      maxItems: 20,
      source: 'MAX_ALLOCATION_LINES in cost-allocation.policy.ts (cleanAllocationLines on every declaration)',
    },
    rationale: 'The lines of the current allocation.',
    removeWhen: 'Review when MAX_ALLOCATION_LINES or the declaration path changes.',
  },
  {
    key: 'subscriptionCostAllocationHistory#lines',
    classification: 'bounded',
    findings: [],
    owner: 'g3-shared-cost-allocation',
    businessMaximum: {
      maxItems: 20,
      source: 'MAX_ALLOCATION_LINES in cost-allocation.policy.ts (cleanAllocationLines on every declaration)',
    },
    rationale: 'The lines of one allocation version.',
    removeWhen: 'Review when MAX_ALLOCATION_LINES or the declaration path changes.',
  },
  {
    key: 'planTermsGet#opinions',
    classification: 'unbounded',
    findings: ['LD-06'],
    owner: 'catalog-application-plan-read-contracts',
    rationale: 'Every opinion on the plan terms, newest first, with no limit (listOpinions).',
    removeWhen: 'The opinions have a proved maximum or become a paginated subresource (LD-06).',
  },
  {
    key: 'planTermsGet#warnings',
    classification: 'unbounded',
    findings: ['LD-16'],
    owner: 'catalog-subscription-read-model',
    rationale:
      'One TERMS_REVIEW_DUE warning per active subscription of the plan (warningsFor in plan-terms.service.ts); the subscriptions of a plan have no cap.',
    removeWhen:
      'The warnings of one plan get a proved maximum or a paginated form; the contract is not chosen here (LD-16).',
  },
  {
    key: 'applicationRetirementGet#retirement.confirmations',
    classification: 'unbounded',
    findings: ['LD-06'],
    owner: 'catalog-application-plan-read-contracts',
    rationale: 'Every Business Owner confirmation of the retirement, with no limit.',
    removeWhen: 'The confirmations have a proved maximum or become a paginated subresource (LD-06).',
  },
  {
    key: 'applicationRetirementGet#retirement.blockers.assignments',
    classification: 'unbounded',
    findings: ['LD-06'],
    owner: 'catalog-application-plan-read-contracts',
    rationale: 'Every open seat of every plan of the application (blockersOf in application-retirement.service.ts).',
    removeWhen: 'The blockers return a proved maximum with a total, or a paginated subresource (LD-06).',
  },
  {
    key: 'applicationRetirementGet#retirement.blockers.subscriptions',
    classification: 'unbounded',
    findings: ['LD-06'],
    owner: 'catalog-application-plan-read-contracts',
    rationale: 'Every running subscription of every plan of the application (blockersOf).',
    removeWhen: 'The blockers return a proved maximum with a total, or a paginated subresource (LD-06).',
  },
  {
    key: 'standardToolsetList#plans',
    classification: 'bounded',
    findings: [],
    owner: 'g3-standard-toolset',
    businessMaximum: { maxItems: 50, source: 'MAX_TOOLSET_PLANS in standard-toolset.policy.ts (cleanToolsetInput)' },
    rationale: 'The plans of one toolset version.',
    removeWhen: 'Review when MAX_TOOLSET_PLANS or the toolset write path changes.',
  },
  {
    key: 'standardToolsetMine#toolset.plans',
    classification: 'bounded',
    findings: [],
    owner: 'g3-standard-toolset',
    businessMaximum: { maxItems: 50, source: 'MAX_TOOLSET_PLANS in standard-toolset.policy.ts (cleanToolsetInput)' },
    rationale: 'The plans of the toolset of the caller.',
    removeWhen: 'Review when MAX_TOOLSET_PLANS or the toolset write path changes.',
  },
  {
    key: 'standardToolsetGet#toolset.plans',
    classification: 'bounded',
    findings: [],
    owner: 'g3-standard-toolset',
    businessMaximum: { maxItems: 50, source: 'MAX_TOOLSET_PLANS in standard-toolset.policy.ts (cleanToolsetInput)' },
    rationale: 'The plans of the toolset.',
    removeWhen: 'Review when MAX_TOOLSET_PLANS or the toolset write path changes.',
  },
  {
    key: 'standardToolsetHistory#plans',
    classification: 'bounded',
    findings: [],
    owner: 'g3-standard-toolset',
    businessMaximum: { maxItems: 50, source: 'MAX_TOOLSET_PLANS in standard-toolset.policy.ts (cleanToolsetInput)' },
    rationale: 'The plans of one toolset version.',
    removeWhen: 'Review when MAX_TOOLSET_PLANS or the toolset write path changes.',
  },
  {
    key: 'onboardingChecklistGet#steps',
    classification: 'bounded',
    findings: [],
    owner: 'g2-onboarding-checklist',
    businessMaximum: { maxItems: 5, source: 'the five-step tuple of the checklist in onboarding.service.ts (FR-9.1)' },
    rationale: 'The steps of the onboarding checklist.',
    removeWhen: 'Review when the checklist steps change.',
  },
  {
    key: 'onboardingChecklistGet#steps.reasons',
    classification: 'bounded',
    findings: [],
    owner: 'g2-onboarding-checklist',
    businessMaximum: {
      maxItems: 3,
      source:
        'onboarding.service.ts: step 1 has at most NO_DEPARTMENT, NO_EMPLOYEE, IMPORT_HAS_ERRORS; the other steps at most 2',
    },
    rationale: 'Why a step is not done.',
    removeWhen: 'Review when a step reason is added or the steps are built another way.',
  },
  {
    key: 'onboardingChecklistGet#steps.warnings',
    classification: 'unbounded',
    findings: ['LD-16'],
    owner: 'api-list-detail-contract-remediation',
    rationale:
      'Step 1 lists MISSING_HEAD and MISSING_IT_ADMIN per active department, and the number of departments has no cap (the same bound as departmentWarningList, LD-15).',
    removeWhen:
      'The warnings of the step get a proved maximum or a paginated form; the contract and the future package are not chosen here (LD-16).',
  },
  {
    key: 'onboardingChecklistGet#suggestions',
    classification: 'bounded',
    findings: [],
    owner: 'g2-onboarding-checklist',
    businessMaximum: { maxItems: 1, source: 'the one-suggestion tuple of the checklist in onboarding.service.ts' },
    rationale: 'The suggestions of the checklist.',
    removeWhen: 'Review when a suggestion is added.',
  },
  {
    key: 'meGet#roles.direct',
    classification: 'bounded',
    findings: [],
    owner: 'us-01-bootstrap-login-session',
    businessMaximum: { maxItems: 4, source: ROLE_GRANTS },
    rationale: 'The roles granted to the caller and still in force.',
    removeWhen: 'Review when AppRole or the unique index changes.',
  },
  {
    key: 'meGet#roles.derived',
    classification: 'bounded',
    findings: [],
    owner: 'us-01-bootstrap-login-session',
    businessMaximum: {
      maxItems: 2,
      source:
        'resolveEffectiveRoles in effective-roles.policy.ts derives MANAGER and SPENDING_APPROVER, each at most once',
    },
    rationale: 'The roles the caller holds from data.',
    removeWhen: 'Review when resolveEffectiveRoles derives another role.',
  },
  {
    key: 'meGet#roles.effective',
    classification: 'bounded',
    findings: [],
    owner: 'us-01-bootstrap-login-session',
    businessMaximum: {
      maxItems: 6,
      source: `resolveEffectiveRoles in effective-roles.policy.ts: a set of the direct roles (${ROLE_GRANTS}) and the 2 derived roles`,
    },
    rationale: 'Direct plus derived roles: what authorization checks.',
    removeWhen: 'Review when AppRole, the unique index or resolveEffectiveRoles changes.',
  },
  {
    key: 'appUserList#roles',
    classification: 'bounded',
    findings: [],
    owner: 'us-01-account-invitation-activation',
    businessMaximum: { maxItems: 4, source: `${ROLE_GRANTS}; effectiveRolesFor reads the effective grants` },
    rationale: 'The roles granted to one account.',
    removeWhen: 'Review when AppRole or the unique index changes.',
  },
  {
    key: 'appUserGet#roles',
    classification: 'bounded',
    findings: [],
    owner: 'us-01-account-invitation-activation',
    businessMaximum: { maxItems: 4, source: `${ROLE_GRANTS}; effectiveRolesFor reads the effective grants` },
    rationale: 'The roles granted to the account.',
    removeWhen: 'Review when AppRole or the unique index changes.',
  },
  {
    key: 'appUserGet#roleHistory',
    classification: 'unbounded',
    findings: ['LD-14'],
    owner: 'organization-identity-read-contracts',
    rationale: 'Every grant of the account ever made (grantHistory reads without take).',
    removeWhen: 'The history has a proved maximum with hasMore, or becomes a paginated subresource (LD-14).',
  },
  {
    key: 'approvalRoleList#history',
    classification: 'bounded',
    findings: ['LD-14'],
    owner: 'g2-approval-roles',
    businessMaximum: {
      maxItems: 20,
      source: 'HISTORY_LIMIT in approval-role.service.ts (take of ApprovalRoleRepo.history)',
    },
    rationale: 'The newest holders of one approval role; the cut has no hasMore flag (LD-14).',
    removeWhen: 'Review when HISTORY_LIMIT changes; the hasMore flag (LD-14) is organization-identity-read-contracts.',
  },
  {
    key: 'departmentToolsInUse#data.summary',
    classification: 'unbounded',
    findings: ['LD-09'],
    owner: 'licensing-assignment-read-contracts',
    rationale:
      'One line per plan over every seat the department holds, computed from all its assignments before the page is cut.',
    removeWhen: 'The summary is read in SQL with a proved maximum or paginated (LD-09).',
  },
];

/**
 * Prompt 09B (23/10/2026, LD-R2-RV-02): every nested array of the mounted contract with its classification. Entries may
 * only be removed, here and from NESTED_ARRAYS; a new key or a changed classification needs a new Owner decision.
 */
const INITIAL_NESTED_ARRAYS: Readonly<Record<string, NestedClassification>> = {
  'healthGetReadiness#checks': 'bounded',
  'auditEventList#actorRoles': 'bounded',
  'departmentList#warnings': 'bounded',
  'departmentGet#warnings': 'bounded',
  'departmentGet#headHistory': 'bounded',
  'departmentGet#projects': 'unbounded',
  'departmentGet#projects.departments': 'bounded',
  'projectList#departments': 'bounded',
  'operatingParameterList#value': 'bounded',
  'operatingParameterList#default': 'bounded',
  'operatingParameterHistory#value': 'bounded',
  'employeeImportGet#ignoredColumns': 'bounded',
  'employeeImportGet#summary.newPeopleByDepartment': 'bounded',
  'employeeImportGet#summary.departmentsWithoutHead': 'bounded',
  'employeeImportGet#summary.reviewQueue.items': 'bounded',
  'employeeImportGet#result.createdByDepartment': 'bounded',
  'employeeImportGet#result.departmentsWithoutHead': 'bounded',
  'employeeImportRowList#errors': 'bounded',
  'employeeImportRowList#differences': 'bounded',
  'seatBaselineImportGet#ignoredColumns': 'bounded',
  'seatBaselineImportRows#errors': 'bounded',
  'provisioningTaskList#steps': 'bounded',
  'provisioningTaskList#availableDecisions': 'bounded',
  'provisioningTaskGet#task.steps': 'bounded',
  'provisioningTaskGet#task.availableDecisions': 'bounded',
  'vendorGroupList#brandDomains': 'bounded',
  'vendorGroupList#serviceLines': 'owner-decision',
  'vendorGroupList#serviceLines.domains': 'bounded',
  'vendorGroupList#serviceLines.patterns': 'bounded',
  'applicationList#domains': 'bounded',
  'applicationGet#domains': 'bounded',
  'applicationGet#similarApplications': 'unbounded',
  'applicationGet#recommendations': 'bounded',
  'planGet#workspaceProfile.members': 'bounded',
  'vendorTaxProfileGet#profile.lines': 'bounded',
  'vendorTaxProfileGet#defaultProfile.lines': 'bounded',
  'vendorTaxProfileHistory#lines': 'bounded',
  'vendorTaxEstimate#lines': 'bounded',
  'subscriptionList#missing': 'bounded',
  'subscriptionList#alerts.dates': 'bounded',
  'subscriptionList#warnings': 'bounded',
  'subscriptionGet#missing': 'bounded',
  'subscriptionGet#alerts.dates': 'bounded',
  'subscriptionGet#warnings': 'bounded',
  'subscriptionCostAllocationGet#allocation.lines': 'bounded',
  'subscriptionCostAllocationHistory#lines': 'bounded',
  'planTermsGet#opinions': 'unbounded',
  'planTermsGet#warnings': 'unbounded',
  'applicationRetirementGet#retirement.confirmations': 'unbounded',
  'applicationRetirementGet#retirement.blockers.assignments': 'unbounded',
  'applicationRetirementGet#retirement.blockers.subscriptions': 'unbounded',
  'standardToolsetList#plans': 'bounded',
  'standardToolsetMine#toolset.plans': 'bounded',
  'standardToolsetGet#toolset.plans': 'bounded',
  'standardToolsetHistory#plans': 'bounded',
  'onboardingChecklistGet#steps': 'bounded',
  'onboardingChecklistGet#steps.reasons': 'bounded',
  'onboardingChecklistGet#steps.warnings': 'unbounded',
  'onboardingChecklistGet#suggestions': 'bounded',
  'meGet#roles.direct': 'bounded',
  'meGet#roles.derived': 'bounded',
  'meGet#roles.effective': 'bounded',
  'appUserList#roles': 'bounded',
  'appUserGet#roles': 'bounded',
  'appUserGet#roleHistory': 'unbounded',
  'approvalRoleList#history': 'bounded',
  'departmentToolsInUse#data.summary': 'unbounded',
};

interface Schema {
  $ref?: string;
  type?: string;
  properties?: Record<string, Schema>;
  additionalProperties?: Schema | boolean;
  items?: Schema;
  anyOf?: Schema[];
  oneOf?: Schema[];
  allOf?: Schema[];
  maximum?: number;
  maxItems?: number;
}

interface Operation {
  operationId?: string;
  parameters?: { name: string; in: string; schema?: Schema }[];
  responses: Record<string, { content?: Record<string, { schema?: Schema }> }>;
}

interface OpenApi {
  paths: Record<string, Partial<Record<string, Operation>>>;
  components?: { schemas?: Record<string, Schema> };
}

interface Collection {
  itemProperties: string[];
  item: Schema;
  pageSizeMaximum: number | undefined;
  responseRef: string | undefined;
}

interface Resource {
  /** The property names of `data`, and of its only property when `data` wraps one object. */
  shapes: string[][];
  responseRef: string | undefined;
}

interface Registries {
  exceptions: readonly CollectionException[];
  nonEnvelope: Readonly<Record<string, string>>;
  nestedArrays: readonly NestedArrayEntry[];
  ownerExists: (owner: string) => boolean;
}

const CLASSIFICATIONS: readonly Classification[] = [
  'detail-reuse',
  'detail-projection',
  'unbounded',
  'bounded',
  'query',
  'owner-decision',
];
const NEEDS_MAXIMUM: readonly Classification[] = ['detail-reuse', 'bounded'];
const NESTED_CLASSIFICATIONS: readonly NestedClassification[] = ['bounded', 'unbounded', 'owner-decision'];
/** An exact operationId: no glob, suffix or prefix wildcard can match more than one operation. */
const EXACT_OPERATION_ID = /^[a-z][A-Za-z0-9]*$/;
/** `operationId#path` whose segments are property names (or `{}` for a map value), each optionally followed by `[]`. */
const NESTED_KEY =
  /^[a-z][A-Za-z0-9]*#(?:data\.)?(?:[A-Za-z_][A-Za-z0-9_]*|\{\})(?:\[\])*(?:\.(?:[A-Za-z_][A-Za-z0-9_]*|\{\})(?:\[\])*)*$/;
const FINDING = /^LD-\d+$/;
const WORK_ITEM_FOLDER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NEEDS_MAXIMUM_MESSAGE = 'needs a business maximum: maxItems as a positive integer item count, with its source';

function schemaTools(document: OpenApi) {
  const named = document.components?.schemas ?? {};
  const resolve = (schema: Schema | undefined): Schema | undefined => {
    let current = schema;
    for (let depth = 0; current?.$ref && depth < 20; depth += 1) current = named[current.$ref.split('/').pop() ?? ''];
    return current;
  };
  const variants = (schema: Schema | undefined): Schema[] => {
    const resolved = resolve(schema);
    if (!resolved) return [];
    const nested = [...(resolved.anyOf ?? []), ...(resolved.oneOf ?? []), ...(resolved.allOf ?? [])].flatMap(variants);
    return nested.length > 0 ? nested : [resolved];
  };
  const propertyNames = (schema: Schema | undefined): string[] =>
    [...new Set(variants(schema).flatMap((variant) => Object.keys(variant.properties ?? {})))].sort();
  const property = (schema: Schema | undefined, name: string): Schema | undefined =>
    variants(schema).find((variant) => variant.properties?.[name])?.properties?.[name];
  const isArray = (schema: Schema | undefined): boolean => variants(schema).some((variant) => variant.type === 'array');
  const arrayItem = (schema: Schema | undefined): Schema | undefined =>
    variants(schema).find((variant) => variant.type === 'array')?.items;

  return { resolve, propertyNames, property, isArray, arrayItem };
}

/**
 * Every array below the 200 `data` of every GET except a collection's own array, keyed `operationId#path` (the
 * NestedArrayEntry key), with the schema's `maxItems` when every variant of the array declares one. Unions are walked
 * variant by variant, maps through `{}`, array items through `[]`; a `$ref` already on the way down is not entered
 * again, so a cyclic schema ends. Collection detection is the one `evaluate` uses.
 */
function nestedArrayInventory(
  document: OpenApi,
  nonEnvelope: Readonly<Record<string, string>>,
): Map<string, number | undefined> {
  const tools = schemaTools(document);
  const named = document.components?.schemas ?? {};
  const found = new Map<string, { declared: boolean; maxItems: number }>();
  const below = (base: string, name: string) => (base === '' ? name : `${base}.${name}`);

  // `key` is the key of this value if it is an array; `base` prefixes the paths of its properties.
  const walk = (operationId: string, schema: Schema | undefined, key: string, base: string, refs: Set<string>) => {
    if (!schema) return;
    if (schema.$ref) {
      const name = schema.$ref.split('/').pop() ?? '';
      if (!refs.has(name)) walk(operationId, named[name], key, base, new Set([...refs, name]));
      return;
    }
    for (const part of [...(schema.anyOf ?? []), ...(schema.oneOf ?? []), ...(schema.allOf ?? [])])
      walk(operationId, part, key, base, refs);
    if (schema.type === 'array') {
      if (key !== '') {
        const full = `${operationId}#${key}`;
        const previous = found.get(full);
        found.set(full, {
          declared: schema.maxItems !== undefined && (previous?.declared ?? true),
          maxItems: Math.max(previous?.maxItems ?? 0, schema.maxItems ?? 0),
        });
      }
      walk(operationId, schema.items, `${key}[]`, key, refs);
      return;
    }
    for (const [name, child] of Object.entries(schema.properties ?? {}))
      walk(operationId, child, below(base, name), below(base, name), refs);
    if (typeof schema.additionalProperties === 'object')
      walk(operationId, schema.additionalProperties, below(base, '{}'), below(base, '{}'), refs);
  };

  for (const item of Object.values(document.paths)) {
    const id = item.get?.operationId;
    if (!id) continue;
    const data = tools.property(item.get?.responses['200']?.content?.['application/json']?.schema, 'data');
    const topName = nonEnvelope[id] ?? 'items';
    const top = tools.isArray(data) ? data : tools.property(data, topName);
    if (!tools.isArray(top)) {
      walk(id, data, '', '', new Set());
      continue;
    }
    walk(id, tools.arrayItem(top), '[]', '', new Set());
    if (top !== data)
      for (const name of tools.propertyNames(data))
        if (name !== topName) walk(id, tools.property(data, name), `data.${name}`, `data.${name}`, new Set());
  }

  return new Map([...found].map(([key, { declared, maxItems }]) => [key, declared ? maxItems : undefined]));
}

/** The entries outside INITIAL_NESTED_ARRAYS: a new key, or a key whose classification changed; each needs the Owner. */
function nestedEntriesOutsideInitialSet(entries: readonly NestedArrayEntry[]): string[] {
  return entries
    .filter(
      (entry) =>
        !Object.hasOwn(INITIAL_NESTED_ARRAYS, entry.key) || INITIAL_NESTED_ARRAYS[entry.key] !== entry.classification,
    )
    .map((entry) => `${entry.key} (${entry.classification})`);
}

/** Classifies every GET of the document and returns everything the rule finds wrong, one sentence each. */
function evaluate(document: OpenApi, registries: Registries): string[] {
  const tools = schemaTools(document);
  const problems: string[] = [];
  const collections = new Map<string, Collection>();
  const resources = new Map<string, Resource>();

  for (const [path, item] of Object.entries(document.paths)) {
    const operation = item.get;
    if (!operation) continue;
    const id = operation.operationId;
    if (!id) {
      problems.push(`GET ${path} has no operationId`);
      continue;
    }
    const schema = operation.responses['200']?.content?.['application/json']?.schema;
    const responseRef = schema?.$ref;
    const data = tools.property(schema, 'data');
    const pageSize = operation.parameters?.find(
      (parameter) => parameter.in === 'query' && parameter.name === 'pageSize',
    );
    const pageSizeMaximum = tools.resolve(pageSize?.schema)?.maximum;
    const nonEnvelope = registries.nonEnvelope[id];
    const array = tools.isArray(data) ? data : (tools.property(data, nonEnvelope ?? 'items') ?? undefined);

    if (nonEnvelope !== undefined && !tools.isArray(tools.property(data, nonEnvelope))) {
      problems.push(`${id}: NON_ENVELOPE_COLLECTIONS names '${nonEnvelope}', which is not an array of its data`);
      continue;
    }
    if (tools.isArray(array)) {
      const element = tools.arrayItem(array) ?? {};
      collections.set(id, {
        item: element,
        itemProperties: tools.propertyNames(element),
        pageSizeMaximum,
        responseRef,
      });
      continue;
    }
    const top = tools.propertyNames(data);
    const shapes = [top];
    if (top.length === 1 && !tools.isArray(tools.property(data, top[0])))
      shapes.push(tools.propertyNames(tools.property(data, top[0])));
    resources.set(id, { shapes, responseRef });
  }

  for (const id of Object.keys(registries.nonEnvelope))
    if (!collections.has(id)) problems.push(`${id}: NON_ENVELOPE_COLLECTIONS entry is not a GET collection (stale)`);

  const keys = new Set<string>();
  for (const entry of registries.exceptions) {
    const key = `${entry.operationId}#${entry.classification}`;
    if (keys.has(key)) problems.push(`${key}: duplicate exception`);
    keys.add(key);
    problems.push(...hygiene(entry, registries.ownerExists));
    if (EXACT_OPERATION_ID.test(entry.operationId) && !collections.has(entry.operationId))
      problems.push(`${key}: no GET collection has this operationId (stale entry)`);
  }

  const detailResponseRefs = new Set([...resources.values()].map((resource) => resource.responseRef));
  for (const [id, collection] of collections) {
    const entries = registries.exceptions.filter((entry) => entry.operationId === id);
    const has = (classification: Classification) => entries.find((entry) => entry.classification === classification);
    const unpaged = has('bounded') ?? has('unbounded');

    if (collection.pageSizeMaximum === undefined && !unpaged)
      problems.push(`${id}: collection without a pageSize maximum and no bounded or unbounded exception`);
    if (collection.pageSizeMaximum !== undefined && unpaged)
      problems.push(`${id}#${unpaged.classification}: the collection is paginated now (stale entry)`);

    const sameShape = [...resources]
      .filter(([, resource]) => resource.shapes.some((shape) => shape.join() === collection.itemProperties.join()))
      .map(([detail]) => detail);
    const reuse = has('detail-reuse');
    if (sameShape.length > 0 && !(reuse && sameShape.includes(reuse.detailOperationId ?? '')))
      problems.push(`${id}: the item has the shape of ${sameShape.join(', ')} and no detail-reuse exception names it`);
    if (reuse && !sameShape.includes(reuse.detailOperationId ?? ''))
      problems.push(`${id}#detail-reuse: the item no longer has the shape of ${reuse.detailOperationId} (stale entry)`);
    // A page of the detail resource holds at most pageSize.maximum items: the recorded number must be that one.
    if (
      reuse &&
      isItemCountMaximum(reuse.businessMaximum) &&
      reuse.businessMaximum.maxItems !== collection.pageSizeMaximum
    )
      problems.push(
        `${id}#detail-reuse: records maxItems ${reuse.businessMaximum.maxItems} but pageSize.maximum is ` +
          `${collection.pageSizeMaximum ?? 'not declared'} (stale entry)`,
      );

    const projection = has('detail-projection');
    const missing = (projection?.projectedFields ?? []).filter((field) => !collection.itemProperties.includes(field));
    if (missing.length > 0)
      problems.push(`${id}#detail-projection: the item no longer carries ${missing.join(', ')} (stale entry)`);

    for (const entry of entries)
      if (entry.itemProperties.join() !== collection.itemProperties.join())
        problems.push(
          `${id}#${entry.classification}: the item is now [${collection.itemProperties.join(', ')}]; ` +
            'remove the entry if its finding is fixed, or have its owner review it',
        );
    if (collection.responseRef && detailResponseRefs.has(collection.responseRef))
      problems.push(`${id}: shares its response schema ${collection.responseRef} with a detail operation`);
  }

  problems.push(...nestedProblems(nestedArrayInventory(document, registries.nonEnvelope), registries));

  return problems;
}

function hygiene(entry: CollectionException, ownerExists: (owner: string) => boolean): string[] {
  const key = `${entry.operationId}#${entry.classification}`;
  const problems: string[] = [];
  if (!EXACT_OPERATION_ID.test(entry.operationId))
    problems.push(`${key}: operationId must be one exact operationId, not a pattern`);
  if (!CLASSIFICATIONS.includes(entry.classification)) problems.push(`${key}: unknown classification`);
  if (!WORK_ITEM_FOLDER.test(entry.owner) || !ownerExists(entry.owner))
    problems.push(`${key}: owner '${entry.owner}' is not a work item under docs/workspace/items`);
  if (entry.rationale.trim() === '' || entry.removeWhen.trim() === '')
    problems.push(`${key}: needs a rationale and a removal or review condition`);
  if (entry.itemProperties.length === 0 || entry.itemProperties.join() !== [...entry.itemProperties].sort().join())
    problems.push(`${key}: itemProperties must list the item's property names, sorted`);
  if (NEEDS_MAXIMUM.includes(entry.classification) && !isItemCountMaximum(entry.businessMaximum))
    problems.push(`${key}: ${NEEDS_MAXIMUM_MESSAGE}`);
  if (entry.classification === 'detail-reuse' && !entry.detailOperationId)
    problems.push(`${key}: needs the detail operation it reuses`);
  if (entry.classification === 'detail-projection' && !entry.projectedFields?.length)
    problems.push(`${key}: needs the detail-only fields it projects`);

  return problems;
}

/**
 * NESTED_ARRAYS against the recursive inventory: every array has exactly one entry, every entry still names an array,
 * and a recorded maximum equals the schema's `maxItems` when the schema has one.
 */
function nestedProblems(inventory: Map<string, number | undefined>, registries: Registries): string[] {
  const problems: string[] = [];
  const recorded = new Set<string>();
  for (const entry of registries.nestedArrays) {
    if (recorded.has(entry.key)) problems.push(`${entry.key}: duplicate nested-array entry`);
    recorded.add(entry.key);
    problems.push(...nestedHygiene(entry, registries.ownerExists));
    if (!NESTED_KEY.test(entry.key)) continue;
    if (!inventory.has(entry.key)) {
      problems.push(`${entry.key}: NESTED_ARRAYS entry matches no array of the mounted contract (stale entry)`);
      continue;
    }
    const declared = inventory.get(entry.key);
    if (
      entry.classification === 'bounded' &&
      declared !== undefined &&
      isItemCountMaximum(entry.businessMaximum) &&
      entry.businessMaximum.maxItems !== declared
    )
      problems.push(
        `${entry.key}: records maxItems ${entry.businessMaximum.maxItems} but the schema says maxItems ${declared} (stale entry)`,
      );
  }
  for (const key of [...inventory.keys()].sort())
    if (!recorded.has(key))
      problems.push(
        `${key}: array not in NESTED_ARRAYS — record its maximum, its finding or its Owner decision, or page it`,
      );

  return problems;
}

function nestedHygiene(entry: NestedArrayEntry, ownerExists: (owner: string) => boolean): string[] {
  const { key, classification } = entry;
  const problems: string[] = [];
  if (!NESTED_KEY.test(key))
    problems.push(`${key}: key must be one operationId#path with exact segments, not a pattern`);
  if (!NESTED_CLASSIFICATIONS.includes(classification)) problems.push(`${key}: unknown classification`);
  if (!WORK_ITEM_FOLDER.test(entry.owner) || !ownerExists(entry.owner))
    problems.push(`${key}: owner '${entry.owner}' is not a work item under docs/workspace/items`);
  if (entry.rationale.trim() === '' || entry.removeWhen.trim() === '')
    problems.push(`${key}: needs a rationale and a removal or review condition`);
  if (classification === 'bounded' && !isItemCountMaximum(entry.businessMaximum))
    problems.push(`${key}: ${NEEDS_MAXIMUM_MESSAGE}`);
  if (classification !== 'bounded' && entry.businessMaximum !== undefined)
    problems.push(`${key}: an ${classification} entry records no business maximum`);
  if (classification !== 'bounded' && !entry.findings.some((finding) => FINDING.test(finding)))
    problems.push(`${key}: an ${classification} entry needs the exact finding that tracks it`);
  if (classification === 'owner-decision' && !entry.findings.includes('LD-13'))
    problems.push(`${key}: an owner-decision entry names its LD-13 point`);

  return problems;
}

/** A recorded number, not prose: zero, negative, fractional, non-finite or text values and a blank source fail. */
function isItemCountMaximum(maximum: BusinessMaximum | undefined): maximum is BusinessMaximum {
  return (
    Number.isSafeInteger(maximum?.maxItems) &&
    (maximum?.maxItems ?? 0) > 0 &&
    typeof maximum?.source === 'string' &&
    maximum.source.trim() !== ''
  );
}

const repositoryRoot = process.cwd();
const realRegistries: Registries = {
  exceptions: COLLECTION_EXCEPTIONS,
  nonEnvelope: NON_ENVELOPE_COLLECTIONS,
  nestedArrays: NESTED_ARRAYS,
  ownerExists: (owner) => existsSync(join(repositoryRoot, 'docs', 'workspace', 'items', owner, 'spec.md')),
};

/** The exception keys a registry holds outside INITIAL_EXCEPTION_KEYS; each one needs a new Owner decision. */
function keysOutsideInitialSet(exceptions: readonly CollectionException[]): string[] {
  return exceptions
    .map((exception) => `${exception.operationId}#${exception.classification}`)
    .filter((key) => !INITIAL_EXCEPTION_KEYS.includes(key));
}

/**
 * A minimal OpenAPI document: `collections` answer `{ data: { items: [...], ...wrapper } }`, `details` answer `{ data }`.
 * Item properties are strings, except the schemas given in `properties`; `schemas` become components for `$ref`.
 */
function fixture(options: {
  collections?: Record<
    string,
    { item: string[]; pageSizeMaximum?: number; properties?: Record<string, Schema>; wrapper?: Record<string, Schema> }
  >;
  details?: Record<string, Record<string, Schema>>;
  schemas?: Record<string, Schema>;
}): OpenApi {
  const object = (names: string[], properties: Record<string, Schema> = {}): Schema => ({
    type: 'object',
    properties: { ...Object.fromEntries(names.map((name) => [name, { type: 'string' }])), ...properties },
  });
  const envelope = (data: Schema) => ({
    responses: {
      '200': { content: { 'application/json': { schema: { type: 'object', properties: { data } } } } },
    },
  });
  const paths: OpenApi['paths'] = {};
  for (const [id, { item, pageSizeMaximum, properties, wrapper }] of Object.entries(options.collections ?? {}))
    paths[`/${id}`] = {
      get: {
        operationId: id,
        parameters:
          pageSizeMaximum === undefined
            ? []
            : [{ name: 'pageSize', in: 'query', schema: { type: 'integer', maximum: pageSizeMaximum } }],
        ...envelope({
          type: 'object',
          properties: { items: { type: 'array', items: object(item, properties) }, ...wrapper },
        }),
      },
    };
  for (const [id, properties] of Object.entries(options.details ?? {}))
    paths[`/${id}/{id}`] = { get: { operationId: id, ...envelope({ type: 'object', properties }) } };

  return { paths, components: { schemas: options.schemas ?? {} } };
}

const noRegistries = (overrides: Partial<Registries> = {}): Registries => ({
  exceptions: [],
  nonEnvelope: {},
  nestedArrays: [],
  ownerExists: (owner) => owner === 'an-owning-item',
  ...overrides,
});

const nestedEntry = (key: string, overrides: Partial<NestedArrayEntry> = {}): NestedArrayEntry => ({
  key,
  classification: 'bounded',
  findings: [],
  owner: 'an-owning-item',
  rationale: 'Why the array is bounded.',
  removeWhen: 'Review when its source changes.',
  businessMaximum: { maxItems: 20, source: 'a code constant' },
  ...overrides,
});

const unregistered = (key: string) =>
  `${key}: array not in NESTED_ARRAYS — record its maximum, its finding or its Owner decision, or page it`;

// Registry data as an author could write it, so the casts in the tests below are the point of the tests.
const INVALID_MAXIMA: Record<string, object> = {
  zero: { maxItems: 0, source: 'a code constant' },
  negative: { maxItems: -1, source: 'a code constant' },
  fractional: { maxItems: 1.5, source: 'a code constant' },
  'not a number': { maxItems: Number.NaN, source: 'a code constant' },
  infinite: { maxItems: Number.POSITIVE_INFINITY, source: 'a code constant' },
  text: { maxItems: '20', source: 'a code constant' },
  missing: { source: 'a code constant' },
  'prose only': { limit: '20 per parent', source: 'a code constant' },
  'no source': { maxItems: 20, source: ' ' },
};

/** The arrays review LD-R2-RV-02 named; the recursive inventory must find every one. */
const REVIEW_NAMED_ARRAYS = [
  'approvalRoleList#history',
  'standardToolsetList#plans',
  'applicationList#domains',
  'vendorGroupList#serviceLines',
  'departmentGet#projects.departments',
  'employeeImportGet#summary.reviewQueue.items',
  'vendorGroupList#serviceLines.domains',
  'subscriptionList#alerts.dates',
  'applicationRetirementGet#retirement.blockers.assignments',
  'onboardingChecklistGet#steps.reasons',
];

const entry = (overrides: Partial<CollectionException>): CollectionException => ({
  operationId: 'thingList',
  classification: 'query',
  findings: ['LD-00'],
  owner: 'an-owning-item',
  rationale: 'Why the entry exists.',
  removeWhen: 'When it can go.',
  itemProperties: ['id', 'name'],
  ...overrides,
});

describe('collection and detail contract gate (API-LIST-DETAIL.1, LD-R2)', () => {
  const document = JSON.parse(readFileSync(join(repositoryRoot, 'openapi.json'), 'utf8')) as OpenApi;

  it('finds every mounted collection compliant or recorded by an exact, current exception', () => {
    expect(evaluate(document, realRegistries)).toEqual([]);
  });

  it('only ever shrinks the exception registry recorded on 22/10/2026', () => {
    expect(keysOutsideInitialSet(COLLECTION_EXCEPTIONS)).toEqual([]);
  });

  it('records the unpaged department warnings and non-working dates as unbounded, never bounded (LD-15)', () => {
    const keys = COLLECTION_EXCEPTIONS.map((exception) => `${exception.operationId}#${exception.classification}`);
    const corrected = COLLECTION_EXCEPTIONS.filter((exception) => exception.findings.includes('LD-15'));

    expect(keys).toEqual(expect.arrayContaining(['departmentWarningList#unbounded', 'nonWorkingDateList#unbounded']));
    expect(keys).not.toContain('departmentWarningList#bounded');
    expect(keys).not.toContain('nonWorkingDateList#bounded');
    expect(corrected.map((exception) => `${exception.operationId} -> ${exception.owner}`).sort()).toEqual([
      'departmentWarningList -> organization-identity-read-contracts',
      'nonWorkingDateList -> g2-fiscal-year-operating-parameters',
    ]);
  });

  it('cannot make either LD-15 operation bounded again with a count per department or per year', () => {
    const asBounded = (operationId: string, maximum: object): CollectionException[] =>
      COLLECTION_EXCEPTIONS.map((exception) =>
        exception.operationId === operationId && ['bounded', 'unbounded'].includes(exception.classification)
          ? {
              ...exception,
              classification: 'bounded' as const,
              findings: [],
              businessMaximum: maximum as BusinessMaximum,
            }
          : exception,
      );
    // The Prompt 09 claims, word for word.
    const perDepartment = {
      limit: '2 per active department (MISSING_HEAD, MISSING_IT_ADMIN)',
      source: 'warning enum of department.dto.ts',
    };
    const perYear = {
      limit: 'one row per calendar date: at most 366 per year of the requested range',
      source: 'unique index non_working_dates_organization_id_date_key',
    };
    const refused = (key: string) => [
      `${key}: needs a business maximum: maxItems as a positive integer item count, with its source`,
    ];

    expect(
      evaluate(document, { ...realRegistries, exceptions: asBounded('departmentWarningList', perDepartment) }),
    ).toEqual(refused('departmentWarningList#bounded'));
    expect(evaluate(document, { ...realRegistries, exceptions: asBounded('nonWorkingDateList', perYear) })).toEqual(
      refused('nonWorkingDateList#bounded'),
    );
    // Written as a number, the per-parent count is still not a maximum of the response: the key needs the Owner.
    expect(
      keysOutsideInitialSet(asBounded('departmentWarningList', { maxItems: 2, source: perDepartment.source })),
    ).toEqual(['departmentWarningList#bounded']);
    expect(keysOutsideInitialSet(asBounded('nonWorkingDateList', { maxItems: 366, source: perYear.source }))).toEqual([
      'nonWorkingDateList#bounded',
    ]);
  });

  it('keeps the operations of the LD-13 Owner decisions recorded, so no contract is chosen by this gate', () => {
    const decisions = COLLECTION_EXCEPTIONS.filter((exception) => exception.findings.includes('LD-13'));

    expect(decisions.map((exception) => exception.operationId).sort()).toEqual([
      'auditEventList',
      'departmentList',
      'licenseAssignmentList',
      'provisioningTaskList',
      'subscriptionList',
      'vendorGroupList',
      'vendorProposalList',
      'vendorSuggestionList',
    ]);
  });

  it('discovers every nested array review LD-R2-RV-02 named, however deep', () => {
    expect([...nestedArrayInventory(document, NON_ENVELOPE_COLLECTIONS).keys()]).toEqual(
      expect.arrayContaining(REVIEW_NAMED_ARRAYS),
    );
  });

  it('only ever shrinks the nested-array inventory recorded on 23/10/2026, classification included', () => {
    const reclassified = NESTED_ARRAYS.map((entry) =>
      entry.key === 'planTermsGet#warnings'
        ? { ...entry, classification: 'bounded' as const, businessMaximum: { maxItems: 20, source: 'a guess' } }
        : entry,
    );

    expect(Object.keys(INITIAL_NESTED_ARRAYS)).toEqual(expect.arrayContaining(REVIEW_NAMED_ARRAYS));
    expect(nestedEntriesOutsideInitialSet(NESTED_ARRAYS)).toEqual([]);
    expect(nestedEntriesOutsideInitialSet([...NESTED_ARRAYS, nestedEntry('jobTitleList#aliases')])).toEqual([
      'jobTitleList#aliases (bounded)',
    ]);
    expect(nestedEntriesOutsideInitialSet(reclassified)).toEqual(['planTermsGet#warnings (bounded)']);
  });

  it('records the unbounded nested arrays no earlier finding covers as LD-16, each with an existing owner', () => {
    const subcases = NESTED_ARRAYS.filter((entry) => entry.findings.includes('LD-16'));

    expect(subcases.map((entry) => `${entry.key} -> ${entry.owner}`).sort()).toEqual([
      'onboardingChecklistGet#steps.warnings -> api-list-detail-contract-remediation',
      'planTermsGet#warnings -> catalog-subscription-read-model',
    ]);
    expect(subcases.every((entry) => entry.classification === 'unbounded')).toBe(true);
  });

  describe('on fixture documents (each case is one way the rule is broken)', () => {
    const compliant = fixture({
      collections: { thingList: { item: ['id', 'name'], pageSizeMaximum: 100 } },
      details: { thingGet: { id: { type: 'string' }, name: { type: 'string' }, notes: { type: 'string' } } },
    });

    it('accepts a paginated summary whose detail extends it', () => {
      expect(evaluate(compliant, noRegistries())).toEqual([]);
    });

    it('refuses an unregistered collection without a pageSize maximum', () => {
      const document = fixture({ collections: { thingList: { item: ['id', 'name'] } } });

      expect(evaluate(document, noRegistries())).toEqual([
        'thingList: collection without a pageSize maximum and no bounded or unbounded exception',
      ]);
    });

    it('refuses a collection that reuses the detail schema without an exact bounded exception', () => {
      const document = fixture({
        collections: { thingList: { item: ['id', 'name', 'notes'], pageSizeMaximum: 100 } },
        details: { thingGet: { id: { type: 'string' }, name: { type: 'string' }, notes: { type: 'string' } } },
      });
      const unbounded = entry({
        classification: 'detail-reuse',
        detailOperationId: 'thingGet',
        itemProperties: ['id', 'name', 'notes'],
      });

      expect(evaluate(document, noRegistries())).toEqual([
        'thingList: the item has the shape of thingGet and no detail-reuse exception names it',
      ]);
      expect(evaluate(document, noRegistries({ exceptions: [unbounded] }))).toEqual([
        'thingList#detail-reuse: needs a business maximum: maxItems as a positive integer item count, with its source',
      ]);
      const bounded = { ...unbounded, businessMaximum: { maxItems: 100, source: 'pageSize maximum' } };
      expect(evaluate(document, noRegistries({ exceptions: [bounded] }))).toEqual([]);
    });

    it('refuses a bounded or detail-reuse entry whose maximum is not a positive integer item count', () => {
      const cases: [Classification, OpenApi, CollectionException, number][] = [
        [
          'bounded',
          fixture({ collections: { thingList: { item: ['id', 'name'] } } }),
          entry({ classification: 'bounded' }),
          20,
        ],
        [
          'detail-reuse',
          fixture({
            collections: { thingList: { item: ['id', 'name', 'notes'], pageSizeMaximum: 100 } },
            details: { thingGet: { id: { type: 'string' }, name: { type: 'string' }, notes: { type: 'string' } } },
          }),
          entry({
            classification: 'detail-reuse',
            detailOperationId: 'thingGet',
            itemProperties: ['id', 'name', 'notes'],
          }),
          100,
        ],
      ];

      for (const [classification, document, base, maxItems] of cases) {
        const withMaximum = (maximum: object) =>
          evaluate(document, noRegistries({ exceptions: [{ ...base, businessMaximum: maximum as BusinessMaximum }] }));
        const refused = [`thingList#${classification}: ${NEEDS_MAXIMUM_MESSAGE}`];

        for (const [name, maximum] of Object.entries(INVALID_MAXIMA))
          expect({ classification, name, problems: withMaximum(maximum) }).toEqual({
            classification,
            name,
            problems: refused,
          });
        expect({ classification, problems: withMaximum({ maxItems, source: 'a code constant' }) }).toEqual({
          classification,
          problems: [],
        });
      }
    });

    it('refuses a detail-reuse maxItems that differs from the real pageSize maximum, naming both', () => {
      const document = fixture({
        collections: { thingList: { item: ['id', 'name', 'notes'], pageSizeMaximum: 100 } },
        details: { thingGet: { id: { type: 'string' }, name: { type: 'string' }, notes: { type: 'string' } } },
      });
      const reuse = (maxItems: number) =>
        entry({
          classification: 'detail-reuse',
          detailOperationId: 'thingGet',
          itemProperties: ['id', 'name', 'notes'],
          businessMaximum: { maxItems, source: 'pageSize maximum of the operation' },
        });

      expect(evaluate(document, noRegistries({ exceptions: [reuse(50)] }))).toEqual([
        'thingList#detail-reuse: records maxItems 50 but pageSize.maximum is 100 (stale entry)',
      ]);
      expect(evaluate(document, noRegistries({ exceptions: [reuse(100)] }))).toEqual([]);
    });

    it('refuses a detail reuse hidden behind the detail wrapper property', () => {
      const document = fixture({
        collections: { thingList: { item: ['id', 'name'], pageSizeMaximum: 100 } },
        details: {
          thingGet: { thing: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } } },
        },
      });

      expect(evaluate(document, noRegistries())).toEqual([
        'thingList: the item has the shape of thingGet and no detail-reuse exception names it',
      ]);
    });

    it('refuses a stale exception: the operation was fixed, changed shape or no longer exists', () => {
      const fixedPaging = entry({ classification: 'unbounded' });
      const changedShape = entry({ classification: 'query', itemProperties: ['id', 'name', 'removedField'] });
      const gone = entry({ operationId: 'removedList' });

      expect(evaluate(compliant, noRegistries({ exceptions: [fixedPaging, changedShape, gone] }))).toEqual([
        'removedList#query: no GET collection has this operationId (stale entry)',
        'thingList#unbounded: the collection is paginated now (stale entry)',
        'thingList#query: the item is now [id, name]; remove the entry if its finding is fixed, or have its owner review it',
      ]);
    });

    it('refuses a glob, suffix or prefix instead of one exact operationId', () => {
      const patterns = ['*List', 'thing*', 'thing.*', 'catalog/thingList'].map((operationId) => entry({ operationId }));

      expect(evaluate(compliant, noRegistries({ exceptions: patterns }))).toEqual(
        patterns.map(
          (pattern) => `${pattern.operationId}#query: operationId must be one exact operationId, not a pattern`,
        ),
      );
    });

    it('refuses an exception without an owning work item, a rationale or a removal condition', () => {
      const incomplete = entry({ owner: 'nobody', rationale: ' ', removeWhen: '' });

      expect(evaluate(compliant, noRegistries({ exceptions: [incomplete] }))).toEqual([
        "thingList#query: owner 'nobody' is not a work item under docs/workspace/items",
        'thingList#query: needs a rationale and a removal or review condition',
      ]);
    });

    it('refuses a list hidden under another property of a detail-like answer', () => {
      const document = fixture({
        details: { thingSearch: { results: { type: 'array', items: { type: 'object' } } } },
      });

      expect(evaluate(document, noRegistries())).toEqual([unregistered('thingSearch#results')]);
      expect(evaluate(document, noRegistries({ nestedArrays: [nestedEntry('thingSearch#results')] }))).toEqual([]);
    });
  });

  describe('nested arrays on fixture documents (LD-R2-RV-02: every array below data, at any depth)', () => {
    const lines: Schema = { type: 'array', items: { type: 'object', properties: { code: { type: 'string' } } } };

    it('refuses an unregistered array in a collection item', () => {
      const document = fixture({
        collections: {
          thingList: { item: ['id'], pageSizeMaximum: 100, properties: { tags: { type: 'array', items: {} } } },
        },
      });

      expect(evaluate(document, noRegistries())).toEqual([unregistered('thingList#tags')]);
      expect(evaluate(document, noRegistries({ nestedArrays: [nestedEntry('thingList#tags')] }))).toEqual([]);
    });

    it('refuses an unregistered array next to the collection array, in its data wrapper', () => {
      const document = fixture({
        collections: { thingList: { item: ['id'], pageSizeMaximum: 100, wrapper: { summary: lines } } },
      });

      expect(evaluate(document, noRegistries())).toEqual([unregistered('thingList#data.summary')]);
    });

    it('refuses an unregistered array two object levels inside a detail', () => {
      const document = fixture({
        details: {
          thingGet: {
            summary: { type: 'object', properties: { queue: { type: 'object', properties: { entries: lines } } } },
          },
        },
      });

      expect(evaluate(document, noRegistries())).toEqual([unregistered('thingGet#summary.queue.entries')]);
      expect(
        evaluate(document, noRegistries({ nestedArrays: [nestedEntry('thingGet#summary.queue.entries')] })),
      ).toEqual([]);
    });

    it('refuses an unregistered array inside the items of another array', () => {
      const document = fixture({
        details: {
          thingGet: {
            lines: { type: 'array', items: { type: 'object', properties: { codes: { type: 'array', items: {} } } } },
            grid: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
          },
        },
      });
      const registered = [nestedEntry('thingGet#lines'), nestedEntry('thingGet#grid')];

      expect(evaluate(document, noRegistries({ nestedArrays: registered }))).toEqual([
        unregistered('thingGet#grid[]'),
        unregistered('thingGet#lines.codes'),
      ]);
    });

    it('walks unions, maps and cyclic $ref graphs, recording each array once', () => {
      const document = fixture({
        schemas: {
          Node: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              children: { type: 'array', items: { $ref: '#/components/schemas/Node' } },
            },
          },
        },
        details: {
          treeGet: {
            root: { $ref: '#/components/schemas/Node' },
            value: { anyOf: [{ type: 'number' }, { type: 'array', items: { type: 'number' } }] },
            byCode: { type: 'object', additionalProperties: lines },
          },
        },
      });

      expect(evaluate(document, noRegistries())).toEqual([
        unregistered('treeGet#byCode.{}'),
        unregistered('treeGet#root.children'),
        unregistered('treeGet#value'),
      ]);
    });

    it('refuses a nested-array entry the mounted contract no longer has', () => {
      const document = fixture({ details: { thingGet: { lines } } });

      expect(
        evaluate(
          document,
          noRegistries({ nestedArrays: [nestedEntry('thingGet#lines'), nestedEntry('thingGet#gone')] }),
        ),
      ).toEqual(['thingGet#gone: NESTED_ARRAYS entry matches no array of the mounted contract (stale entry)']);
    });

    it('refuses a nested bound whose maximum is not a positive integer item count, or whose source is blank', () => {
      const document = fixture({ details: { thingGet: { lines } } });
      const withMaximum = (maximum: object) =>
        evaluate(
          document,
          noRegistries({
            nestedArrays: [nestedEntry('thingGet#lines', { businessMaximum: maximum as BusinessMaximum })],
          }),
        );

      for (const [name, maximum] of Object.entries(INVALID_MAXIMA))
        expect({ name, problems: withMaximum(maximum) }).toEqual({
          name,
          problems: [`thingGet#lines: ${NEEDS_MAXIMUM_MESSAGE}`],
        });
      expect(withMaximum({ maxItems: 20, source: 'a code constant' })).toEqual([]);
    });

    it('refuses a recorded maximum that differs from the maxItems of the schema', () => {
      const document = fixture({ details: { thingGet: { lines: { ...lines, maxItems: 5 } } } });
      const recorded = (maxItems: number) =>
        nestedEntry('thingGet#lines', { businessMaximum: { maxItems, source: 'maxItems of the schema' } });

      expect(evaluate(document, noRegistries({ nestedArrays: [recorded(10)] }))).toEqual([
        'thingGet#lines: records maxItems 10 but the schema says maxItems 5 (stale entry)',
      ]);
      expect(evaluate(document, noRegistries({ nestedArrays: [recorded(5)] }))).toEqual([]);
    });

    it('refuses a pattern key, a missing owner or reason, an unbounded entry without its finding or with a maximum', () => {
      const document = fixture({ details: { thingGet: { lines } } });
      const check = (entries: NestedArrayEntry[]) => evaluate(document, noRegistries({ nestedArrays: entries }));
      const valid = nestedEntry('thingGet#lines');

      expect(
        check([
          valid,
          ...['thingGet#*', 'thing*#lines', 'thingGet#lines.*', 'thingGet'].map((key) => nestedEntry(key)),
        ]),
      ).toEqual(
        ['thingGet#*', 'thing*#lines', 'thingGet#lines.*', 'thingGet'].map(
          (key) => `${key}: key must be one operationId#path with exact segments, not a pattern`,
        ),
      );
      expect(check([{ ...valid, owner: 'nobody', rationale: ' ', removeWhen: '' }])).toEqual([
        "thingGet#lines: owner 'nobody' is not a work item under docs/workspace/items",
        'thingGet#lines: needs a rationale and a removal or review condition',
      ]);
      const unbounded = nestedEntry('thingGet#lines', { classification: 'unbounded', businessMaximum: undefined });
      expect(check([{ ...unbounded, findings: [] }])).toEqual([
        'thingGet#lines: an unbounded entry needs the exact finding that tracks it',
      ]);
      expect(check([{ ...unbounded, findings: ['LD-06'], businessMaximum: { maxItems: 20, source: 'x' } }])).toEqual([
        'thingGet#lines: an unbounded entry records no business maximum',
      ]);
      expect(check([{ ...unbounded, classification: 'owner-decision', findings: ['LD-06'] }])).toEqual([
        'thingGet#lines: an owner-decision entry names its LD-13 point',
      ]);
    });
  });
});
