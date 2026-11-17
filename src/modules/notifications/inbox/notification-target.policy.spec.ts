import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IN_APP_NOTIFICATION_CODES } from '../public/notifications.types';
import { PARAM_KEYS_BY_CODE } from './inbox.policy';
import {
  TARGET_BY_CODE,
  TARGET_BY_SUBJECT_TYPE,
  canonicalSubjectType,
  isUpperSnakeSubjectType,
  notificationTarget,
  type RouteRef,
} from './notification-target.policy';

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

/** `subject.type` of the catalogue that have no route to read one record: a notice of them has no `target` of its own by type. */
const TYPES_WITHOUT_DETAIL_ROUTE = [
  'APPLICATION',
  'BUDGET_ADJUSTMENT',
  'COST_CENTER',
  'DEPARTMENT_SOFTWARE_PROPOSAL',
  'DEVICE_STOP_REQUEST',
  'HANDOVER_DUTY',
  'LICENSE_ASSIGNMENT',
  'OUT_OF_PROCESS_CASE',
  'TRANSFER_REVIEW',
] as const;

/** Every `subject.type` the catalogue of notifications names (canonical form). */
const CATALOGUE_SUBJECT_TYPES = [
  'ACCESS_REQUEST',
  'APPLICATION',
  'BUDGET_ADJUSTMENT',
  'BUDGET_CYCLE',
  'BUDGET_PROPOSAL',
  'BUDGET_REVIEW_PERIOD',
  'BUDGET_VERSION',
  'COST_CENTER',
  'DEPARTMENT',
  'DEPARTMENT_SOFTWARE_PROPOSAL',
  'DEPARTMENT_TRANSFER',
  'DEVICE_STOP_REQUEST',
  'EMPLOYEE',
  'EMPLOYEE_LEAVE',
  'GHOST_SEAT_RECOMMENDATION',
  'HANDOVER_DUTY',
  'LICENSE_ASSIGNMENT',
  'OFFBOARDING_CASE',
  'OUT_OF_PROCESS_CASE',
  'PERSONNEL_NOTICE',
  'PLAN',
  'POLICY_VERSION',
  'PROVISIONING_TASK',
  'PURCHASE_INVOICE',
  'RETURN_REQUEST',
  'SAAS_ISSUE',
  'SPEND_BATCH',
  'SUBSCRIPTION',
  'SUBSCRIPTION_RENEWAL',
  'TRANSFER_REVIEW',
] as const;

describe('canonicalSubjectType', () => {
  it.each([
    ['LicenseAssignment', 'LICENSE_ASSIGNMENT'],
    ['ProvisioningTask', 'PROVISIONING_TASK'],
    ['HandoverDuty', 'HANDOVER_DUTY'],
    ['Employee', 'EMPLOYEE'],
  ])('turns the old spelling %s into %s', (old, canonical) => {
    expect(canonicalSubjectType(old)).toBe(canonical);
  });

  it('keeps every other value as it is', () => {
    expect(canonicalSubjectType('ACCESS_REQUEST')).toBe('ACCESS_REQUEST');
    expect(canonicalSubjectType('SomethingElse')).toBe('SomethingElse');
    expect(canonicalSubjectType('')).toBe('');
    expect(canonicalSubjectType('constructor')).toBe('constructor');
  });
});

describe('isUpperSnakeSubjectType', () => {
  it('accepts UPPER_SNAKE and refuses the rest', () => {
    expect(isUpperSnakeSubjectType('ACCESS_REQUEST')).toBe(true);
    expect(isUpperSnakeSubjectType('PLAN')).toBe(true);
    expect(isUpperSnakeSubjectType('LicenseAssignment')).toBe(false);
    expect(isUpperSnakeSubjectType('access_request')).toBe(false);
    expect(isUpperSnakeSubjectType('_X')).toBe(false);
    expect(isUpperSnakeSubjectType('')).toBe(false);
  });
});

describe('notificationTarget', () => {
  it('opens the request of a notice about a request, by the type of the subject', () => {
    expect(notificationTarget('REQUEST_NEED_APPROVED', { type: 'ACCESS_REQUEST', id: ID }, { requestId: ID })).toEqual({
      operationId: 'accessRequestGet',
      pathParams: { id: ID },
    });
  });

  it('prefers the table of the code: the task of a withdrawal waiting for the IT Admin, not the request', () => {
    expect(
      notificationTarget(
        'WITHDRAWAL_AWAITING_IT_CLOSE',
        { type: 'ACCESS_REQUEST', id: ID },
        { requestId: ID, taskId: OTHER },
      ),
    ).toEqual({ operationId: 'provisioningTaskGet', pathParams: { id: OTHER } });
  });

  it('falls back to the subject when the key the code wants is missing from the params', () => {
    expect(
      notificationTarget('GRANT_TASK_CANCELLED', { type: 'ACCESS_REQUEST', id: ID }, { requestId: ID, taskId: null }),
    ).toEqual({ operationId: 'accessRequestGet', pathParams: { id: ID } });
  });

  it('opens the return request, the case of a departure and the budget version', () => {
    expect(notificationTarget('RETURN_COMPLETED', { type: 'RETURN_REQUEST', id: ID }, {})).toEqual({
      operationId: 'returnRequestGet',
      pathParams: { id: ID },
    });
    expect(
      notificationTarget('DEPARTURE_ACCESS_BLOCKED', { type: 'OFFBOARDING_CASE', id: ID }, { audience: 'IT_ADMIN' }),
    ).toEqual({ operationId: 'offboardingCaseGet', pathParams: { id: ID } });
    expect(notificationTarget('BUDGET_VERSION_DECIDED', { type: 'BUDGET_VERSION', id: ID }, { versionId: ID })).toEqual(
      {
        operationId: 'budgetVersionGet',
        pathParams: { id: ID },
      },
    );
  });

  it('reads a path parameter from the params, with a number written as text', () => {
    expect(notificationTarget('BUDGET_CYCLE_OPENED', { type: 'BUDGET_CYCLE', id: ID }, { year: 2027 })).toEqual({
      operationId: 'budgetCycleGet',
      pathParams: { year: '2027' },
    });
    expect(
      notificationTarget('POLICY_PUBLISHED', { type: 'POLICY_VERSION', id: ID }, { policyCode: 'POL-USAGE' }),
    ).toEqual({
      operationId: 'policyGet',
      pathParams: { code: 'POL-USAGE' },
    });
    expect(notificationTarget('BUDGET_CYCLE_OPENED', { type: 'BUDGET_CYCLE', id: ID }, {})).toBeNull();
  });

  it('chooses by audience where the code says so', () => {
    const subject = { type: 'DEPARTMENT_TRANSFER', id: ID };
    expect(notificationTarget('TRANSFER_GRACE_STARTED', subject, { audience: 'MOVER' })).toEqual({
      operationId: 'meDepartmentTransferGet',
      pathParams: {},
    });
    expect(notificationTarget('TRANSFER_GRACE_STARTED', subject, { audience: 'HEAD' })).toEqual({
      operationId: 'departmentTransferGet',
      pathParams: { id: ID },
    });
    expect(notificationTarget('TRANSFER_GRACE_STARTED', subject, { audience: 'SOMEONE' })).toEqual({
      operationId: 'departmentTransferGet',
      pathParams: { id: ID },
    });
    expect(
      notificationTarget('LICENSE_EXPIRY_REMINDER', { type: 'LICENSE_ASSIGNMENT', id: ID }, { audience: 'EMPLOYEE' }),
    ).toEqual({ operationId: 'meSoftwareRightList', pathParams: {} });
    expect(
      notificationTarget('LICENSE_EXPIRY_REMINDER', { type: 'LicenseAssignment', id: ID }, { audience: 'HEAD' }),
    ).toEqual({ operationId: 'assignmentExpiryReminderList', pathParams: {} });
    expect(notificationTarget('LICENSE_EXPIRY_REMINDER', { type: 'LicenseAssignment', id: ID }, {})).toBeNull();
  });

  it('opens the batch of a notice that a batch of spend requests was sent', () => {
    expect(
      notificationTarget(
        'SPEND_BATCH_SUBMITTED',
        { type: 'SPEND_BATCH', id: ID },
        { batchId: ID, departmentId: OTHER, sentCount: 3 },
      ),
    ).toEqual({ operationId: 'spendBatchGet', pathParams: { id: ID } });
  });

  it('opens the renewal case of a recorded adjustment, and the subscription for the other notices of SBF-20', () => {
    const subject = { type: 'SUBSCRIPTION', id: ID };
    expect(
      notificationTarget('SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED', subject, { renewalId: OTHER, subscriptionId: ID }),
    ).toEqual({ operationId: 'subscriptionRenewalGet', pathParams: { id: OTHER } });
    // A renewal case that is not on the notice falls back to the subscription it is about.
    expect(notificationTarget('SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED', subject, { renewalId: null })).toEqual({
      operationId: 'subscriptionGet',
      pathParams: { id: ID },
    });
    for (const code of [
      'SUBSCRIPTION_RENEWAL_ALERT',
      'SUBSCRIPTION_RENEWAL_RED_ALERT',
      'SUBSCRIPTION_RENEWAL_KEPT',
      'SUBSCRIPTION_AUTO_RENEWAL_INCIDENT',
      'SUBSCRIPTION_EXPIRY_MARKED',
      'SUBSCRIPTION_RENEWAL_DATA_QUALITY',
    ]) {
      expect(notificationTarget(code, subject, { subscriptionId: ID, renewalId: null })).toEqual({
        operationId: 'subscriptionGet',
        pathParams: { id: ID },
      });
    }
  });

  it('opens the issue report of the three notices about one, the lists of the operations notices, and nothing for a case outside the process', () => {
    for (const code of ['SAAS_ISSUE_SUBMITTED', 'SAAS_ISSUE_RESPONSE_OVERDUE', 'SAAS_ISSUE_STATE_CHANGED']) {
      expect(notificationTarget(code, { type: 'SAAS_ISSUE', id: ID }, { issueId: ID })).toEqual({
        operationId: 'saasIssueGet',
        pathParams: { id: ID },
      });
    }
    expect(notificationTarget('VENDOR_ACCOUNT_DISCREPANCY_OPENED', null, { newCount: 2 })).toEqual({
      operationId: 'vendorAccountDiscrepancyList',
      pathParams: {},
    });
    for (const code of ['DEVICE_STOP_REQUESTED', 'DEVICE_STOP_REQUEST_OVERDUE']) {
      expect(notificationTarget(code, { type: 'DEVICE_STOP_REQUEST', id: ID }, { stopRequestId: ID })).toEqual({
        operationId: 'deviceStopRequestList',
        pathParams: {},
      });
    }
    expect(notificationTarget('OUT_OF_PROCESS_CASE_REPORTED', { type: 'OUT_OF_PROCESS_CASE', id: ID }, {})).toBeNull();
  });

  it('gives a screen without a subject when the catalogue names one', () => {
    expect(notificationTarget('STEP_BACKLOG_ALERT', null, { holderEmployeeId: ID })).toEqual({
      operationId: 'stepCongestionList',
      pathParams: {},
    });
  });

  it('opens the employee of a read-only code whose own screen is gone', () => {
    expect(
      notificationTarget('HANDOVER_CONFIRMATION_DUE', { type: 'HandoverDuty', id: ID }, { employeeId: OTHER }),
    ).toEqual({ operationId: 'employeeGet', pathParams: { id: OTHER } });
    expect(
      notificationTarget('TRANSFER_REVIEW_DUE', { type: 'TRANSFER_REVIEW', id: ID }, { employeeId: OTHER }),
    ).toEqual({
      operationId: 'employeeGet',
      pathParams: { id: OTHER },
    });
  });

  it('gives null where the catalogue names no single screen', () => {
    expect(notificationTarget('TRANSFER_RIGHTS_REVOKING', { type: 'DEPARTMENT_TRANSFER', id: ID }, {})).toBeNull();
    expect(notificationTarget('USAGE_TRACKING_NOTICE', { type: 'APPLICATION', id: ID }, {})).toBeNull();
    expect(notificationTarget('IT_ADMIN_HANDOVER_RECEIVED', { type: 'OFFBOARDING_CASE', id: ID }, {})).toBeNull();
  });

  it('gives null for a subject of a type with no route, for no subject and for a code the table does not know', () => {
    expect(notificationTarget('SOME_OLD_CODE', { type: 'LICENSE_ASSIGNMENT', id: ID }, {})).toBeNull();
    expect(notificationTarget('SOME_OLD_CODE', null, {})).toBeNull();
    expect(notificationTarget('constructor', { type: 'constructor', id: ID }, {})).toBeNull();
    expect(notificationTarget('SOME_OLD_CODE', { type: 'ACCESS_REQUEST', id: '' }, {})).toBeNull();
  });
});

/** Every route a table points at, with the name of the code or type it is for. */
function routesOf(): { owner: string; route: RouteRef; keys?: readonly string[] }[] {
  const found: { owner: string; route: RouteRef; keys?: readonly string[] }[] = [];
  for (const [code, entry] of Object.entries(TARGET_BY_CODE)) {
    if (entry === null || entry === undefined) continue;
    const keys = PARAM_KEYS_BY_CODE[code as keyof typeof PARAM_KEYS_BY_CODE];
    if ('by' in entry) {
      for (const route of [...Object.values(entry.cases), ...(entry.otherwise ? [entry.otherwise] : [])]) {
        found.push({ owner: code, route, keys });
      }
    } else {
      found.push({ owner: code, route: entry, keys });
    }
  }
  for (const [type, route] of Object.entries(TARGET_BY_SUBJECT_TYPE)) found.push({ owner: type, route });

  return found;
}

interface OpenApiOperation {
  operationId?: string;
  parameters?: { name: string; in: string }[];
}

function getOperations(): Map<string, string[]> {
  const document = JSON.parse(readFileSync(join(__dirname, '../../../../openapi.json'), 'utf8')) as {
    paths: Record<string, Record<string, OpenApiOperation>>;
  };
  const gets = new Map<string, string[]>();
  const all = new Set<string>();
  for (const [path, methods] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (operation.operationId === undefined) continue;
      all.add(operation.operationId);
      if (method === 'get')
        gets.set(
          operation.operationId,
          [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]),
        );
    }
  }
  expect(all.size).toBeGreaterThan(200);

  return gets;
}

describe('the target tables against openapi.json', () => {
  const gets = getOperations();

  it('points every route at a GET operation of the contract, with exactly its path parameters', () => {
    const wrong = routesOf().flatMap(({ owner, route }) => {
      const pathParams = gets.get(route.operationId);
      if (pathParams === undefined) return [`${owner}: ${route.operationId} is not a GET operation of openapi.json`];
      const given = Object.keys(route.pathParams).sort();
      const wanted = [...pathParams].sort();

      return JSON.stringify(given) === JSON.stringify(wanted)
        ? []
        : [
            `${owner}: ${route.operationId} wants path parameters [${wanted.join(', ')}] but the table gives [${given.join(', ')}]`,
          ];
    });

    expect(wrong).toEqual([]);
    expect(routesOf().length).toBeGreaterThan(40);
  });

  it('reads each path parameter from the subject or from a key the code may carry', () => {
    const wrong = routesOf().flatMap(({ owner, route, keys }) =>
      Object.entries(route.pathParams).flatMap(([name, source]) => {
        if (source === 'subject') return [];
        if (keys === undefined) return [];

        return keys.includes(source) ? [] : [`${owner}: ${name} reads ${source}, which is not a key of the code`];
      }),
    );

    expect(wrong).toEqual([]);
  });

  it('names only codes of the closed table, and an audience only where the code carries one', () => {
    const codes: readonly string[] = IN_APP_NOTIFICATION_CODES;
    const unknown = Object.keys(TARGET_BY_CODE).filter((code) => !codes.includes(code));
    const noAudience = Object.entries(TARGET_BY_CODE)
      .filter(([, entry]) => entry !== null && entry !== undefined && 'by' in entry)
      .map(([code]) => code)
      .filter((code) => !PARAM_KEYS_BY_CODE[code as keyof typeof PARAM_KEYS_BY_CODE].includes('audience'));

    expect(unknown).toEqual([]);
    expect(noAudience).toEqual([]);
  });

  it('covers every subject type of the catalogue: a route, or a listed reason to have none', () => {
    const covered = new Set<string>([...Object.keys(TARGET_BY_SUBJECT_TYPE), ...TYPES_WITHOUT_DETAIL_ROUTE]);

    expect(CATALOGUE_SUBJECT_TYPES.filter((type) => !covered.has(type))).toEqual([]);
    expect(TYPES_WITHOUT_DETAIL_ROUTE.filter((type) => type in TARGET_BY_SUBJECT_TYPE)).toEqual([]);
    expect(Object.keys(TARGET_BY_SUBJECT_TYPE).filter((type) => !isUpperSnakeSubjectType(type))).toEqual([]);
  });
});
