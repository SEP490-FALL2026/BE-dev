import { ROLE_GRANTS, type NestedArrayEntry } from './api-collection-registry';
import { NESTED_ARRAYS_FIRST_HALF } from './api-collection-registry-nested-first-half';

/** The second half of NESTED_ARRAYS, in the order of the recursive inventory. */
const NESTED_ARRAYS_SECOND_HALF: readonly NestedArrayEntry[] = [
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
  {
    key: 'transferReviewGet#unfinishedRequests',
    classification: 'bounded',
    findings: ['LD-14'],
    owner: 'g0-g6-final-business-baseline-remediation',
    businessMaximum: {
      maxItems: 20,
      source:
        'UNFINISHED_REQUESTS_MAX in transfer-review.dto.ts, the maxItems of the schema, and the take of unfinishedRequestsOf in transfer-review-view.service.ts: the open Requests of the person who moved, for the head to read beside the tools (F29)',
    },
    rationale:
      'The open Requests of the person who was transferred, information only (F29); the Request list has the rest.',
    removeWhen: 'Review when UNFINISHED_REQUESTS_MAX changes or the review shows the Requests as a paged subresource.',
  },
];

/**
 * Every array below `data` other than a collection's own array (Prompt 09B, LD-R2-RV-02), in the order of the recursive
 * inventory. A bounded entry names the exact source that enforces its number; its review condition is met by the first
 * change of that source.
 */
export const NESTED_ARRAYS: readonly NestedArrayEntry[] = [...NESTED_ARRAYS_FIRST_HALF, ...NESTED_ARRAYS_SECOND_HALF];
