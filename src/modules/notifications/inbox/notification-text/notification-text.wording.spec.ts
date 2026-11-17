import { CODE_LABELS, SHARED_LABELS } from './notification-labels.types';
import { NOTIFICATION_TEXTS, renderTemplate, templateVariables } from './inbox-notification-text.policy';
import type { NotificationLocale, NotificationTexts, TextTemplate } from './notification-text.types';

/** F3: the wording of the English and Vietnamese sentences, read once the labels are in: no repeated word, no wrong article, no doubled full stop. */

const ctx = (locale: NotificationLocale, params: Record<string, unknown>) => ({
  params,
  locale,
  names: new Map<string, string>(),
  labelOf: () => undefined,
});

const branchesOf = (template: TextTemplate): string[] =>
  typeof template === 'string' ? [template] : [...Object.values(template.cases), template.otherwise];

type Labels = Record<string, Record<string, Record<NotificationLocale, string>>>;
const sharedLabels = SHARED_LABELS as unknown as Labels;
const codeLabels = CODE_LABELS as unknown as Record<string, Labels>;

/** Every sentence with each `{key:enum}` replaced by each of its labels, so a label that reads badly in a sentence shows. */
function expanded(source: string, code: string, locale: NotificationLocale): string[] {
  const match = /\{([A-Za-z_]\w*):enum\}/.exec(source);
  if (!match) return [source];
  const values = { ...sharedLabels[match[1]], ...codeLabels[code]?.[match[1]] };
  const texts = Object.values(values).map((label) => label[locale]);
  return (texts.length > 0 ? texts : ['x']).flatMap((text) =>
    expanded(
      source.replace(match[0], () => text),
      code,
      locale,
    ),
  );
}

const BAD: readonly [string, RegExp][] = [
  ['a repeated word', /\b(\w+) \1\b/i],
  ['a before a vowel', /\ba (?=[aeiou])/i],
  ['a doubled full stop', /(?<!\.)\.\.(?!\.)/],
  ['a space before a comma', / ,/],
];

describe('notification sentences: wording', () => {
  it('has no repeated word, wrong article, doubled full stop or stray space in any sentence once the labels are in', () => {
    const problems: string[] = [];
    for (const [code, texts] of Object.entries(NOTIFICATION_TEXTS) as [string, NotificationTexts][]) {
      for (const locale of ['vi', 'en'] as const) {
        for (const part of ['title', 'message'] as const) {
          for (const branch of branchesOf(texts[locale][part])) {
            for (const sentence of expanded(branch, code, locale)) {
              // Only the English sentences have articles and a word that must not repeat (`\w` does not see Vietnamese letters).
              for (const [name, pattern] of BAD) {
                if (locale === 'vi' && (name === 'a before a vowel' || name === 'a repeated word')) continue;
                if (pattern.test(sentence.replace(/\{[^}]*\}/g, 'X')))
                  problems.push(`${code} ${locale}.${part} ${name}: ${sentence}`);
              }
            }
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('prints the full stop of the sentence once when the text a person typed already ends with one', () => {
    const reason = renderTemplate('Reason: {reason}. Please resubmit.', ctx('en', { reason: 'Over the limit.' }));
    expect(reason).toBe('Reason: Over the limit. Please resubmit.');
    expect(renderTemplate('Lý do: {reason}.', ctx('vi', { reason: 'Quá hạn mức.' }))).toBe('Lý do: Quá hạn mức.');
    expect(renderTemplate('Lý do: {reason}.', ctx('vi', { reason: 'Quá hạn mức。' }))).toBe('Lý do: Quá hạn mức.');
    // An ellipsis the person typed stays an ellipsis, and a text without a full stop is left alone.
    expect(renderTemplate('Reason: {reason}.', ctx('en', { reason: 'Wait...' }))).toBe('Reason: Wait...');
    expect(renderTemplate('Reason: {reason}.', ctx('en', { reason: 'Too big' }))).toBe('Reason: Too big.');
    expect(renderTemplate('Reason: {reason}.', ctx('en', { reason: 'Too big.' }))).not.toContain('..');
  });

  it('keeps the helper honest: a template still lists its variables', () => {
    expect(templateVariables('A {reason}. B {x:enum}').map((v) => v.key)).toEqual(['reason', 'x']);
  });
});
