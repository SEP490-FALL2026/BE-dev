/** The two languages of a notification sentence: `vi` is the default of `Accept-Language`. */
export type NotificationLocale = 'vi' | 'en';

/**
 * One sentence of a notification: a template, or (for a sentence that changes with who reads it or what happened) one whole
 * sentence per value of the param `by`, `otherwise` for any other value. Each case is a full sentence, never a tail to append.
 */
export type TextTemplate = string | { by: string; cases: Readonly<Record<string, string>>; otherwise: string };

export interface LocaleTexts {
  title: TextTemplate;
  message: TextTemplate;
}

export interface NotificationTexts {
  vi: LocaleTexts;
  en: LocaleTexts;
}
