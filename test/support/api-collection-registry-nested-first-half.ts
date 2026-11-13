import { ROLE_GRANTS, type NestedArrayEntry } from './api-collection-registry';
import { NESTED_ARRAYS_G9 } from './api-collection-registry-nested-g9';
import { NESTED_ARRAYS_K1CL } from './api-collection-registry-nested-k1cl';
import { NESTED_ARRAYS_W2 } from './api-collection-registry-nested-w2';
import { NESTED_ARRAYS_W3 } from './api-collection-registry-nested-w3';
import { NESTED_ARRAYS_W6 } from './api-collection-registry-nested-w6';

/**
 * Every array below `data` other than a collection's own array (Prompt 09B, LD-R2-RV-02), in the order of the recursive
 * inventory. A bounded entry names the exact source that enforces its number; its review condition is met by the first
 * change of that source.
 */
export const NESTED_ARRAYS_FIRST_HALF: readonly NestedArrayEntry[] = [
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
      source: `authorizingRoles in effective-roles.policy.ts: a subset of the direct roles (${ROLE_GRANTS}); AuditRepo.insert is the only writer and every caller passes actor.roles or none`,
    },
    rationale: 'The roles the actor held when the event was written.',
    removeWhen: 'Review when AppRole, authorizingRoles or an audit writer changes.',
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
    key: 'operatingParameterList#constraints.options',
    classification: 'bounded',
    findings: ['LD-17'],
    owner: 'qd93-parameter-labels-dashboard-queues',
    businessMaximum: {
      maxItems: 10,
      source: 'ENUM_OPTIONS_MAX in parameter-definitions.policy.ts, checked by its unit spec',
    },
    rationale:
      'The choices of an enum parameter (two for each rule schedule); the constraints of the other shapes hold no array.',
    removeWhen: 'Review when ENUM_OPTIONS_MAX changes or a parameter of the enum shape is added.',
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
      source:
        'reviewQueueOf in preview/employee-import-review-queue.service.ts keeps queue.slice(0, 200) with the total (US-02-02 AC-4)',
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
  // The arrays of the answers of the wave W2 (their own file: this one is at the line limit of the support files).
  ...NESTED_ARRAYS_W2,
  ...NESTED_ARRAYS_W3,
  ...NESTED_ARRAYS_G9,
  ...NESTED_ARRAYS_W6,
  ...NESTED_ARRAYS_K1CL,
];
