/**
 * The registries of the collection and detail contract gate (`test/gates/api-collection-contract.gate-spec.ts`, API-LIST-DETAIL.1,
 * LD-R2): the shapes an entry takes, the small registries and the frozen initial ones. The long ones are in the files beside this
 * one: `api-collection-registry-exceptions.ts`, `api-collection-registry-nested*.ts` and `api-collection-registry-events.ts`.
 * Nothing here asserts; the gate reads them and judges.
 */

export type Classification =
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

export interface BusinessMaximum {
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

export interface CollectionException {
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

export type NestedClassification =
  /** A proved `maxItems` for one occurrence of the array, with its exact source. */
  | 'bounded'
  /** No proved maximum: tracked by an exact review finding owned by a remediation package. */
  | 'unbounded'
  /** Whether the array stays, and how it is bounded, waits for an Owner decision (review LD-13). */
  | 'owner-decision';

export interface NestedArrayEntry {
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
export const NON_ENVELOPE_COLLECTIONS: Readonly<Record<string, string>> = {
  vendorSuggestionList: 'candidates',
};

/**
 * Prompt 09 (22/10/2026). Frozen: this list is never edited again (P28-07). A key leaves COLLECTION_EXCEPTIONS, or a new
 * one enters it, only through an event of REGISTRY_EVENTS_SINCE_INITIAL; adding one needs the Owner. Before the freeze,
 * Prompt 09A (23/10/2026, Owner review LD-R2-RV-01): departmentWarningList and nonWorkingDateList corrected from
 * `bounded` to `unbounded` (LD-15) — the only change of a key, authorized by the Owner. Prompt 09B (23/10/2026,
 * LD-R2-RV-02): `vendorTaxProfileHistory#nested-bound` removed; its array is `vendorTaxProfileHistory#lines` in
 * NESTED_ARRAYS, which now holds every nested array.
 */
export const INITIAL_EXCEPTION_KEYS: readonly string[] = [
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

export const ROLE_GRANTS =
  'AppRole has 6 values and the unique index role_grants_one_effective_per_role allows one effective grant per role';

/**
 * Prompt 09B (23/10/2026, LD-R2-RV-02): every nested array of the mounted contract with its classification. Frozen: this
 * map is never edited again (P28-07). NESTED_ARRAYS differs from it only through events of REGISTRY_EVENTS_SINCE_INITIAL;
 * a new key or a looser classification needs a new Owner decision.
 */
export const INITIAL_NESTED_ARRAYS: Readonly<Record<string, NestedClassification>> = {
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
export interface RegistryEvent {
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
