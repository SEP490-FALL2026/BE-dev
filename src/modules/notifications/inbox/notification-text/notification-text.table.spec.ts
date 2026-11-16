import { PARAM_KEYS_BY_CODE } from '../inbox.policy';
import { IN_APP_NOTIFICATION_CODES, type InAppNotificationCode } from '../../public/notifications.types';
import { CODE_LABELS, SHARED_LABELS } from './notification-labels.types';
import {
  NOTIFICATION_TEXTS,
  nameLookupKey,
  nameRefsOf,
  nameRefsOfTemplate,
  renderNotificationText,
  renderTemplate,
  TEMPLATE_FORMATS,
  templateSyntaxIssues,
  templateVariables,
} from './notification-text.policy';
import {
  NAME_KIND_BY_KEY,
  type NotificationLocale,
  type NotificationTexts,
  type TextTemplate,
} from './notification-text.types';
import { BUDGET_TEXTS } from './notification-texts-budget.types';
import { LICENSING_TEXTS } from './notification-texts-licensing.types';
import { MF1_SLA_TEXTS } from './notification-texts-mf1-sla.types';
import { MF1_TEXTS } from './notification-texts-mf1.types';
import { ORG_TEXTS } from './notification-texts-org.types';

/**
 * A11.1 of the spec: walks the whole table of sentences (every code of `IN_APP_NOTIFICATION_CODES`, never a hand-written list)
 * and fails on a missing code, a variable the code does not carry, a missing label, a sentence that differs between the two
 * languages in the variables it uses, or any syntax or placeholder left in a rendered sentence.
 */

const LOCALES: readonly NotificationLocale[] = ['vi', 'en'];
const UUID = '00000000-0000-0000-0000-000000000000';
const FORBIDDEN = ['{', '}', '[', ']', 'undefined', 'null', 'NaN', '[object'];
const ALLOWED_FORMATS = new Set<string | undefined>([undefined, ...TEMPLATE_FORMATS]);

/** Codes whose Vietnamese sentence says more than the English one, on purpose (catalogue, GENERIC-ERRORS line 17): the keys only `vi` uses. */
const VARIABLE_SET_EXCEPTIONS: Readonly<Record<string, readonly string[]>> = {
  USAGE_TRACKING_NOTICE: ['dataKinds', 'purpose'],
};

type LabelTree = Readonly<
  Record<string, Readonly<Record<string, Readonly<Record<string, Record<NotificationLocale, string>>>>>>
>;
const codeLabels = CODE_LABELS as unknown as LabelTree;
const sharedLabels = SHARED_LABELS as unknown as Readonly<
  Record<string, Readonly<Record<string, Record<NotificationLocale, string>>>>
>;

const templatesOf = (
  texts: NotificationTexts,
): { locale: NotificationLocale; part: string; template: TextTemplate }[] =>
  LOCALES.flatMap((locale) =>
    (['title', 'message'] as const).map((part) => ({
      locale,
      part: `${locale}.${part}`,
      template: texts[locale][part],
    })),
  );

const branchesOf = (template: TextTemplate): string[] =>
  typeof template === 'string' ? [template] : [...Object.values(template.cases), template.otherwise];

/** The label of every value of `key` for `code`: the labels of the code over the shared ones, as the renderer reads them. */
function labelValues(code: string, key: string): Record<string, Record<NotificationLocale, string>> | undefined {
  const own = codeLabels[code]?.[key];
  const shared = sharedLabels[key];
  return own || shared ? { ...shared, ...own } : undefined;
}

function problemsOf(code: InAppNotificationCode): string[] {
  const texts = NOTIFICATION_TEXTS[code] as NotificationTexts | undefined;
  if (!texts) return ['no sentences'];
  const allowedKeys = new Set(PARAM_KEYS_BY_CODE[code]);
  const problems: string[] = [];
  const usedBy: Record<NotificationLocale, Set<string>> = { vi: new Set(), en: new Set() };
  for (const { locale, part, template } of templatesOf(texts)) {
    if (branchesOf(template).some((branch) => branch.trim() === '')) problems.push(`${part}: an empty branch`);
    for (const issue of templateSyntaxIssues(template)) problems.push(`${part}: ${issue}`);
    if (typeof template !== 'string') {
      if (!allowedKeys.has(template.by)) problems.push(`${part}: by "${template.by}" is not a param of the code`);
      usedBy[locale].add(template.by);
    }
    for (const { key, format } of templateVariables(template)) {
      usedBy[locale].add(key);
      if (!allowedKeys.has(key)) problems.push(`${part}: {${key}} is not a param of the code`);
      if (!ALLOWED_FORMATS.has(format)) problems.push(`${part}: {${key}:${format}} unknown formatter`);
      if (format === 'name' && !(key in NAME_KIND_BY_KEY)) problems.push(`${part}: {${key}:name} has no name kind`);
      if (format === 'enum' || format === 'list') problems.push(...labelProblems(code, part, key));
    }
  }
  if (texts.vi.title === undefined || texts.en.title === undefined) problems.push('a title is missing');
  problems.push(...variableSetProblems(code, usedBy));
  return problems;
}

function labelProblems(code: string, part: string, key: string): string[] {
  const values = labelValues(code, key);
  if (!values || Object.keys(values).length === 0) return [`${part}: {${key}} has no label table`];
  return Object.entries(values).flatMap(([value, text]) =>
    LOCALES.filter((locale) => !text[locale] || text[locale].trim() === '').map(
      (locale) => `${part}: label ${key}.${value} has no ${locale} text`,
    ),
  );
}

function variableSetProblems(code: string, usedBy: Record<NotificationLocale, Set<string>>): string[] {
  const viOnly = [...usedBy.vi].filter((key) => !usedBy.en.has(key)).sort();
  const enOnly = [...usedBy.en].filter((key) => !usedBy.vi.has(key)).sort();
  const allowed = [...(VARIABLE_SET_EXCEPTIONS[code] ?? [])].sort();
  const problems: string[] = [];
  if (JSON.stringify(viOnly) !== JSON.stringify(allowed)) {
    problems.push(`variables only in vi: [${viOnly.join(', ')}], allowed [${allowed.join(', ')}]`);
  }
  if (enOnly.length > 0) problems.push(`variables only in en: [${enOnly.join(', ')}]`);
  return problems;
}

// ---------------------------------------------------------------------------------------------------------------
// Sample params

/** Every value one param can take in a sentence: the cases of a variant, the labelled values of an enum, `true`/`false`. */
function domainsOf(code: InAppNotificationCode): Map<string, string[]> {
  const domains = new Map<string, string[]>();
  const add = (key: string, values: string[]): void => {
    domains.set(key, [...new Set([...(domains.get(key) ?? []), ...values])]);
  };
  for (const { template } of templatesOf(NOTIFICATION_TEXTS[code])) {
    if (typeof template !== 'string') add(template.by, [...Object.keys(template.cases), 'NO_SUCH_CASE']);
    for (const { key, format } of templateVariables(template)) {
      if (format === 'enum') add(key, Object.keys(labelValues(code, key) ?? {}));
      if (format === 'list') add(key, Object.keys(labelValues(code, key) ?? {}).slice(0, 2));
    }
  }
  return domains;
}

function baseParams(code: InAppNotificationCode): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const key of PARAM_KEYS_BY_CODE[code])
    params[key] = /(Id|Ids)$/.test(key) ? UUID : /(On|At|Date)$/.test(key) ? '2026-01-02' : 'X';
  for (const { template } of templatesOf(NOTIFICATION_TEXTS[code])) {
    for (const { key, format } of templateVariables(template)) {
      if (format === 'name') params[key] = UUID;
      else if (format === 'date') params[key] = '2026-01-02';
      else if (format === 'quarter') params[key] = '3';
      else if (format === 'vnd') params[key] = '1000';
    }
  }
  return params;
}

function sampleParamSets(code: InAppNotificationCode): Record<string, unknown>[] {
  const base = baseParams(code);
  const numeric = { ...base };
  for (const key of PARAM_KEYS_BY_CODE[code]) if (/(Days|Count|Number|Version)/.test(key)) numeric[key] = 1;
  const sets: Record<string, unknown>[] = [{}, base, numeric];
  for (const [key, values] of domainsOf(code)) for (const value of values) sets.push({ ...base, [key]: value });
  return sets;
}

function expectClean(text: string, context: string): void {
  for (const bad of FORBIDDEN) {
    if (text.includes(bad)) throw new Error(`${context}: "${text}" contains "${bad}"`);
  }
}

// ---------------------------------------------------------------------------------------------------------------

describe('NOTIFICATION_TEXTS: the whole table', () => {
  const codes = [...IN_APP_NOTIFICATION_CODES];

  it('has an entry for every code and no entry for a code that does not exist', () => {
    expect(Object.keys(NOTIFICATION_TEXTS).sort()).toEqual([...codes].sort());
  });

  it('has no code in two of the data files (a spread would overwrite one silently)', () => {
    const files = { MF1_TEXTS, MF1_SLA_TEXTS, ORG_TEXTS, BUDGET_TEXTS, LICENSING_TEXTS };
    const owners = new Map<string, string[]>();
    for (const [file, table] of Object.entries(files)) {
      for (const code of Object.keys(table)) owners.set(code, [...(owners.get(code) ?? []), file]);
    }
    const duplicated = [...owners].filter(([, where]) => where.length > 1);
    expect(duplicated).toEqual([]);
  });

  it('keeps the exceptions of the vi = en rule to codes that exist and keys vi really uses', () => {
    for (const [code, keys] of Object.entries(VARIABLE_SET_EXCEPTIONS)) {
      expect(codes).toContain(code);
      for (const key of keys) expect(PARAM_KEYS_BY_CODE[code as InAppNotificationCode]).toContain(key);
    }
  });

  it.each(codes)('%s: templates, params, labels and the two languages agree', (code) => {
    expect(problemsOf(code)).toEqual([]);
  });

  it.each(codes)('%s: renders without syntax or placeholder, for empty and for sample params', (code) => {
    for (const locale of LOCALES) {
      for (const params of sampleParamSets(code)) {
        const { title, message } = renderNotificationText(code, params, locale, new Map());
        expect(title).not.toBe('');
        expectClean(title, `${code} ${locale} title ${JSON.stringify(params)}`);
        expectClean(message, `${code} ${locale} message ${JSON.stringify(params)}`);
      }
    }
  });
});

describe('the number 0 inside a [ ] group', () => {
  const render = (template: string, params: Record<string, unknown>): string =>
    renderTemplate(template, { params, locale: 'vi', names: new Map(), labelOf: () => undefined });

  it('hides the group, while false still counts as a value', () => {
    expect(render('Xong.[ Còn {n}.][ Cờ {f}.]', { n: 0, f: false })).toBe('Xong. Cờ false.');
    expect(render('Quá hạn[ {n} ngày] (lần {k}).', { n: 0, k: 2 })).toBe('Quá hạn (lần 2).');
    expect(render('Quá hạn[ {n} ngày].', { n: 3 })).toBe('Quá hạn 3 ngày.');
  });

  it('keeps the number 0 outside a group, and a "0" that is text', () => {
    expect(render('Còn {n}.', { n: 0 })).toBe('Còn 0.');
    expect(render('Còn[ {n}].', { n: '0' })).toBe('Còn 0.');
  });

  it('does not list a name whose group hides on 0', () => {
    expect(nameRefsOfTemplate('A[ {n} {planId:name}]', { n: 0, planId: UUID })).toEqual([]);
  });
});

describe('renderNotificationText', () => {
  it('renders the title and the message of a code in the asked language', () => {
    const params = { requestId: UUID, stage: 'CONFIRMED' };
    expect(renderNotificationText('REQUEST_SUBMITTED', params, 'vi', new Map())).toEqual({
      title: 'Đã gửi yêu cầu',
      message: 'Yêu cầu một yêu cầu đã được gửi và nhu cầu được xác nhận ngay khi gửi.',
    });
    expect(renderNotificationText('REQUEST_SUBMITTED', params, 'en', new Map()).title).toBe('Request sent');
  });

  it('prints the name found for an id, and the generic phrase when there is none', () => {
    const names = new Map([[nameLookupKey('REQUEST', UUID), 'Figma – Pro cho Design']]);
    const params = { requestId: UUID, stage: 'WAITING_NEED_DECISION' };
    expect(renderNotificationText('REQUEST_SUBMITTED', params, 'en', names).message).toContain(
      'Figma – Pro cho Design',
    );
    expect(renderNotificationText('REQUEST_SUBMITTED', params, 'en', new Map()).message).toContain('a request');
  });

  it('reads a label of the code before the shared label of the same key and value', () => {
    // `by` has its own labels in REQUEST_REJECTED; SHARED_LABELS has none for it, so the code's wins by being the only one.
    const rejected = renderNotificationText('REQUEST_REJECTED', { requestId: UUID, by: 'NEED' }, 'en', new Map());
    expect(rejected.message).toContain('need approval');
    // `stepKind` is shared: any code that uses `{stepKind:enum}` reads the shared label.
    const overdue = renderNotificationText('STEP_SLA_REMINDER', { requestId: UUID, stepKind: 'NEED' }, 'en', new Map());
    expect(overdue.message + overdue.title).toContain('need approval');
  });

  it('prints an enum value that has no label as it is', () => {
    const rejected = renderNotificationText(
      'REQUEST_REJECTED',
      { requestId: UUID, by: 'SOMETHING_NEW' },
      'vi',
      new Map(),
    );
    expect(rejected.message).toContain('SOMETHING_NEW');
  });

  it('answers a code that is not in the table with a generic notice and an empty message, without throwing', () => {
    expect(renderNotificationText('NO_SUCH_CODE', { a: 1 }, 'vi', new Map())).toEqual({
      title: 'Thông báo mới',
      message: '',
    });
    expect(renderNotificationText('NO_SUCH_CODE', {}, 'en', new Map())).toEqual({
      title: 'New notification',
      message: '',
    });
    expect(renderNotificationText('constructor', {}, 'en', new Map())).toEqual({
      title: 'New notification',
      message: '',
    });
  });

  it('hides the "overdue by N working days" group when N is 0', () => {
    const base = { requestId: UUID, stepKind: 'NEED', reminderNumber: 2 };
    const zero = renderNotificationText('STEP_SLA_REMINDER', { ...base, overdueWorkingDays: 0 }, 'en', new Map());
    const three = renderNotificationText('STEP_SLA_REMINDER', { ...base, overdueWorkingDays: 3 }, 'en', new Map());
    expect(zero.message).not.toContain('working days');
    expect(three.message).toContain('3 working days');
  });
});

describe('nameRefsOf', () => {
  it('lists the kind and id of every name a code prints, once, for the chosen branch', () => {
    const refs = nameRefsOf('REQUEST_SUBMITTED', { requestId: UUID, stage: 'CONFIRMED' }, 'vi');
    expect(refs).toEqual([{ kind: 'REQUEST', id: UUID }]);
  });

  it('is empty when the params carry no id, and for a code that is not in the table', () => {
    expect(nameRefsOf('REQUEST_SUBMITTED', {}, 'en')).toEqual([]);
    expect(nameRefsOf('NO_SUCH_CODE', { requestId: UUID }, 'en')).toEqual([]);
  });

  it('names every id the table can print, with a kind known to the lookup', () => {
    for (const code of IN_APP_NOTIFICATION_CODES) {
      for (const locale of LOCALES) {
        for (const params of sampleParamSets(code)) {
          for (const ref of nameRefsOf(code, params, locale))
            expect(Object.values(NAME_KIND_BY_KEY)).toContain(ref.kind);
        }
      }
    }
  });
});
