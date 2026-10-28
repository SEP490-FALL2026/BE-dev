import { createHash } from 'node:crypto';
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
      'ownerDepartmentId',
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
    removeWhen: 'Review when APPROVAL_ROLES changes.',
    itemProperties: ['history', 'historyHasMore', 'holder', 'role'],
  },
  {
    operationId: 'operatingParameterList',
    classification: 'bounded',
    findings: [],
    owner: 'g2-operating-parameters',
    businessMaximum: { maxItems: 16, source: 'definitions in parameter-definitions.ts' },
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
    rationale: 'The newest versions of one parameter; hasMore says there are older ones (LD-14).',
    removeWhen: 'Review when HISTORY_LIMIT changes.',
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
      'ownerDepartmentId',
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
    rationale:
      'Decision 5: which identity fields of the beneficiary, default owner and claimant a task card shows. Since LD-08 (23/10/2026) the card is a summary whose beneficiary carries {employeeId, employeeCode, fullName} and whose defaultResponsibleEmployeeId and claimedBy are ids only: the spec default, not an Owner decision. Reviewed after the G5/G6 merge (Prompt 02, 26/10/2026): the row gained `revocation` (the source and state of a revocation task), no identity field; decision 5 is still open.',
    removeWhen: 'The Owner decides point 5 of LD-13 and the chosen contract ships.',
    itemProperties: [
      'accountIdentifier',
      'assignmentId',
      'attempts',
      'availableDecisions',
      'beneficiary',
      'channel',
      'claimedAt',
      'claimedBy',
      'closedAt',
      'completedAt',
      'createdAt',
      'defaultResponsibleEmployeeId',
      'elapsedSeconds',
      'failedAt',
      'failureKind',
      'id',
      'inGeneralQueue',
      'kind',
      'maxAttempts',
      'nextRetryAt',
      'plan',
      'requestId',
      'revocation',
      'status',
      'subscriptionId',
    ],
  },
  {
    operationId: 'licenseAssignmentList',
    classification: 'owner-decision',
    findings: ['LD-13'],
    owner: 'licensing-assignment-read-contracts',
    rationale:
      'Decision 5: which identity fields of the holder an assignment row shows. Since LD-10 (23/10/2026) the row carries employee {employeeId, employeeCode, fullName}, plan and costCenter read in batches: the spec default, not an Owner decision. Reviewed after the G5/G6 merge (Prompt 02, 26/10/2026): the row gained `cancelledAt` (a grant cancelled when its request was withdrawn), no identity field; decision 5 is still open.',
    removeWhen: 'The Owner decides point 5 of LD-13 and the chosen contract ships.',
    itemProperties: [
      'accountIdentifier',
      'cancelledAt',
      'costCenter',
      'costCenterId',
      'createdAt',
      'effectiveFrom',
      'effectiveFromBasis',
      'effectiveFromLabel',
      'employee',
      'employeeId',
      'expectedEndDate',
      'failedAt',
      'grantedOn',
      'id',
      'kind',
      'owningDepartmentId',
      'plan',
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
 * Prompt 09 (22/10/2026). Frozen: this list is never edited again (P28-07). A key leaves COLLECTION_EXCEPTIONS, or a new
 * one enters it, only through an event of REGISTRY_EVENTS_SINCE_INITIAL; adding one needs the Owner. Before the freeze,
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
      maxItems: 3,
      source:
        'department-query.service.ts builds MISSING_HEAD, MISSING_IT_ADMIN and MISSING_COST_CENTER, each at most once (DepartmentWarning)',
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
      maxItems: 3,
      source:
        'department-query.service.ts builds MISSING_HEAD, MISSING_IT_ADMIN and MISSING_COST_CENTER, each at most once (DepartmentWarning)',
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
    rationale: 'The newest head periods; headHistoryHasMore says there are older ones (LD-14).',
    removeWhen: 'Review when DEPARTMENT_HEAD_HISTORY_LIMIT changes.',
  },
  {
    key: 'departmentGet#projects',
    classification: 'bounded',
    findings: ['LD-12'],
    owner: 'organization-identity-read-contracts',
    businessMaximum: {
      maxItems: 20,
      source:
        'PROFILE_PROJECT_LIMIT in project.types.ts (take of ProjectRepo.forDepartment); projectTotal counts them all',
    },
    rationale: 'The first projects the department takes part in; the rest are read from the paginated project list.',
    removeWhen: 'Review when PROFILE_PROJECT_LIMIT changes.',
  },
  {
    key: 'projectGet#departments',
    classification: 'bounded',
    findings: [],
    owner: 'organization-identity-read-contracts',
    businessMaximum: {
      maxItems: 100,
      source: 'departmentIds .max(100) in project.dto.ts on create and update; ProjectRepo replaces the set',
    },
    rationale: 'The departments one project names (the detail route GET /projects/{id}, added with LD-12).',
    removeWhen: 'Review when the departmentIds limit or the project write path changes.',
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
    classification: 'bounded',
    findings: ['LD-06'],
    owner: 'catalog-application-plan-read-contracts',
    businessMaximum: {
      maxItems: 20,
      source:
        'SIMILAR_APPLICATION_LIMIT in application.policy.ts (similarTo takes that many; similarTotal counts the rest)',
    },
    rationale: 'The first similar approved applications of the functional group.',
    removeWhen: 'Review when SIMILAR_APPLICATION_LIMIT changes.',
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
    key: 'planTermsGet#opinions',
    classification: 'bounded',
    findings: ['LD-06'],
    owner: 'catalog-application-plan-read-contracts',
    businessMaximum: {
      maxItems: 50,
      source:
        'OPINIONS_IN_VIEW in plan-terms.service.ts (the newest; opinionTotal counts all, GET /plans/{id}/term-opinions pages them)',
    },
    rationale: 'The newest opinions on the plan terms.',
    removeWhen: 'Review when OPINIONS_IN_VIEW changes.',
  },
  {
    key: 'planTermsGet#warnings',
    classification: 'bounded',
    findings: ['LD-16'],
    owner: 'catalog-subscription-read-model',
    businessMaximum: {
      maxItems: 50,
      source:
        'WARNINGS_IN_VIEW in plan-terms.service.ts (the earliest; warningTotal counts all, planWarningList pages them)',
    },
    rationale: 'The earliest review alerts of one plan.',
    removeWhen: 'Review when WARNINGS_IN_VIEW changes.',
  },
  ...(
    [
      [
        'confirmations',
        'retirement.confirmations',
        'The newest Business Owner confirmations; confirmationTotal counts all.',
      ],
      [
        'assignments',
        'retirement.blockers.assignments',
        'The first open seats holding the application; assignmentTotal counts all.',
      ],
      [
        'assignmentsByPlan',
        'retirement.blockers.assignmentsByPlan',
        'The plans holding the most seats; the rest are in assignmentTotal.',
      ],
      [
        'subscriptions',
        'retirement.blockers.subscriptions',
        'The first running subscriptions; subscriptionTotal counts all.',
      ],
    ] as const
  ).map(([, path, rationale]): NestedArrayEntry => ({
    key: `applicationRetirementGet#${path}`,
    classification: 'bounded',
    findings: ['LD-06'],
    owner: 'catalog-application-plan-read-contracts',
    businessMaximum: {
      maxItems: 50,
      source: 'RETIREMENT_LIST_LIMIT in application-retirement.policy.ts (blockersOf and confirmations take that many)',
    },
    rationale,
    removeWhen: 'Review when RETIREMENT_LIST_LIMIT changes.',
  })),
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
      'Step 1 lists MISSING_HEAD, MISSING_IT_ADMIN and MISSING_COST_CENTER per active department, and the number of departments has no cap (the same bound as departmentWarningList, LD-15).',
    removeWhen:
      'The warnings of the step get a proved maximum or a paginated form; the contract and the future package are not chosen here (LD-16).',
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
    classification: 'bounded',
    findings: ['LD-14'],
    owner: 'organization-identity-read-contracts',
    businessMaximum: {
      maxItems: 50,
      source:
        'ROLE_HISTORY_LIMIT in account-query.service.ts (take of RoleGrantRepo.grantHistory); roleHistoryHasMore says there are older grants',
    },
    rationale: 'The newest grants of the account, with roleHistoryHasMore.',
    removeWhen: 'Review when ROLE_HISTORY_LIMIT changes.',
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
    rationale: 'The newest holders of one approval role; historyHasMore says there are older ones (LD-14).',
    removeWhen: 'Review when HISTORY_LIMIT changes.',
  },
  {
    key: 'departmentToolsInUse#data.summary',
    classification: 'unbounded',
    findings: ['LD-09'],
    owner: 'licensing-assignment-read-contracts',
    rationale:
      'One line per plan the department holds seats of, counted in SQL by one groupBy of the same snapshot as the page (LD-09 fixed the cost, not the number of plans).',
    removeWhen: 'The summary is capped with a total or paginated.',
  },
  {
    key: 'budgetVersionHistoryList#changes',
    classification: 'bounded',
    findings: ['LD-14'],
    owner: 'g0-g6-final-business-baseline-remediation',
    businessMaximum: {
      maxItems: 16,
      source:
        'HISTORY_CHANGES_MAX in version-history.policy.ts, the maxItems of the schema in budget-history.dto.ts: one entry of the history shows the fields one edit changed, and the widest edit is a line, which has eleven',
    },
    rationale:
      'The fields one edit of a version changed, with their values before and after (F66, spec J.4); the history is paged.',
    removeWhen:
      'Review when a field is added to the figures or to a line of a version, or HISTORY_CHANGES_MAX changes.',
  },
];

/**
 * Prompt 09B (23/10/2026, LD-R2-RV-02): every nested array of the mounted contract with its classification. Frozen: this
 * map is never edited again (P28-07). NESTED_ARRAYS differs from it only through events of REGISTRY_EVENTS_SINCE_INITIAL;
 * a new key or a looser classification needs a new Owner decision.
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

/**
 * One documented difference between a frozen initial registry and its live registry (P28-07). `exceptions` keys are
 * `operationId#classification` (a new classification is one `closed` and one `added` event); `nested` keys are
 * NestedArrayEntry keys with `from`/`to` classifications.
 */
interface RegistryEvent {
  registry: 'exceptions' | 'nested';
  key: string;
  change: 'closed' | 'reclassified' | 'added';
  /** Nested only: the classification INITIAL_NESTED_ARRAYS holds (closed, reclassified). */
  from?: NestedClassification;
  /** Nested only: the classification NESTED_ARRAYS holds now (added, reclassified). */
  to?: NestedClassification;
  /** Nested, `to: 'bounded'` only: the constant or validation that proves the maximum; the live source must name it. */
  bound?: string;
  /** The review finding the event closes or serves (`LD-<n>`). */
  finding: string;
  /** Folder under docs/workspace/items whose work made the change. */
  item: string;
  date: `${number}-${number}-${number}`;
  reason: string;
  /**
   * The Owner decision that allows the event. Required to close or reclassify an `owner-decision` key (LD-13 is open), to
   * add an exception, and to add or reclassify a nested key to anything but a proved `bounded`.
   */
  ownerDecision?: string;
}

const closedException = (
  key: string,
  finding: string,
  item: string,
  reason: string,
  date: RegistryEvent['date'] = '2026-10-23',
): RegistryEvent => ({ registry: 'exceptions', key, change: 'closed', finding, item, date, reason });

/** The entry of an operation the compatibility release removed (spec L.6): the live registry loses it, the frozen one keeps it. */
const removedOperation = (
  registry: RegistryEvent['registry'],
  key: string,
  finding: string,
  reason: string,
  from?: NestedClassification,
): RegistryEvent => ({
  registry,
  key,
  change: 'closed',
  ...(from === undefined ? {} : { from }),
  finding,
  item: 'g0-g6-final-business-baseline-remediation',
  date: '2026-10-28',
  reason,
});

const boundedNested = (
  key: string,
  bound: string,
  finding: string,
  item: string,
  reason: string,
  change: 'reclassified' | 'added' = 'reclassified',
): RegistryEvent => ({
  registry: 'nested',
  key,
  change,
  ...(change === 'reclassified' ? { from: 'unbounded' as const } : {}),
  to: 'bounded',
  bound,
  finding,
  item,
  date: '2026-10-23',
  reason,
});

/**
 * Every difference between INITIAL_EXCEPTION_KEYS / INITIAL_NESTED_ARRAYS and COLLECTION_EXCEPTIONS / NESTED_ARRAYS,
 * one event each (P28-07). The gate fails on a difference without an event (a silent rewrite) and on an event without
 * its difference. Prompt 10 (23/10/2026, commit 4cc9a47) closed these with the remediation items of the G0-G4 review.
 */
const REGISTRY_EVENTS_SINCE_INITIAL: readonly RegistryEvent[] = [
  removedOperation('exceptions', 'standardToolsetList#detail-reuse', 'F04', 'standardToolsetList is removed (QĐ-87h).'),
  removedOperation(
    'exceptions',
    'standardToolsetHistory#detail-reuse',
    'F04',
    'standardToolsetHistory is removed (QĐ-87h).',
  ),
  removedOperation('nested', 'standardToolsetList#plans', 'F04', 'standardToolsetList is removed (QĐ-87h).', 'bounded'),
  removedOperation(
    'nested',
    'standardToolsetMine#toolset.plans',
    'F04',
    'standardToolsetMine is removed (QĐ-87h).',
    'bounded',
  ),
  removedOperation(
    'nested',
    'standardToolsetGet#toolset.plans',
    'F04',
    'standardToolsetGet is removed (QĐ-87h).',
    'bounded',
  ),
  removedOperation(
    'nested',
    'standardToolsetHistory#plans',
    'F04',
    'standardToolsetHistory is removed (QĐ-87h).',
    'bounded',
  ),
  removedOperation(
    'nested',
    'subscriptionCostAllocationGet#allocation.lines',
    'F05',
    'subscriptionCostAllocationGet is removed (QĐ-87g).',
    'bounded',
  ),
  removedOperation(
    'nested',
    'subscriptionCostAllocationHistory#lines',
    'F05',
    'subscriptionCostAllocationHistory is removed (QĐ-87g).',
    'bounded',
  ),
  removedOperation(
    'nested',
    'onboardingChecklistGet#suggestions',
    'F04',
    'The onboarding checklist no longer has suggestions: the standard toolset was the only one (QĐ-87h).',
    'bounded',
  ),
  closedException(
    'provisioningTaskList#detail-reuse',
    'LD-08',
    'licensing-provisioning-task-read-contracts',
    'The queue item is a task summary; provisioningTaskGet extends it with the long fields.',
  ),
  closedException(
    'applicationList#detail-projection',
    'LD-04',
    'catalog-application-plan-read-contracts',
    'The application summary selects its columns and no longer carries domains, communication or the dictionary link.',
  ),
  closedException(
    'planList#detail-projection',
    'LD-05',
    'catalog-application-plan-read-contracts',
    'The plan summary no longer carries the revocation note.',
  ),
  closedException(
    'projectList#unbounded',
    'LD-12',
    'organization-identity-read-contracts',
    'GET /projects is paginated (pageSize maximum 100) without the description; GET /projects/{id} returns it.',
  ),
  closedException(
    'applicationBusinessOwnerHistory#unbounded',
    'LD-06',
    'catalog-application-plan-read-contracts',
    'The Business Owner history is paginated.',
  ),
  closedException(
    'departmentWarningList#unbounded',
    'LD-15',
    'organization-identity-read-contracts',
    'The department warnings are paginated.',
  ),
  closedException(
    'nonWorkingDateList#unbounded',
    'LD-15',
    'g2-fiscal-year-operating-parameters',
    'The non-working dates are paginated.',
  ),
  closedException(
    'subscriptionList#query',
    'LD-01',
    'catalog-subscription-read-model',
    'Tax estimates are read in batches (readCurrentMany, estimateMany) with a narrow select, proven by a query-count test.',
  ),
  closedException(
    'planWarningList#query',
    'LD-02',
    'catalog-subscription-read-model',
    'Paging moved into SQL (listTermsWithMilestoneBetween), proven by a query-count test.',
  ),
  closedException(
    'subscriptionCostAllocationHistory#query',
    'LD-03',
    'catalog-subscription-read-model',
    'Cost Centers are read once per page, proven by a query-count test.',
  ),
  closedException(
    'standardToolsetList#query',
    'LD-07',
    'catalog-standard-toolset-read-batching',
    'Versions, plans, departments and job titles are read in batches with a stable order, proven by a query-count test.',
  ),
  closedException(
    'standardToolsetHistory#query',
    'LD-07',
    'catalog-standard-toolset-read-batching',
    'Plans are read once per page, proven by a query-count test.',
  ),
  closedException(
    'provisioningTaskList#query',
    'LD-08',
    'licensing-provisioning-task-read-contracts',
    'Plans are read in one batch per page (findPlanSeatTargets), proven by a query-count test.',
  ),
  closedException(
    'departmentToolsInUse#query',
    'LD-09',
    'licensing-assignment-read-contracts',
    'Paging and the summary moved into SQL in one snapshot, proven by a query-count test.',
  ),
  closedException(
    'licenseAssignmentList#query',
    'LD-10',
    'licensing-assignment-read-contracts',
    'A direct select of the summary with employee, plan and Cost Center read in batches, proven by a query-count test; which person fields stay is still LD-13 point 5 (licenseAssignmentList#owner-decision).',
  ),
  closedException(
    'licenseKeyList#query',
    'LD-11',
    'licensing-assignment-read-contracts',
    'Count and page share one RepeatableRead transaction.',
  ),
  closedException(
    'departmentMemberList#query',
    'LD-11',
    'organization-identity-read-contracts',
    'Count and page share one RepeatableRead transaction.',
  ),
  closedException(
    'costCenterEmployeeList#query',
    'LD-11',
    'organization-identity-read-contracts',
    'Count and page share one RepeatableRead transaction.',
  ),
  {
    registry: 'nested',
    key: 'provisioningTaskList#steps',
    change: 'closed',
    from: 'bounded',
    finding: 'LD-08',
    item: 'licensing-provisioning-task-read-contracts',
    date: '2026-10-23',
    reason: 'The task summary no longer carries the steps; provisioningTaskGet#task.steps keeps them.',
  },
  {
    registry: 'nested',
    key: 'applicationList#domains',
    change: 'closed',
    from: 'bounded',
    finding: 'LD-04',
    item: 'catalog-application-plan-read-contracts',
    date: '2026-10-23',
    reason: 'The application summary no longer carries the domains; applicationGet#domains keeps them.',
  },
  boundedNested(
    'projectGet#departments',
    'departmentIds .max(100)',
    'LD-12',
    'organization-identity-read-contracts',
    'The new detail route GET /projects/{id} that the item spec names returns the departments of one project.',
    'added',
  ),
  boundedNested(
    'applicationRetirementGet#retirement.blockers.assignmentsByPlan',
    'RETIREMENT_LIST_LIMIT',
    'LD-06',
    'catalog-application-plan-read-contracts',
    'Added with the capped retirement blockers: the plans holding the most seats, since the seats themselves are cut.',
    'added',
  ),
  boundedNested(
    'departmentGet#projects',
    'PROFILE_PROJECT_LIMIT',
    'LD-12',
    'organization-identity-read-contracts',
    'The profile embeds the first projects with projectTotal; the rest are read from the paginated project list.',
  ),
  boundedNested(
    'applicationGet#similarApplications',
    'SIMILAR_APPLICATION_LIMIT',
    'LD-06',
    'catalog-application-plan-read-contracts',
    'The detail embeds the first similar applications with similarTotal.',
  ),
  boundedNested(
    'planTermsGet#opinions',
    'OPINIONS_IN_VIEW',
    'LD-06',
    'catalog-application-plan-read-contracts',
    'The terms embed the newest opinions with opinionTotal; GET /plans/{id}/term-opinions pages them all.',
  ),
  boundedNested(
    'planTermsGet#warnings',
    'WARNINGS_IN_VIEW',
    'LD-16',
    'catalog-subscription-read-model',
    'The terms embed the earliest review alerts with warningTotal; planWarningList pages them all.',
  ),
  ...['retirement.confirmations', 'retirement.blockers.assignments', 'retirement.blockers.subscriptions'].map((path) =>
    boundedNested(
      `applicationRetirementGet#${path}`,
      'RETIREMENT_LIST_LIMIT',
      'LD-06',
      'catalog-application-plan-read-contracts',
      'The retirement view takes at most RETIREMENT_LIST_LIMIT of them, with a total.',
    ),
  ),
  boundedNested(
    'appUserGet#roleHistory',
    'ROLE_HISTORY_LIMIT',
    'LD-14',
    'organization-identity-read-contracts',
    'The account embeds the newest grants with roleHistoryHasMore.',
  ),
  boundedNested(
    'budgetVersionHistoryList#changes',
    'HISTORY_CHANGES_MAX',
    'LD-14',
    'g0-g6-final-business-baseline-remediation',
    'The new history route of a version (F66, spec J.4): each entry shows the fields one edit changed, at most HISTORY_CHANGES_MAX.',
    'added',
  ),
];

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
/**
 * A finding of the baseline remediation (`g0-g6-final-business-baseline-remediation`, F55, P03-D14 = A): the only thing it may
 * serve in this ledger is the removal of the entries of an operation that was removed, a `closed` event.
 */
const REMOVED_OPERATION_FINDING = /^F\d+$/;
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

const exceptionKey = (exception: CollectionException) => `${exception.operationId}#${exception.classification}`;

/** INITIAL_EXCEPTION_KEYS and INITIAL_NESTED_ARRAYS with every ledger event applied: what the live registries hold. */
function registriesAfter(events: readonly RegistryEvent[]) {
  const exceptionKeys = new Set(INITIAL_EXCEPTION_KEYS);
  const nested = new Map<string, NestedClassification>(Object.entries(INITIAL_NESTED_ARRAYS));
  for (const event of events)
    if (event.registry === 'exceptions') {
      if (event.change === 'closed') exceptionKeys.delete(event.key);
      if (event.change === 'added') exceptionKeys.add(event.key);
    } else if (event.change === 'closed') nested.delete(event.key);
    else if (event.to !== undefined) nested.set(event.key, event.to);

  return { exceptionKeys, nested };
}

/**
 * The entries outside INITIAL_NESTED_ARRAYS with the ledger applied: a new key, or a key whose classification changed,
 * without its event; each needs the Owner.
 */
function nestedEntriesOutsideInitialSet(
  entries: readonly NestedArrayEntry[],
  events: readonly RegistryEvent[] = REGISTRY_EVENTS_SINCE_INITIAL,
): string[] {
  const { nested } = registriesAfter(events);
  return entries
    .filter((entry) => nested.get(entry.key) !== entry.classification)
    .map((entry) => `${entry.key} (${entry.classification})`);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The frozen initial registries against the live ones (P28-07): every difference has exactly one ledger event, and every
 * event matches a real difference (its key and classifications before and after). A difference without an event is a
 * silent rewrite; an event without its difference is a stale or invented record.
 */
function ledgerProblems(
  live: { exceptions: readonly CollectionException[]; nestedArrays: readonly NestedArrayEntry[] },
  events: readonly RegistryEvent[],
  ownerExists: (owner: string) => boolean,
): string[] {
  const problems: string[] = [];
  const liveKeys = new Set(live.exceptions.map(exceptionKey));
  const liveNested = new Map(live.nestedArrays.map((entry) => [entry.key, entry]));
  const evented = new Set<string>();

  for (const event of events) {
    const label = `ledger ${event.registry} ${event.change} ${event.key}`;
    if (evented.has(`${event.registry} ${event.key}`)) problems.push(`${label}: a second event for the key`);
    evented.add(`${event.registry} ${event.key}`);
    problems.push(...eventHygiene(event, label, ownerExists));
    problems.push(
      ...(event.registry === 'exceptions'
        ? exceptionEventProblems(event, label, liveKeys)
        : nestedEventProblems(event, label, liveNested)),
    );
  }

  for (const key of INITIAL_EXCEPTION_KEYS)
    if (!evented.has(`exceptions ${key}`) && !liveKeys.has(key))
      problems.push(
        `${key}: in INITIAL_EXCEPTION_KEYS but not in COLLECTION_EXCEPTIONS, and no ledger event closes it (silent removal)`,
      );
  for (const key of liveKeys)
    if (!evented.has(`exceptions ${key}`) && !INITIAL_EXCEPTION_KEYS.includes(key))
      problems.push(
        `${key}: in COLLECTION_EXCEPTIONS but not in INITIAL_EXCEPTION_KEYS, and no ledger event adds it (silent rewrite)`,
      );
  for (const [key, before] of Object.entries(INITIAL_NESTED_ARRAYS)) {
    const after = liveNested.get(key)?.classification;
    if (evented.has(`nested ${key}`)) continue;
    if (after === undefined)
      problems.push(
        `${key}: in INITIAL_NESTED_ARRAYS but not in NESTED_ARRAYS, and no ledger event closes it (silent removal)`,
      );
    else if (after !== before)
      problems.push(
        `${key}: ${before} in INITIAL_NESTED_ARRAYS but ${after} in NESTED_ARRAYS, and no ledger event reclassifies it (silent rewrite)`,
      );
  }
  for (const [key, entry] of liveNested)
    if (!evented.has(`nested ${key}`) && !Object.hasOwn(INITIAL_NESTED_ARRAYS, key))
      problems.push(
        `${key} (${entry.classification}): in NESTED_ARRAYS but not in INITIAL_NESTED_ARRAYS, and no ledger event adds it (silent rewrite)`,
      );

  return problems;
}

function eventHygiene(event: RegistryEvent, label: string, ownerExists: (owner: string) => boolean): string[] {
  const problems: string[] = [];
  const removal = event.change === 'closed' && REMOVED_OPERATION_FINDING.test(event.finding);
  if (!FINDING.test(event.finding) && !removal)
    problems.push(`${label}: finding '${event.finding}' is not one exact LD-<n>`);
  if (!WORK_ITEM_FOLDER.test(event.item) || !ownerExists(event.item))
    problems.push(`${label}: item '${event.item}' is not a work item under docs/workspace/items`);
  if (!ISO_DATE.test(event.date) || Number.isNaN(Date.parse(event.date)))
    problems.push(`${label}: date '${event.date}' is not a YYYY-MM-DD day`);
  if (event.reason.trim() === '') problems.push(`${label}: needs a reason`);

  return problems;
}

const OWNER_DECISION_OPEN = 'an owner-decision entry closes or changes only with the Owner decision that settles it';

function exceptionEventProblems(event: RegistryEvent, label: string, liveKeys: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const initial = INITIAL_EXCEPTION_KEYS.includes(event.key);
  const live = liveKeys.has(event.key);
  const decided = (event.ownerDecision ?? '').trim() !== '';
  if (
    event.change === 'reclassified' ||
    event.from !== undefined ||
    event.to !== undefined ||
    event.bound !== undefined
  )
    problems.push(
      `${label}: an exception key carries its classification; record one closed and one added event, without from, to or bound`,
    );
  if (event.change === 'closed') {
    if (!initial) problems.push(`${label}: INITIAL_EXCEPTION_KEYS has no such key, so there is nothing to close`);
    if (live) problems.push(`${label}: the key is still in COLLECTION_EXCEPTIONS, so nothing was closed`);
    if (event.key.endsWith('#owner-decision') && !decided) problems.push(`${label}: ${OWNER_DECISION_OPEN} (LD-13)`);
  }
  if (event.change === 'added') {
    if (initial) problems.push(`${label}: the key is already in INITIAL_EXCEPTION_KEYS, so nothing was added`);
    if (!live) problems.push(`${label}: COLLECTION_EXCEPTIONS has no such key, so nothing was added`);
    if (!decided) problems.push(`${label}: adding an exception needs the Owner decision that allows it`);
  }

  return problems;
}

function nestedEventProblems(
  event: RegistryEvent,
  label: string,
  liveNested: ReadonlyMap<string, NestedArrayEntry>,
): string[] {
  const problems: string[] = [];
  const before = Object.hasOwn(INITIAL_NESTED_ARRAYS, event.key) ? INITIAL_NESTED_ARRAYS[event.key] : undefined;
  const after = liveNested.get(event.key);
  const decided = (event.ownerDecision ?? '').trim() !== '';
  const fromMatches = () => {
    if (before === undefined) problems.push(`${label}: INITIAL_NESTED_ARRAYS has no such key`);
    else if (event.from !== before)
      problems.push(`${label}: from '${event.from ?? 'none'}' but INITIAL_NESTED_ARRAYS holds '${before}'`);
  };
  const toMatches = () => {
    if (after === undefined) problems.push(`${label}: NESTED_ARRAYS has no such key`);
    else if (event.to !== after.classification)
      problems.push(`${label}: to '${event.to ?? 'none'}' but NESTED_ARRAYS holds '${after.classification}'`);
  };

  if (event.change === 'closed') {
    fromMatches();
    if (after !== undefined) problems.push(`${label}: the key is still in NESTED_ARRAYS, so nothing was closed`);
    if (event.to !== undefined) problems.push(`${label}: a closed event has no to`);
  }
  if (event.change === 'added') {
    if (before !== undefined)
      problems.push(`${label}: the key is already in INITIAL_NESTED_ARRAYS, so nothing was added`);
    if (event.from !== undefined) problems.push(`${label}: an added event has no from`);
    toMatches();
  }
  if (event.change === 'reclassified') {
    fromMatches();
    toMatches();
    if (event.from === event.to) problems.push(`${label}: from and to are the same, so nothing was reclassified`);
  }
  if (before === 'owner-decision' && !decided) problems.push(`${label}: ${OWNER_DECISION_OPEN} (LD-13)`);
  if (event.change !== 'closed' && event.to === 'bounded') {
    if (!event.bound?.trim())
      problems.push(`${label}: a bounded event names the constant or validation that proves the maximum (bound)`);
    else if (after !== undefined && !(after.businessMaximum?.source ?? '').includes(event.bound))
      problems.push(`${label}: the NESTED_ARRAYS source of the key does not name its bound '${event.bound}'`);
  }
  if (event.change !== 'closed' && event.to !== 'bounded' && !decided)
    problems.push(`${label}: a nested key becomes ${event.to ?? 'none'} only with the Owner decision that allows it`);

  return problems;
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

/**
 * The exception keys a registry holds outside INITIAL_EXCEPTION_KEYS with the ledger applied; each one needs a new Owner
 * decision.
 */
function keysOutsideInitialSet(
  exceptions: readonly CollectionException[],
  events: readonly RegistryEvent[] = REGISTRY_EVENTS_SINCE_INITIAL,
): string[] {
  const { exceptionKeys } = registriesAfter(events);
  return exceptions.map(exceptionKey).filter((key) => !exceptionKeys.has(key));
}

const liveRegistries = { exceptions: COLLECTION_EXCEPTIONS, nestedArrays: NESTED_ARRAYS };

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

/** The arrays review LD-R2-RV-02 named; the recursive inventory must find every one the ledger has not closed. */
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

  it('only ever shrinks the exception registry recorded on 22/10/2026, except through a documented ledger event', () => {
    expect(keysOutsideInitialSet(COLLECTION_EXCEPTIONS)).toEqual([]);
  });

  it('differs from the frozen initial registries exactly by the ledger events (no silent rewrite, no idle event)', () => {
    expect(ledgerProblems(liveRegistries, REGISTRY_EVENTS_SINCE_INITIAL, realRegistries.ownerExists)).toEqual([]);
  });

  it('keeps the frozen initial registries of Prompt 09/09B unedited (P28-07)', () => {
    const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

    // The values of 19be620. A changed fingerprint is a rewrite of the baseline: record a ledger event instead.
    expect(INITIAL_EXCEPTION_KEYS).toHaveLength(34);
    expect(fingerprint(INITIAL_EXCEPTION_KEYS)).toBe(
      '2dcd604ad3b1b3f0ca153d2dd634543321c39eff1ffa4c580bacd662f699de43',
    );
    expect(Object.keys(INITIAL_NESTED_ARRAYS)).toHaveLength(67);
    expect(fingerprint(Object.entries(INITIAL_NESTED_ARRAYS))).toBe(
      'e811c8edaad29ef97db5fa202924721fd12ea3a7ddb96abbe82ac2e1a4a542fb',
    );
  });

  it('has no LD-15 exception left: the department warnings and the non-working dates are pages (LD-15)', () => {
    const keys = COLLECTION_EXCEPTIONS.map(exceptionKey);

    expect(COLLECTION_EXCEPTIONS.filter((exception) => exception.findings.includes('LD-15'))).toEqual([]);
    for (const operationId of ['departmentWarningList', 'nonWorkingDateList']) {
      expect(keys.filter((key) => key.startsWith(`${operationId}#`))).toEqual([]);
    }
    expect(
      REGISTRY_EVENTS_SINCE_INITIAL.filter((event) => event.finding === 'LD-15').map((event) => event.key),
    ).toEqual(['departmentWarningList#unbounded', 'nonWorkingDateList#unbounded']);
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
    // LD-13 is open: no ledger event may close or change one of its entries.
    expect(
      REGISTRY_EVENTS_SINCE_INITIAL.filter(
        (event) =>
          event.finding === 'LD-13' || event.key.endsWith('#owner-decision') || event.from === 'owner-decision',
      ),
    ).toEqual([]);
  });

  it('discovers every nested array review LD-R2-RV-02 named, however deep, unless the ledger closed it', () => {
    const inventory = nestedArrayInventory(document, NON_ENVELOPE_COLLECTIONS);
    const closed = REGISTRY_EVENTS_SINCE_INITIAL.filter(
      (event) => event.registry === 'nested' && event.change === 'closed',
    ).map((event) => event.key);

    expect(REVIEW_NAMED_ARRAYS.filter((key) => !inventory.has(key))).toEqual(
      REVIEW_NAMED_ARRAYS.filter((key) => closed.includes(key)),
    );
    expect(REVIEW_NAMED_ARRAYS.filter((key) => closed.includes(key))).toEqual([
      'standardToolsetList#plans',
      'applicationList#domains',
    ]);
  });

  it('only ever shrinks the nested-array inventory recorded on 23/10/2026, classification included, except through the ledger', () => {
    const reclassified = NESTED_ARRAYS.map((entry) =>
      entry.key === 'onboardingChecklistGet#steps.warnings'
        ? { ...entry, classification: 'bounded' as const, businessMaximum: { maxItems: 20, source: 'a guess' } }
        : entry,
    );

    expect(Object.keys(INITIAL_NESTED_ARRAYS)).toEqual(expect.arrayContaining(REVIEW_NAMED_ARRAYS));
    expect(nestedEntriesOutsideInitialSet(NESTED_ARRAYS)).toEqual([]);
    expect(nestedEntriesOutsideInitialSet([...NESTED_ARRAYS, nestedEntry('jobTitleList#aliases')])).toEqual([
      'jobTitleList#aliases (bounded)',
    ]);
    expect(nestedEntriesOutsideInitialSet(reclassified)).toEqual(['onboardingChecklistGet#steps.warnings (bounded)']);
  });

  it('records the nested arrays no earlier finding covers as LD-16, each with an existing owner; the plan one is bounded since 23/10/2026', () => {
    const subcases = NESTED_ARRAYS.filter((entry) => entry.findings.includes('LD-16'));

    expect(subcases.map((entry) => `${entry.key} -> ${entry.owner}`).sort()).toEqual([
      'onboardingChecklistGet#steps.warnings -> api-list-detail-contract-remediation',
      'planTermsGet#warnings -> catalog-subscription-read-model',
    ]);
    expect(subcases.map((entry) => `${entry.key} ${entry.classification}`).sort()).toEqual([
      'onboardingChecklistGet#steps.warnings unbounded',
      'planTermsGet#warnings bounded',
    ]);
  });

  describe('registry ledger (P28-07: the frozen registries change only through documented events)', () => {
    const check = (
      live: Partial<typeof liveRegistries> = {},
      events: readonly RegistryEvent[] = REGISTRY_EVENTS_SINCE_INITIAL,
    ) => ledgerProblems({ ...liveRegistries, ...live }, events, realRegistries.ownerExists);
    const withoutException = (key: string) =>
      COLLECTION_EXCEPTIONS.filter((exception) => exceptionKey(exception) !== key);
    const eventOf = (key: string): RegistryEvent => {
      const found = REGISTRY_EVENTS_SINCE_INITIAL.find((event) => event.key === key);
      if (!found) throw new Error(`no ledger event for ${key}`);
      return found;
    };
    const replaced = (key: string, overrides: Partial<RegistryEvent>) =>
      REGISTRY_EVENTS_SINCE_INITIAL.map((event) => (event.key === key ? { ...event, ...overrides } : event));

    it('refuses a silent removal of an exception or a nested array', () => {
      expect(
        check({
          exceptions: withoutException('provisioningTaskList#owner-decision'),
          nestedArrays: NESTED_ARRAYS.filter((entry) => entry.key !== 'healthGetReadiness#checks'),
        }),
      ).toEqual([
        'provisioningTaskList#owner-decision: in INITIAL_EXCEPTION_KEYS but not in COLLECTION_EXCEPTIONS, and no ledger event closes it (silent removal)',
        'healthGetReadiness#checks: in INITIAL_NESTED_ARRAYS but not in NESTED_ARRAYS, and no ledger event closes it (silent removal)',
      ]);
    });

    it('refuses a silent addition and a silent reclassification', () => {
      const reclassified = NESTED_ARRAYS.map((entry) =>
        entry.key === 'onboardingChecklistGet#steps.warnings'
          ? { ...entry, classification: 'bounded' as const, businessMaximum: { maxItems: 20, source: 'a guess' } }
          : entry,
      );

      expect(
        check({
          exceptions: [...COLLECTION_EXCEPTIONS, entry({ operationId: 'thingList', classification: 'unbounded' })],
          nestedArrays: [...reclassified, nestedEntry('jobTitleList#aliases')],
        }),
      ).toEqual([
        'thingList#unbounded: in COLLECTION_EXCEPTIONS but not in INITIAL_EXCEPTION_KEYS, and no ledger event adds it (silent rewrite)',
        'onboardingChecklistGet#steps.warnings: unbounded in INITIAL_NESTED_ARRAYS but bounded in NESTED_ARRAYS, and no ledger event reclassifies it (silent rewrite)',
        'jobTitleList#aliases (bounded): in NESTED_ARRAYS but not in INITIAL_NESTED_ARRAYS, and no ledger event adds it (silent rewrite)',
      ]);
    });

    it('refuses an event that matches no real difference', () => {
      const idle: RegistryEvent[] = [
        { ...eventOf('licenseKeyList#query'), key: 'currencyList#bounded' },
        { ...eventOf('licenseKeyList#query'), key: 'thingList#query' },
        { ...eventOf('provisioningTaskList#steps'), key: 'healthGetReadiness#checks' },
        { ...eventOf('projectGet#departments'), key: 'auditEventList#actorRoles', bound: 'resolveEffectiveRoles' },
      ];

      expect(check({}, [...REGISTRY_EVENTS_SINCE_INITIAL, ...idle])).toEqual([
        'ledger exceptions closed currencyList#bounded: the key is still in COLLECTION_EXCEPTIONS, so nothing was closed',
        'ledger exceptions closed thingList#query: INITIAL_EXCEPTION_KEYS has no such key, so there is nothing to close',
        'ledger nested closed healthGetReadiness#checks: the key is still in NESTED_ARRAYS, so nothing was closed',
        'ledger nested added auditEventList#actorRoles: the key is already in INITIAL_NESTED_ARRAYS, so nothing was added',
      ]);
      expect(check({}, replaced('departmentGet#projects', { from: 'owner-decision' }))).toEqual([
        "ledger nested reclassified departmentGet#projects: from 'owner-decision' but INITIAL_NESTED_ARRAYS holds 'unbounded'",
      ]);
      expect(check({}, replaced('planTermsGet#opinions', { to: 'unbounded' }))).toEqual([
        "ledger nested reclassified planTermsGet#opinions: to 'unbounded' but NESTED_ARRAYS holds 'bounded'",
        'ledger nested reclassified planTermsGet#opinions: from and to are the same, so nothing was reclassified',
        'ledger nested reclassified planTermsGet#opinions: a nested key becomes unbounded only with the Owner decision that allows it',
      ]);
    });

    it('refuses closing an LD-13 owner-decision entry without the Owner decision that settles it', () => {
      const key = 'provisioningTaskList#owner-decision';
      const closing: RegistryEvent = { ...eventOf('licenseKeyList#query'), key, finding: 'LD-13' };
      const live = { exceptions: withoutException(key) };

      expect(check(live, [...REGISTRY_EVENTS_SINCE_INITIAL, closing])).toEqual([
        `ledger exceptions closed ${key}: ${OWNER_DECISION_OPEN} (LD-13)`,
      ]);
      expect(check(live, [...REGISTRY_EVENTS_SINCE_INITIAL, { ...closing, ownerDecision: 'QĐ-xx point 5' }])).toEqual(
        [],
      );
    });

    it('refuses a bounded event whose live source does not name its bound, and an exception added without the Owner', () => {
      const added: RegistryEvent = { ...eventOf('licenseKeyList#query'), key: 'thingList#unbounded', change: 'added' };
      const live = {
        exceptions: [...COLLECTION_EXCEPTIONS, entry({ operationId: 'thingList', classification: 'unbounded' })],
      };

      expect(check({}, replaced('departmentGet#projects', { bound: 'A_GUESS' }))).toEqual([
        "ledger nested reclassified departmentGet#projects: the NESTED_ARRAYS source of the key does not name its bound 'A_GUESS'",
      ]);
      expect(check({}, replaced('departmentGet#projects', { bound: undefined }))).toEqual([
        'ledger nested reclassified departmentGet#projects: a bounded event names the constant or validation that proves the maximum (bound)',
      ]);
      expect(check(live, [...REGISTRY_EVENTS_SINCE_INITIAL, added])).toEqual([
        'ledger exceptions added thingList#unbounded: adding an exception needs the Owner decision that allows it',
      ]);
    });

    it('refuses a malformed event and a second event for one key', () => {
      const event = eventOf('licenseKeyList#query');
      const malformed = {
        ...event,
        finding: 'LD-x',
        item: 'nobody',
        date: 'yesterday' as string as RegistryEvent['date'],
        reason: ' ',
      };

      expect(check({}, replaced('licenseKeyList#query', malformed))).toEqual([
        "ledger exceptions closed licenseKeyList#query: finding 'LD-x' is not one exact LD-<n>",
        "ledger exceptions closed licenseKeyList#query: item 'nobody' is not a work item under docs/workspace/items",
        "ledger exceptions closed licenseKeyList#query: date 'yesterday' is not a YYYY-MM-DD day",
        'ledger exceptions closed licenseKeyList#query: needs a reason',
      ]);
      expect(check({}, [...REGISTRY_EVENTS_SINCE_INITIAL, event])).toEqual([
        'ledger exceptions closed licenseKeyList#query: a second event for the key',
      ]);
    });
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
