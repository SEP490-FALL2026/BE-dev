import { PARAM_KEYS_BY_CODE } from '../inbox.policy';
import type { InAppNotificationCode } from '../../public/notifications.types';
import {
  NOTIFICATION_TEXTS,
  renderNotificationText,
  templateVariables,
  type TemplateVariable,
} from './inbox-notification-text.policy';
import type { NotificationLocale, NotificationTexts, TextTemplate } from './notification-text.types';

/**
 * A10 of the spec: a variable that can be absent sits inside a `[ ]` group or is the `by` of a variant, so that a missing
 * value never leaves a hole in the sentence ("do  phụ trách", "năm của mà", "()"). The renderer cannot repair a hole: an
 * absent variable prints nothing and the double space is folded, which hides the damage from the table spec.
 */

const LOCALES: readonly NotificationLocale[] = ['vi', 'en'];
const UUID = '00000000-0000-0000-0000-000000000000';

/**
 * The params the catalogue types `… | null` (`catalog/notifications.md`, column `params`), by code, for the codes of the table.
 * (`uuid | chuỗi rỗng` of the ghost seat ids counts: the writer sends `null`, old rows `""`.) The list is copied from the catalogue, not from the writers; a key a sentence never uses costs nothing here.
 */
const MAY_BE_ABSENT: Readonly<Partial<Record<InAppNotificationCode, readonly string[]>>> = {
  ABRUPT_DEPARTURE_RECORDED: ['departmentId'],
  BUDGET_ADJUSTMENT_DECIDED: ['costCenterId'],
  BUDGET_PROPOSAL_RETURNED: ['reason'],
  BUDGET_VERSION_DECIDED: ['reason'],
  CONTROLLED_WAIT_ALERT: ['waitingReason', 'configurationHint', 'stepKind'],
  DEPARTMENT_SOFTWARE_PROPOSAL_DECIDED: ['planId', 'reason'],
  DEPARTMENT_SOFTWARE_PROPOSED: ['planId'],
  DEPARTURE_ACCESS_BLOCKED: ['departmentId'],
  EMPLOYEE_PROFILE_CREATED: ['departmentId'],
  EMPLOYEE_PROFILE_UPDATED: ['departmentId'],
  GHOST_SEAT_DECISION_OVERDUE: ['employeeId'],
  GHOST_SEAT_EXEMPTION_ENDING: ['employeeId'],
  GHOST_SEAT_RETURNED: ['employeeId'],
  PERSONNEL_EVENT_RECORDED: ['departmentId'],
  REQUEST_AWAITING_BUDGET: ['costCenterId', 'year'],
  REQUEST_BUDGET_VERSION_ENDED: ['versionId', 'costCenterId', 'year', 'decision'],
  REQUEST_CANCELLED: ['reasonKind'],
  REQUEST_CANCELLED_BENEFICIARY_GONE: ['beneficiaryEmployeeId'],
  REQUEST_GRANTED: ['homepageUrl'],
  REQUEST_IT_REJECTED: ['reason', 'alternativePlanId', 'alternativeNote'],
  REQUEST_REJECTED: ['reason', 'suggestedPlanId'],
  REQUEST_RENEWAL_APPLIED: ['newExpectedEndDate'],
  REQUEST_RENEWAL_NOT_APPLIED: ['problem'],
  REQUEST_RETURNED: ['reason'],
  REQUEST_RETURNED_BY_FINANCE: ['reason'],
  REQUEST_WAITING_CONTROLLED: ['stepKind'],
  REQUEST_WAITING_ENDED: ['stepKind'],
  REQUEST_WITHDRAWN: ['reason'],
  RETURN_REQUESTED: ['planId', 'source', 'handoverDueOn'],
  ROLE_HOLDER_LEAVING: ['departmentId'],
  SERVICE_ACCOUNT_RESPONSIBLE_OVERDUE: ['owningDepartmentId'],
  SPEND_QUEUE_REMINDER: ['cause'],
  STEP_ASSIGNED: ['stepKind'],
  STEP_SLA_ESCALATION: ['holderEmployeeId'],
  STEP_SLA_NO_SUPERIOR: ['holderEmployeeId'],
  OUT_OF_PROCESS_CASE_REPORTED: ['applicationId', 'vendorId'],
  SUBSCRIPTION_AUTO_RENEWAL_INCIDENT: ['renewalId'],
  SUBSCRIPTION_EXPIRY_MARKED: ['endDate'],
  // A row of before `SBF-20` v3.1 has no `commitment`; one of after has no `milestoneDays`, and `renewalId` is null.
  SUBSCRIPTION_RENEWAL_ALERT: ['renewalId', 'commitment', 'milestoneDays'],
  SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED: ['quantity', 'nextSubscriptionId'],
  SUBSCRIPTION_SEATS_INCREASED: ['requestId'],
  VENDOR_ACCOUNT_DISCREPANCY_OPENED: ['applicationId', 'vendorId'],
  WITHDRAWAL_AWAITING_IT_CLOSE: ['taskId'],
};

/** `code.key` pairs allowed outside a `[ ]` group, with the reason; the renderer check skips them too. */
const ABSENT_OUTSIDE_GROUP_OK: Readonly<Record<string, string>> = {
  'EMPLOYEE_PROFILE_CREATED.departmentId':
    'catalogue: "trong trường hợp phát thực tế luôn có giá trị; kiểu cho phép null" — the writer always sends the department',
};

const templatesOf = (texts: NotificationTexts): { part: string; template: TextTemplate }[] =>
  LOCALES.flatMap((locale) =>
    (['title', 'message'] as const).map((part) => ({ part: `${locale}.${part}`, template: texts[locale][part] })),
  );

const entries = Object.entries(MAY_BE_ABSENT).flatMap(([code, keys]) =>
  (keys ?? []).map((key) => ({ code: code as InAppNotificationCode, key })),
);

/** Params that give every key a value: ids and `:name` keys a uuid, the rest a word. */
function baseParams(code: InAppNotificationCode): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const key of PARAM_KEYS_BY_CODE[code]) params[key] = /Ids?$/.test(key) ? UUID : 'X';
  return params;
}

/**
 * The variables of the branches a template can show while `key` is absent: all of them, except that a variant `by` the key
 * shows only its `otherwise` then (a named case means the key has that value).
 */
const reachedWhenAbsent = (template: TextTemplate, key: string): TemplateVariable[] =>
  typeof template !== 'string' && template.by === key
    ? templateVariables(template.otherwise)
    : templateVariables(template);

/** One param set per value a variant can choose, so that every branch is rendered. */
function branchParamSets(code: InAppNotificationCode, key: string): Record<string, unknown>[] {
  const base = { ...baseParams(code), [key]: null };
  const sets: Record<string, unknown>[] = [base];
  for (const { template } of templatesOf(NOTIFICATION_TEXTS[code])) {
    if (typeof template === 'string' || template.by === key) continue;
    for (const value of [...Object.keys(template.cases), 'NO_SUCH_CASE']) {
      sets.push({ ...base, [template.by]: value });
    }
  }
  return sets;
}

describe('MAY_BE_ABSENT: a variable that can be absent stays inside [ ] or is the `by` of a variant (A10)', () => {
  it('names only codes of the table and keys the code carries', () => {
    for (const { code, key } of entries) {
      expect(NOTIFICATION_TEXTS).toHaveProperty(code);
      expect(PARAM_KEYS_BY_CODE[code]).toContain(key);
    }
  });

  it('lists an exception only for a pair the table lists, and says why', () => {
    for (const [pair, reason] of Object.entries(ABSENT_OUTSIDE_GROUP_OK)) {
      const [code, key] = pair.split('.');
      expect(MAY_BE_ABSENT[code as InAppNotificationCode]).toContain(key);
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  it.each(entries.map(({ code, key }) => [code, key] as const))(
    '%s.%s is never printed outside a group',
    (code, key) => {
      if (`${code}.${key}` in ABSENT_OUTSIDE_GROUP_OK) return;
      const outside = templatesOf(NOTIFICATION_TEXTS[code]).flatMap(({ part, template }) =>
        reachedWhenAbsent(template, key)
          .filter((variable) => variable.key === key && !variable.optional)
          .map(() => part),
      );
      expect(outside).toEqual([]);
    },
  );

  it.each(entries.map(({ code, key }) => [code, key] as const))(
    '%s with %s null renders a sentence with no hole ("()", a space before punctuation)',
    (code, key) => {
      if (`${code}.${key}` in ABSENT_OUTSIDE_GROUP_OK) return;
      for (const locale of LOCALES) {
        for (const params of branchParamSets(code, key)) {
          const { message } = renderNotificationText(code, params, locale, new Map());
          expect(message).not.toBe('');
          expect(message).not.toContain('()');
          expect(message).not.toMatch(/\s[.,;:)]/);
        }
      }
    },
  );
});
