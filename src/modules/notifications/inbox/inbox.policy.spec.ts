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
    SUBSCRIPTION_BUSINESS_OWNER_LEFT: ['subscriptionId', 'applicationId'],
    SUBSCRIPTION_RENEWAL_PROPOSED: ['renewalId', 'subscriptionId', 'choice'],
    SUBSCRIPTION_RENEWAL_DECIDED: ['renewalId', 'subscriptionId', 'choice', 'executionPoint'],
    SUBSCRIPTION_RENEWAL_LATE: ['renewalId', 'subscriptionId', 'baseDate'],
    SUBSCRIPTION_AUTO_RENEWAL_INCIDENT: ['subscriptionId', 'baseDate'],
    SUBSCRIPTION_EXPIRY_MARKED: ['subscriptionId', 'baseDate', 'endDate'],
  } as const;

  it('pins the keys of each of the eight codes, so a new key is a decision and not an accident', () => {
    for (const [code, keys] of Object.entries(KEYS_BY_CODE))
      expect({ code, keys: [...(PARAM_KEYS_BY_CODE[code as keyof typeof PARAM_KEYS_BY_CODE] ?? [])].sort() }).toEqual({
        code,
        keys: [...keys].sort(),
      });
    expect(Object.keys(KEYS_BY_CODE)).toHaveLength(8);
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
