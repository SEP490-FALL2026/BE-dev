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
