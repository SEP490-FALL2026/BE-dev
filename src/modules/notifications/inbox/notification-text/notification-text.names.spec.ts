import { IN_APP_NOTIFICATION_CODES } from '../../public/notifications.types';
import { NOTIFICATION_TEXTS } from './inbox-notification-text.policy';
import { NAME_FALLBACK, NAME_KIND_BY_KEY, type NotificationLocale, type TextTemplate } from './notification-text.types';

/**
 * What a sentence says when the name of an id is unknown (FIX-O1): the phrase must not repeat the noun the sentence puts in front of
 * it. "Yêu cầu {requestId:name} đã được gửi" with the phrase "một yêu cầu" read "Yêu cầu một yêu cầu đã được gửi".
 */

const LOCALES: readonly NotificationLocale[] = ['vi', 'en'];
const BEFORE_NAME = /(\p{L}+) \{(\w+):name\}/gu;

const branchesOf = (template: TextTemplate): string[] =>
  typeof template === 'string' ? [template] : [...Object.values(template.cases), template.otherwise];

/** Every `{word} {key:name}` pair of the table, by locale: the word the sentence puts before a name, and the key it names. */
const nounsBeforeNames = (locale: NotificationLocale): { code: string; word: string; key: string }[] =>
  IN_APP_NOTIFICATION_CODES.flatMap((code) =>
    (['title', 'message'] as const)
      .flatMap((part) => branchesOf(NOTIFICATION_TEXTS[code][locale][part]))
      .flatMap((branch) => [...branch.matchAll(BEFORE_NAME)].map((m) => ({ code, word: m[1], key: m[2] }))),
  );

describe('NAME_FALLBACK: the phrase for an unknown name (FIX-O1)', () => {
  it.each(LOCALES)('is not the noun the sentence puts before it (%s)', (locale) => {
    const repeated = nounsBeforeNames(locale).filter(({ word, key }) => {
      const kind = NAME_KIND_BY_KEY[key];
      const phrase = kind ? NAME_FALLBACK[kind][locale] : '';
      return phrase.toLowerCase().split(/\s+/).includes(word.toLowerCase());
    });
    expect(repeated).toEqual([]);
  });

  it.each(LOCALES)('is a neutral phrase for a request, whatever precedes it (%s)', (locale) => {
    expect(NAME_FALLBACK.REQUEST[locale]).toBe(locale === 'vi' ? '(không rõ tên)' : '(unnamed)');
  });
});
