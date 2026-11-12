import { IN_APP_NOTIFICATION_CODES, type InAppNotificationInput } from '../public/notifications.types';
import {
  FIGURE_WORDS,
  FORBIDDEN_PARAM_KEY,
  MAX_EVENT_KEY_LENGTH,
  PARAM_KEYS_BY_CODE,
  isKnownCode,
  refuseInAppNotification,
} from './inbox.policy';

const REQUEST = '11111111-1111-4111-8111-111111111111';

const notice = (overrides: Partial<InAppNotificationInput> = {}): InAppNotificationInput => ({
  organizationId: '22222222-2222-4222-8222-222222222222',
  recipientEmployeeId: '33333333-3333-4333-8333-333333333333',
  code: 'REQUEST_GRANTED',
  subject: { type: 'ACCESS_REQUEST', id: REQUEST },
  params: { requestId: REQUEST, accessGuide: 'LOGIN_WITH_WORK_ACCOUNT', homepageUrl: null },
  eventKey: 'AUD:e1:REQUEST_GRANTED:-',
  ...overrides,
});

describe('the closed table of in-app notices', () => {
  it('accepts a notice of the table with the keys of its code', () => {
    expect(refuseInAppNotification(notice())).toBeNull();
  });

  it('accepts a notice about nothing in particular', () => {
    expect(
      refuseInAppNotification(
        notice({
          code: 'STEP_BACKLOG_ALERT',
          subject: null,
          params: { holderEmployeeId: 'e1', openCount: 41, threshold: 10, oldestAgeWorkingDays: 6 },
        }),
      ),
    ).toBeNull();
  });

  it('refuses a code that is not in the table', () => {
    expect(refuseInAppNotification(notice({ code: 'NOT_A_CODE' as never }))).toEqual({ reason: 'UNKNOWN_CODE' });
    expect(isKnownCode('REQUEST_GRANTED')).toBe(true);
    expect(isKnownCode('request_granted')).toBe(false);
  });

  it('refuses an event key that is empty or longer than 200 characters', () => {
    expect(refuseInAppNotification(notice({ eventKey: '' }))).toEqual({ reason: 'EVENT_KEY_INVALID' });
    expect(refuseInAppNotification(notice({ eventKey: 'k'.repeat(MAX_EVENT_KEY_LENGTH) }))).toBeNull();
    expect(refuseInAppNotification(notice({ eventKey: 'k'.repeat(MAX_EVENT_KEY_LENGTH + 1) }))).toEqual({
      reason: 'EVENT_KEY_INVALID',
    });
  });

  it('refuses a subject with an empty type or id', () => {
    expect(refuseInAppNotification(notice({ subject: { type: ' ', id: REQUEST } }))).toEqual({
      reason: 'SUBJECT_INVALID',
    });
    expect(refuseInAppNotification(notice({ subject: { type: 'ACCESS_REQUEST', id: '' } }))).toEqual({
      reason: 'SUBJECT_INVALID',
    });
  });

  it('refuses a parameter the code does not carry', () => {
    expect(refuseInAppNotification(notice({ params: { requestId: REQUEST, planName: 'Figma' } }))).toEqual({
      reason: 'PARAM_KEY_NOT_ALLOWED',
      key: 'planName',
    });
  });

  it.each([
    'password',
    'passwordHash',
    'refreshToken',
    'clientSecret',
    'sessionCookie',
    'credential',
    'authorization',
    'pepper',
  ])('refuses a key like %s whatever the code, before the table of the code is asked', (key) => {
    expect(refuseInAppNotification(notice({ params: { [key]: 'x' } }))).toEqual({ reason: 'PARAM_KEY_FORBIDDEN', key });
  });

  it.each([
    ['an object', { requestId: { id: REQUEST } }],
    ['an array', { requestId: [REQUEST] }],
    ['an undefined value', { requestId: undefined }],
    ['a number that is not finite', { requestId: Number.NaN }],
  ])('refuses a parameter that is %s: only text, finite numbers, booleans and empty are flat', (_name, params) => {
    expect(refuseInAppNotification(notice({ params: params as never }))).toEqual({
      reason: 'PARAM_VALUE_INVALID',
      key: 'requestId',
    });
  });

  it('accepts text, numbers, booleans and null as parameters', () => {
    const params = { requestId: REQUEST, byRequester: true, reason: null };

    expect(refuseInAppNotification(notice({ code: 'REQUEST_WITHDRAWN', params }))).toBeNull();
    expect(
      refuseInAppNotification(
        notice({ code: 'STEP_SLA_REMINDER', params: { requestId: REQUEST, overdueWorkingDays: 2 } }),
      ),
    ).toBeNull();
  });

  it('refuses parameters over 4 096 bytes, counted in bytes and not in characters', () => {
    const fits = 'a'.repeat(4000);
    expect(refuseInAppNotification(notice({ code: 'REQUEST_REJECTED', params: { reason: fits } }))).toBeNull();
    // 1 500 three-byte characters are 4 500 bytes though they are fewer than 4 096 characters.
    expect(refuseInAppNotification(notice({ code: 'REQUEST_REJECTED', params: { reason: '€'.repeat(1500) } }))).toEqual(
      {
        reason: 'PARAMS_TOO_LARGE',
      },
    );
  });
});

describe('the alerts of the rights (a03-license-inbox-alerts, FR-5.14 lines 3, 12, 13, 38)', () => {
  const ID = '00000000-0000-4000-8000-0000000000a3';

  it('accepts each with the keys its writer sends and refuses an account identifier smuggled in', () => {
    const accepted: InAppNotificationInput[] = [
      notice({
        code: 'LICENSE_EXPIRY_REMINDER',
        params: { assignmentId: ID, holderEmployeeId: ID, planId: ID, expectedEndDate: '2026-09-30', audience: 'HEAD' },
      }),
      notice({
        code: 'HANDOVER_CONFIRMATION_DUE',
        params: { dutyId: ID, assignmentId: ID, employeeId: ID, role: 'DEPARTMENT_HEAD', dueOn: '2026-09-29' },
      }),
      notice({
        code: 'HANDOVER_CONFIRMATION_OVERDUE',
        params: { dutyId: ID, assignmentId: ID, employeeId: ID, role: 'IT_ADMIN', dueOn: '2026-09-29' },
      }),
      notice({
        code: 'SERVICE_ACCOUNT_RESPONSIBLE_DUE',
        params: { employeeId: ID, fileKind: 'TRANSFER', fileId: ID, dueOn: '2026-07-01', accountCount: 2 },
      }),
      notice({
        code: 'SERVICE_ACCOUNT_RESPONSIBLE_OVERDUE',
        params: {
          assignmentId: ID,
          employeeId: ID,
          owningDepartmentId: null,
          fileKind: 'OFFBOARDING',
          fileId: ID,
          dueOn: '2026-07-01',
        },
      }),
      notice({
        code: 'LEAVER_K1_ACCESS_RUNS_ON',
        params: { taskId: ID, assignmentId: ID, employeeId: ID, planId: ID, accessUntil: '2026-11-30' },
      }),
      // A seat still held by a person who left (`G2`): ids only, the interface turns them into names.
      notice({
        code: 'GHOST_SEAT_G2_DETECTED',
        params: { recommendationId: ID, employeeId: ID, applicationId: ID },
      }),
      notice({ code: 'GHOST_SEAT_NEW', params: { recommendationId: ID, departmentId: ID, weekKey: '2026-W45' } }),
      notice({
        code: 'GHOST_SEAT_ACTION_TIER',
        params: { recommendationId: ID, departmentId: ID, weekKey: '2026-W45' },
      }),
      notice({
        code: 'GHOST_SEAT_DECISION_OVERDUE',
        params: { recommendationId: ID, employeeId: ID, applicationId: ID, decisionDueOn: '2026-11-06' },
      }),
      notice({ code: 'GHOST_SEAT_WAITING_FOR_HEAD', params: { recommendationId: ID, departmentId: ID } }),
      notice({ code: 'GHOST_SEAT_RETURNED', params: { recommendationId: ID, employeeId: ID, applicationId: ID } }),
      notice({
        code: 'GHOST_SEAT_EXEMPTION_ENDING',
        params: { recommendationId: ID, employeeId: ID, applicationId: ID, exemptUntil: '2026-12-31' },
      }),
      notice({
        code: 'USAGE_TRACKING_NOTICE',
        params: {
          applicationId: ID,
          activityDefinition: 'mở hoặc chỉnh sửa một tệp',
          dataKinds: 'ngày hoạt động theo tài khoản',
          purpose: 'đối chiếu quyền đang giữ với việc sử dụng',
          retentionMonths: 6,
          viewPath: '/applications/x/usage-tracking',
        },
      }),
      notice({
        code: 'USAGE_SOURCE_STALE',
        params: { applicationId: ID, source: 'Figma admin export', coverageTo: '2026-09-01', freshnessDays: 8 },
      }),
      notice({
        code: 'REVOCATION_UPCOMING',
        params: { taskId: ID, planId: ID, applicationId: ID, source: 'GHOST_SEAT', notBefore: '2026-11-08' },
      }),
      notice({
        code: 'REVOCATION_CANCELLED',
        params: { planId: ID, applicationId: ID, source: 'GHOST_SEAT' },
      }),
    ];
    for (const input of accepted)
      expect({ code: input.code, refusal: refuseInAppNotification(input) }).toEqual({
        code: input.code,
        refusal: null,
      });
    expect(
      refuseInAppNotification(
        notice({ code: 'LEAVER_K1_ACCESS_RUNS_ON', params: { accountIdentifier: 'bot@acme.vn' } }),
      ),
    ).toEqual({ reason: 'PARAM_KEY_NOT_ALLOWED', key: 'accountIdentifier' });
  });
});

describe('the notices of the renewal of a subscription (a06, EP-11)', () => {
  const ID = '00000000-0000-4000-8000-0000000000a6';
  const KEYS_BY_CODE = {
    SUBSCRIPTION_RENEWAL_ALERT: [
      'subscriptionId',
      'renewalId',
      'milestoneDays',
      'baseDate',
      'noticeBasis',
      'audience',
      'decisionRecorded',
      'outcomeRecorded',
      'usageData',
    ],
    SUBSCRIPTION_RENEWAL_DATA_QUALITY: ['subscriptionId', 'problem'],
    SUBSCRIPTION_RENEWAL_PROPOSED: ['renewalId', 'subscriptionId', 'choice'],
    SUBSCRIPTION_RENEWAL_DECIDED: ['renewalId', 'subscriptionId', 'choice', 'executionPoint'],
    SUBSCRIPTION_RENEWAL_LATE: ['renewalId', 'subscriptionId', 'baseDate'],
    SUBSCRIPTION_AUTO_RENEWAL_INCIDENT: ['subscriptionId', 'baseDate'],
    SUBSCRIPTION_EXPIRY_MARKED: ['subscriptionId', 'baseDate', 'endDate'],
  } as const;

  it('pins the keys of each of the seven codes (the Business Owner notice is gone, `QĐ-111g`), so a new key is a decision and not an accident', () => {
    for (const [code, keys] of Object.entries(KEYS_BY_CODE))
      expect({ code, keys: [...(PARAM_KEYS_BY_CODE[code as keyof typeof PARAM_KEYS_BY_CODE] ?? [])].sort() }).toEqual({
        code,
        keys: [...keys].sort(),
      });
    expect(Object.keys(KEYS_BY_CODE)).toHaveLength(7);
    // The code is out of the table: nothing writes it any more, and a notice already kept under it is still read (its code is text).
    expect(PARAM_KEYS_BY_CODE).not.toHaveProperty('SUBSCRIPTION_BUSINESS_OWNER_LEFT');
  });

  it('accepts a notice with exactly its keys and refuses an amount or a person smuggled into one', () => {
    for (const [code, keys] of Object.entries(KEYS_BY_CODE))
      expect(
        refuseInAppNotification(
          notice({
            code: code as InAppNotificationInput['code'],
            subject: { type: 'SUBSCRIPTION', id: ID },
            params: Object.fromEntries(keys.map((key) => [key, ID])),
          }),
        ),
      ).toBeNull();
    expect(
      refuseInAppNotification(
        notice({
          code: 'SUBSCRIPTION_RENEWAL_DECIDED',
          params: { renewalId: ID, subscriptionId: ID, choice: 'RENEW', executionPoint: 'NOW', unitPrice: '1000000' },
        }),
      ),
    ).toEqual({ reason: 'PARAM_KEY_NOT_ALLOWED', key: 'unitPrice' });
  });
});

describe('the controlled-wait alert of a budget version or a renewal (D-S16, US-06-11 AC-12, US-11-02 AC-23)', () => {
  const VERSION = '00000000-0000-4000-8000-0000000000b1';
  const alert = (subject: { type: string; id: string }, params: InAppNotificationInput['params']) =>
    notice({
      code: 'CONTROLLED_WAIT_ALERT',
      subject,
      params,
      eventKey: `CONTROLLED_WAIT_ALERT:${subject.type}:${subject.id}:sent:1`,
    });
  const waiting = { waitingReason: 'NO_SPENDING_APPROVER', configurationHint: 'CONFIGURE_SPENDING_APPROVER' };

  it('lets CONTROLLED_WAIT_ALERT name a budget version or a renewal, never an amount', () => {
    expect(
      refuseInAppNotification(
        alert(
          { type: 'BUDGET_VERSION', id: VERSION },
          { ...waiting, versionId: VERSION, costCenterId: REQUEST, year: 2027 },
        ),
      ),
    ).toBeNull();
    expect(
      refuseInAppNotification(
        alert(
          { type: 'SUBSCRIPTION_RENEWAL', id: VERSION },
          { ...waiting, renewalId: VERSION, subscriptionId: REQUEST },
        ),
      ),
    ).toBeNull();
    for (const key of ['amount', 'total', 'budgetTotal']) {
      expect(
        refuseInAppNotification(
          alert({ type: 'BUDGET_VERSION', id: VERSION }, { ...waiting, versionId: VERSION, [key]: 1 }),
        ),
      ).not.toBeNull();
    }
  });

  it('keeps the table of codes as it was: the alert is the one of line 27, not a code of its own', () => {
    expect(IN_APP_NOTIFICATION_CODES).toContain('CONTROLLED_WAIT_ALERT');
    expect(PARAM_KEYS_BY_CODE.CONTROLLED_WAIT_ALERT).toEqual(
      expect.arrayContaining(['requestId', 'stepKind', 'waitingReason', 'configurationHint']),
    );
  });
});

describe('the notices of MF-2 and MF-3 and of what goes with them (QĐ-110, QĐ-111)', () => {
  const ID = '44444444-4444-4444-8444-444444444444';
  const OTHER = '55555555-5555-4555-8555-555555555555';
  const cases: [InAppNotificationInput['code'], Record<string, string | number | boolean | null>][] = [
    ['REVOCATION_OVERDUE', { caseId: ID, employeeId: OTHER, dueOn: '2026-10-01', rightCount: 2 }],
    [
      'DEPARTURE_ACCESS_BLOCKED',
      {
        caseId: ID,
        employeeId: OTHER,
        departmentId: ID,
        blockedOn: '2026-09-30',
        revocationDueOn: '2026-10-01',
        audience: 'IT_ADMIN',
      },
    ],
    ['ACCOUNT_LOCK_OVERDUE', { caseId: ID, employeeId: OTHER, blockedOn: '2026-11-12' }],
    [
      'TRANSFER_GRACE_STARTED',
      {
        transferId: ID,
        employeeId: OTHER,
        fromDepartmentId: ID,
        toDepartmentId: OTHER,
        graceEndsOn: '2026-11-20',
        audience: 'MOVER',
      },
    ],
    ['TRANSFER_GRACE_ENDING', { transferId: ID, employeeId: OTHER, graceEndsOn: '2026-11-20' }],
    ['TRANSFER_RIGHTS_REVOKING', { transferId: ID, employeeId: OTHER, toDepartmentId: ID, rightCount: 2 }],
    ['REQUEST_CANCELLED_BENEFICIARY_GONE', { requestId: ID, beneficiaryEmployeeId: OTHER, reasonKind: 'DEPARTURE' }],
    ['DEPARTMENT_SOFTWARE_PROPOSED', { proposalId: ID, departmentId: OTHER, applicationId: ID, planId: null }],
    [
      'DEPARTMENT_SOFTWARE_PROPOSAL_DECIDED',
      {
        proposalId: ID,
        departmentId: OTHER,
        applicationId: ID,
        planId: null,
        decision: 'REJECTED',
        reason: 'đã có công cụ khác',
      },
    ],
    ['VENDOR_ADMINS_BELOW_MINIMUM', { planId: ID, applicationId: OTHER, adminCount: 1 }],
    ['DEPARTMENT_WITHOUT_HEAD', { departmentId: ID, waitingCount: 3 }],
    [
      'SUBSCRIPTION_SEATS_INCREASED',
      { subscriptionId: ID, fromQuantity: 10, toQuantity: 11, requestId: OTHER, changedByEmployeeId: OTHER },
    ],
    [
      'IT_ADMIN_HANDOVER_PENDING',
      { sourceKind: 'OFFBOARDING_CASE', sourceId: ID, employeeId: OTHER, dueOn: '2026-11-12' },
    ],
  ];

  it.each(cases)('accepts %s with the keys of its code', (code, params) => {
    expect(refuseInAppNotification(notice({ code, subject: { type: 'THING', id: ID }, params }))).toBeNull();
  });

  it.each(cases)('refuses %s with a key that is not its own, and one that is a figure', (code, params) => {
    const subject = { type: 'THING', id: ID };

    expect(refuseInAppNotification(notice({ code, subject, params: { ...params, surprise: 'x' } }))).toEqual({
      reason: 'PARAM_KEY_NOT_ALLOWED',
      key: 'surprise',
    });
    expect(refuseInAppNotification(notice({ code, subject, params: { ...params, amount: 5 } }))).toEqual({
      reason: 'PARAM_KEY_NOT_ALLOWED',
      key: 'amount',
    });
  });
});

describe('what the table says it may carry (INF-06, FR-3.11)', () => {
  it('has a list of keys for every code of the table and a code for every list', () => {
    expect(Object.keys(PARAM_KEYS_BY_CODE).sort()).toEqual([...IN_APP_NOTIFICATION_CODES].sort());
  });

  it('has codes of the shape the database accepts', () => {
    for (const code of IN_APP_NOTIFICATION_CODES) expect(code).toMatch(/^[A-Z][A-Z0-9_]{2,63}$/);
  });

  it('allows no key that names a secret, an amount, a finding of the budget, a reason to override, evidence or the text of an error', () => {
    for (const [code, keys] of Object.entries(PARAM_KEYS_BY_CODE)) {
      for (const key of keys) {
        expect({ code, key, forbidden: FORBIDDEN_PARAM_KEY.test(key) }).toEqual({ code, key, forbidden: false });
        expect({ code, key, figure: FIGURE_WORDS.test(key) }).toEqual({ code, key, figure: false });
      }
    }
  });

  it('names a person only by id: no key of any code is a name', () => {
    for (const keys of Object.values(PARAM_KEYS_BY_CODE)) {
      for (const key of keys) expect(key).not.toMatch(/(?:^|[a-z])(?:Name|Email)$|^fullName$/);
    }
  });
});
