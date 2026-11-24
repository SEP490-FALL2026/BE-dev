import { IN_APP_NOTIFICATION_CODES, type InAppNotificationCode } from '../../public/notifications.types';
import { NOTIFICATION_TEXTS, templateVariables } from './inbox-notification-text.policy';
import { NAME_KIND_BY_KEY, type NotificationLocale, type TextTemplate } from './notification-text.types';

/**
 * Two mutations the table spec cannot see (O-4 of the audit of phase N): an id printed raw instead of as a name, and a variant whose
 * cases drift from the values the writer sends (a case deleted so the value falls to `otherwise`, or a case spelt wrongly so it never
 * matches).
 */

const LOCALES: readonly NotificationLocale[] = ['vi', 'en'];

/** `code.key` pairs allowed to print an id-like param without `:name`, with the reason. */
const RAW_ID_OK: Readonly<Record<string, string>> = {};

/**
 * The values a variant can choose by, copied from the `params` column of `catalog/notifications.md`: `values` are all of them,
 * `viaOtherwise` the ones the sentence deliberately leaves to `otherwise` (no case of their own), with the reason in the comment.
 */
interface Domain {
  values: readonly string[];
  viaOtherwise?: readonly string[];
}
const VARIANT_DOMAINS: Readonly<Record<string, Domain>> = {
  'DEPARTMENT_SOFTWARE_PROPOSAL_DECIDED.decision': { values: ['ACCEPTED', 'REJECTED'] },
  'DEPARTURE_ACCESS_BLOCKED.audience': { values: ['SUPER_ADMIN', 'IT_ADMIN', 'SUPER_ADMIN_AND_IT_ADMIN'] },
  'LICENSE_EXPIRY_REMINDER.audience': { values: ['EMPLOYEE', 'HEAD', 'IT_ADMIN'] },
  'PERSONNEL_EVENT_RECORDED.eventKind': {
    // The nine values of the catalogue, and `DEPARTURE_MARKED_LEFT` of `PersonnelNotifierService` (kept: it has a sentence).
    values: [
      'TRANSFER_RECORDED',
      'TRANSFER_RESCHEDULED',
      'TRANSFER_CANCELLED',
      'LONG_LEAVE_STARTED',
      'LONG_LEAVE_RETURN_DATE_CHANGED',
      'LONG_LEAVE_RETURNED',
      'DEPARTURE_RECORDED',
      'DEPARTURE_LAST_DAY_CHANGED',
      'DEPARTURE_CANCELLED',
      'DEPARTURE_MARKED_LEFT',
    ],
  },
  'POLICY_PUBLISHED.requiresReacknowledgement': { values: ['true', 'false'] },
  'RENEWAL_WINDOW_OPENED.audience': { values: ['EMPLOYEE', 'HEAD'] },
  'REQUEST_BENEFICIARY_GONE_IT_CHECK.reasonKind': { values: ['DEPARTURE', 'TRANSFER'] },
  'REQUEST_CANCELLED.reasonKind': { values: ['BENEFICIARY_LEFT', 'BENEFICIARY_TRANSFERRED'] },
  'REQUEST_CANCELLED_BENEFICIARY_GONE.reasonKind': { values: ['DEPARTURE', 'TRANSFER'] },
  // `false` is the ordinary case: the sentence of a rejection that has an alternative is the `otherwise`.
  'REQUEST_IT_REJECTED.noAlternative': { values: ['true', 'false'], viaOtherwise: ['false'] },
  'REQUEST_SUBMITTED.stage': { values: ['WAITING_NEED_DECISION', 'WAITING_CONTROLLED', 'CONFIRMED'] },
  // `false` (the viewer is someone else, or has no employee record) is the sentence with the name: the `otherwise`.
  'EMPLOYEE_PROFILE_UPDATED.recipientIsSubject': { values: ['true', 'false'], viaOtherwise: ['false'] },
  'TRANSFER_RIGHTS_REVOKING.recipientIsSubject': { values: ['true', 'false'], viaOtherwise: ['false'] },
  'REQUEST_WITHDRAWN.byRequester': { values: ['true', 'false'] },
  'RETURN_REQUESTED.source': { values: ['EMPLOYEE_RETURN', 'HEAD_CONFIRMATION'] },
  // `null`/absent (the head) and an old row without the key take the `otherwise`; only `NO_HOLDER` has a case.
  'SPEND_QUEUE_REMINDER.cause': { values: ['NO_HOLDER'] },
  // A row written before the key existed is the holder's.
  'STEP_SLA_REMINDER.recipientRole': { values: ['REQUESTER', 'HOLDER'], viaOtherwise: ['HOLDER'] },
  // A row of before `SBF-20` v3.1 has no `commitment`: it takes the `otherwise`, the sentence of the old milestone.
  'SUBSCRIPTION_RENEWAL_ALERT.commitment': { values: ['MONTHLY', 'ANNUAL'] },
  // `NO_ALERT_ANCHOR` (no date at all) is the sentence that existed before the second problem: the `otherwise`.
  'SUBSCRIPTION_RENEWAL_DATA_QUALITY.problem': {
    values: ['NO_ALERT_ANCHOR', 'NO_NOTICE_DEADLINE'],
    viaOtherwise: ['NO_ALERT_ANCHOR'],
  },
  // `false` (the vendor was told by the IT Admin of the subscription) is the plain sentence: the `otherwise`.
  'SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED.substitute': { values: ['true', 'false'], viaOtherwise: ['false'] },
  // An IT Admin who moved the report (`IT_ACTION`) is the plain sentence: the `otherwise`.
  'SAAS_ISSUE_STATE_CHANGED.trigger': {
    values: ['IT_ACTION', 'REPORTER_REPLY', 'REPORTER_REOPEN', 'REOPEN_WINDOW_LAPSED'],
    viaOtherwise: ['IT_ACTION'],
  },
  'TRANSFER_GRACE_STARTED.audience': { values: ['MOVER', 'HEAD', 'IT_ADMIN'] },
};

const branchesOf = (template: TextTemplate): string[] =>
  typeof template === 'string' ? [template] : [...Object.values(template.cases), template.otherwise];

const templatesOf = (code: InAppNotificationCode): { part: string; template: TextTemplate }[] =>
  LOCALES.flatMap((locale) =>
    (['title', 'message'] as const).map((part) => ({
      part: `${locale}.${part}`,
      template: NOTIFICATION_TEXTS[code][locale][part],
    })),
  );

const variants = IN_APP_NOTIFICATION_CODES.flatMap((code) =>
  templatesOf(code).flatMap(({ part, template }) =>
    typeof template === 'string' ? [] : [{ code, part, by: template.by, cases: Object.keys(template.cases) }],
  ),
);

describe('an id is printed as a name, never raw (O-4a)', () => {
  it('uses `:name` for every variable that is an id', () => {
    const raw = IN_APP_NOTIFICATION_CODES.flatMap((code) =>
      templatesOf(code).flatMap(({ part, template }) =>
        branchesOf(template).flatMap((branch) =>
          templateVariables(branch)
            .filter(({ key, format }) => (key in NAME_KIND_BY_KEY || /Id$/.test(key)) && format !== 'name')
            .filter(({ key }) => !(`${code}.${key}` in RAW_ID_OK))
            .map(({ key }) => `${code} ${part}: {${key}} is raw`),
        ),
      ),
    );
    expect([...new Set(raw)]).toEqual([]);
  });
});

describe('VARIANT_DOMAINS: the cases of a variant are the values the writer sends (O-4b, O-4c)', () => {
  it('has a domain for every variant of the table, and none for a variant that does not exist', () => {
    const inTable = new Set(variants.map(({ code, by }) => `${code}.${by}`));
    expect([...inTable].filter((id) => !(id in VARIANT_DOMAINS)).sort()).toEqual([]);
    expect(
      Object.keys(VARIANT_DOMAINS)
        .filter((id) => !inTable.has(id))
        .sort(),
    ).toEqual([]);
  });

  it.each(variants.map((variant) => [`${variant.code}.${variant.by} ${variant.part}`, variant] as const))(
    '%s names only values of the domain, and every value has its case unless it is left to otherwise',
    (_name, { code, by, cases }) => {
      const domain = VARIANT_DOMAINS[`${code}.${by}`];
      expect(cases.filter((value) => !domain.values.includes(value))).toEqual([]);
      const viaOtherwise = domain.viaOtherwise ?? [];
      expect(domain.values.filter((value) => !cases.includes(value) && !viaOtherwise.includes(value))).toEqual([]);
      expect(cases.filter((value) => viaOtherwise.includes(value))).toEqual([]);
    },
  );
});
