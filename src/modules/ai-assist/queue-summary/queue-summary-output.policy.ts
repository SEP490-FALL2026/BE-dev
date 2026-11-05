import type { QueueContext, QueueRequestItem, QueueSummaryParsed, SummaryItem } from '../ai-service/ai-service.types';

/**
 * The checks of the backend on the lines the model wrote for a queue (design section 6), the TypeScript port of the reference
 * validator `AI-dev/eval/validators.py` that scores the models. A line passes only when it names a step of the context once, with
 * its kind, gives no advice, rank, risk or deadline, claims no action as done, carries no link, and writes no number that the source
 * of its own line does not have: every run of numerals must be a whole number of that source, a unit of money or a percentage
 * must be in it too, and the only placeholder is the cost of a spend line. Known gaps, as in the reference: a comparison or a
 * calculation the model makes up without a number is not caught, and a numeral written as a word ("năm mươi") passes unless its unit
 * gives it away.
 */

/** Recorded with the call, so a change of these rules is told apart from a change of the model. */
export const OUTPUT_CHECK_VERSION = 'access-request-queue-summary-check-v2';

export const REJECTION_CODES = [
  'UNKNOWN_SOURCE_REF',
  'DUPLICATE_SOURCE_REF',
  'EMPTY_SUMMARY',
  'STEP_KIND_MISMATCH',
  'ADVICE_LANGUAGE',
  'FORBIDDEN_CLAIM',
  'URL_PRESENT',
  'INVENTED_NUMBER',
  'BAD_PLACEHOLDER',
] as const;
export type RejectionCode = (typeof REJECTION_CODES)[number];

export interface QueueRejection {
  code: RejectionCode;
  sourceRef: string;
}

export interface QueueValidation {
  /** The lines that passed, in the order of the context. */
  accepted: SummaryItem[];
  /** One entry per reason a line was rejected, the codes of a line in alphabetical order. */
  rejections: QueueRejection[];
}

/** A trailing `*` marks an English stem (`risk*` finds "risks"); every other phrase is a whole run of words. */
const ADVICE_PHRASES = [
  'nên duyệt',
  'nên từ chối',
  'hãy duyệt',
  'hãy từ chối',
  'khuyến nghị duyệt',
  'khuyến nghị từ chối',
  'đề xuất duyệt',
  'đề xuất từ chối',
  'duyệt ngay',
  'từ chối ngay',
  'ưu tiên',
  'rủi ro',
  'sla',
  'khẩn cấp',
  'phê duyệt sớm',
  'phê duyệt ngay',
  'phê duyệt lập tức',
  'phê duyệt gấp',
  'duyệt gấp',
  'nên phê duyệt',
  'nên chấp thuận',
  'chấp thuận ngay',
  'should approve',
  'should reject',
  'recommend approving',
  'recommend rejecting',
  'approve immediately',
  'priorit*',
  'risk*',
  'urgent*',
  'trước tiên',
  'quan trọng nhất',
  'khẩn',
  'xử lý ngay',
  'xử lý gấp',
  'sớm nhất',
  'càng sớm càng tốt',
  'most important',
  'as soon as possible',
  'asap',
];

/**
 * Advice built from two parts: a word of advice, then a decision, at most two words apart and with no punctuation between
 * ("nên được duyệt", "hãy phê duyệt", "đáng được chấp thuận", "should be approved"). Alone, a decision word describes the step
 * ("đang chờ phê duyệt") and passes. "cần" is not a word of advice: "cần duyệt chi" describes the step.
 */
const ADVISORY_WORDS = [
  'nên',
  'hãy',
  'khuyên',
  'khuyến nghị',
  'kiến nghị',
  'đáng',
  'should',
  'must',
  'recommend*',
  'suggest*',
  'please',
  'advis*',
];
const DECISION_WORDS = [
  'duyệt',
  'phê duyệt',
  'chấp thuận',
  'chấp nhận',
  'từ chối',
  'bác bỏ',
  'đồng ý',
  'xử lý',
  'approv*',
  'reject*',
  'deny',
  'denied',
  'grant*',
];
/** Words that ask: advice only right before a decision ("Đề nghị phê duyệt"); "<người> đề nghị <phần mềm>" is the template. */
const ASKING_WORDS = ['đề nghị', 'đề xuất'];

/**
 * The same checks on text written without diacritics, read after the marks are removed and đ is read as d. They are narrower,
 * since words collide once the marks are gone: đang/đáng, hay/hãy, nền/nên, khó khăn/khẩn, gặp/gấp, and "nền tảng xử lý".
 */
const FOLDED_ADVICE_PHRASES = [
  'uu tien',
  'rui ro',
  'khan cap',
  'khan truong',
  'truoc tien',
  'quan trong nhat',
  'duyet ngay',
  'duyet gap',
  'tu choi ngay',
  'chap thuan ngay',
  'phe duyet som',
  'xu ly ngay',
  'xu ly gap',
  'som nhat',
  'cang som cang tot',
  'hay duyet',
  'hay phe duyet',
  'hay chap thuan',
  'hay chap nhan',
];
const FOLDED_ADVISORY_WORDS = ['nen', 'khuyen', 'khuyen nghi', 'kien nghi'];
const FOLDED_DECISION_WORDS = ['duyet', 'phe duyet', 'chap thuan', 'chap nhan', 'tu choi', 'bac bo', 'dong y'];
const FOLDED_ASKING_WORDS = ['de nghi', 'de xuat'];

const FORBIDDEN_CLAIM_PHRASES = [
  'vi phạm',
  'gian lận',
  'kỷ luật',
  'bất thường',
  'sai phạm',
  'lỗi của',
  'đã được duyệt',
  'đã duyệt',
  'đã từ chối',
  'đã hoàn tất',
  'đã cấp',
  'đã thu hồi',
  'đã phê duyệt',
  'đã được phê duyệt',
  'đã chấp thuận',
  'đã bị từ chối',
  'đã hoàn thành',
  'has been approved',
  'has been rejected',
  'violation',
  'fraud',
];

/** A letter, a numeral or `_`: what Python's `\w` matches in a `str` pattern. */
const WORD = '[\\p{L}\\p{N}_]';
const PLACEHOLDER = /\{\{[^{}]*\}\}/g;
const URL = new RegExp(`https?://|(?<!${WORD})www\\.|\\]\\(`, 'iu');
const UNITS = new RegExp(
  `%|(?<!${WORD})(?:usd|vnd|eur|dollars?|euros?|percent|triệu|tỷ|nghìn|ngàn|phần trăm)(?!${WORD})`,
  'gu',
);
/**
 * A numeral as Python's `str.isnumeric` reads it: every character of a numeric category, and the 81 ideographs that have a numeric
 * value without one (三, 百, 萬…), listed from Unicode 15 (Python 3.12) since JavaScript has no property for the numeric type.
 */
const NUMERAL =
  /[\p{N}\u{3405}\u{3483}\u{382A}\u{3B4D}\u{4E00}\u{4E03}\u{4E07}\u{4E09}\u{4E5D}\u{4E8C}\u{4E94}\u{4E96}\u{4EBF}-\u{4EC0}\u{4EDF}\u{4EE8}\u{4F0D}\u{4F70}\u{5104}\u{5146}\u{5169}\u{516B}\u{516D}\u{5341}\u{5343}-\u{5345}\u{534C}\u{53C1}-\u{53C4}\u{56DB}\u{58F1}\u{58F9}\u{5E7A}\u{5EFE}-\u{5EFF}\u{5F0C}-\u{5F0E}\u{5F10}\u{62FE}\u{634C}\u{67D2}\u{6F06}\u{7396}\u{767E}\u{8086}\u{842C}\u{8CAE}\u{8CB3}\u{8D30}\u{9621}\u{9646}\u{964C}\u{9678}\u{96F6}\u{F96B}\u{F973}\u{F978}\u{F9B2}\u{F9D1}\u{F9D3}\u{F9FD}\u{20001}\u{20064}\u{200E2}\u{20121}\u{2092A}\u{20983}\u{2098C}\u{2099C}\u{20AEA}\u{20AFD}\u{20B19}\u{22390}\u{22998}\u{23B1B}\u{2626D}\u{2F890}]/u;
/** Lower-case Cyrillic letters that look like Latin ones, read as the Latin letter. */
const CONFUSABLES: Readonly<Record<string, string>> = {
  о: 'o',
  е: 'e',
  а: 'a',
  р: 'p',
  с: 'c',
  х: 'x',
  у: 'y',
  і: 'i',
  ѕ: 's',
  ј: 'j',
};
const CONFUSABLE = new RegExp(`[${Object.keys(CONFUSABLES).join('')}]`, 'gu');

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** NFKC, invisible format characters removed (or read as a space), white space collapsed, lower case, look-alikes read as Latin. */
function fold(text: string, separators: boolean): string {
  return text
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, separators ? ' ' : '')
    .replace(/\s+/gu, ' ')
    .toLowerCase()
    .replace(CONFUSABLE, (letter) => CONFUSABLES[letter] ?? letter);
}

function phraseRegex(phrases: readonly string[]): RegExp {
  const parts = phrases.map((phrase) => {
    const stem = phrase.endsWith('*');
    const body = escapeRegExp(fold(stem ? phrase.slice(0, -1) : phrase, false));

    return `(?<!${WORD})${body}${stem ? `${WORD}*` : `(?!${WORD})`}`;
  });

  return new RegExp(parts.join('|'), 'u');
}

/** A folded text without its combining marks, đ read as d: "nên được duyệt" reads "nen duoc duyet". */
const stripMarks = (folded: string) =>
  folded
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/đ/gu, 'd');

function terms(words: readonly string[]): string {
  const alternatives = words.map((word) => {
    const stem = word.endsWith('*');

    return `${escapeRegExp(fold(stem ? word.slice(0, -1) : word, false))}${stem ? `${WORD}*` : ''}`;
  });

  return `(?:${alternatives.join('|')})`;
}

/**
 * The phrases; a word of advice then a decision at most two words later; a word that asks right before a decision, "được" or
 * "cho" allowed between. Words are separated by the single space the fold leaves.
 */
function adviceRegex(
  phrases: readonly string[],
  advisory: readonly string[],
  decisions: readonly string[],
  asking: readonly string[],
): RegExp {
  const decision = `${terms(decisions)}(?!${WORD})`;
  const advised = `(?<!${WORD})${terms(advisory)}(?: ${WORD}+){0,2} ${decision}`;
  const asked = `(?<!${WORD})${terms(asking)} (?:được |duoc |cho )?${decision}`;

  return new RegExp([phraseRegex(phrases).source, advised, asked].join('|'), 'u');
}

const ADVICE = adviceRegex(ADVICE_PHRASES, ADVISORY_WORDS, DECISION_WORDS, ASKING_WORDS);
const FOLDED_ADVICE = adviceRegex(
  FOLDED_ADVICE_PHRASES,
  FOLDED_ADVISORY_WORDS,
  FOLDED_DECISION_WORDS,
  FOLDED_ASKING_WORDS,
);
const FORBIDDEN = phraseRegex(FORBIDDEN_CLAIM_PHRASES);

/** The maximal runs of numerals (digits of any script, fractions, roman numerals), compared as whole tokens. */
function numericRuns(text: string): Set<string> {
  const runs = new Set<string>();
  let current = '';
  for (const character of text) {
    if (NUMERAL.test(character)) {
      current += character;
    } else if (current !== '') {
      runs.add(current);
      current = '';
    }
  }
  if (current !== '') runs.add(current);

  return runs;
}

const units = (text: string) => new Set(fold(text, false).match(UNITS) ?? []);
const hasExtra = (found: ReadonlySet<string>, allowed: ReadonlySet<string>) =>
  [...found].some((item) => !allowed.has(item));

function languageCodes(text: string): Set<RejectionCode> {
  const found = new Set<RejectionCode>();
  for (const variant of [fold(text, false), fold(text, true)]) {
    if (ADVICE.test(variant) || FOLDED_ADVICE.test(stripMarks(variant))) found.add('ADVICE_LANGUAGE');
    if (FORBIDDEN.test(variant)) found.add('FORBIDDEN_CLAIM');
  }

  return found;
}

/** The text the numbers of a line are read against: the fields of its own source. */
function sourceText(source: QueueRequestItem): string {
  return [source.softwareName, source.reason, source.beneficiaryDisplayName, source.requestedDurationLabel ?? '']
    .join(' ')
    .normalize('NFC');
}

/** A placeholder other than the cost of this spend line, or a brace left over. */
function hasBadPlaceholder(summary: string, source: QueueRequestItem): boolean {
  const allowed =
    source.estimatedCostRef !== null && source.stepKind === 'SPEND_APPROVAL'
      ? `{{cost:${source.estimatedCostRef}}}`
      : null;
  if ((summary.match(PLACEHOLDER) ?? []).some((token) => token !== allowed)) return true;
  const text = summary.replace(PLACEHOLDER, ' ');

  return text.includes('{{') || text.includes('}}');
}

/** Nothing left to show once the text is NFKC, without its invisible format characters and trimmed. */
const isBlank = (summary: string) =>
  summary
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .trim() === '';

function lineCodes(item: SummaryItem, source: QueueRequestItem): Set<RejectionCode> {
  const found = languageCodes(item.summary);
  if (isBlank(item.summary)) found.add('EMPTY_SUMMARY');
  if (item.stepKind !== source.stepKind) found.add('STEP_KIND_MISMATCH');
  if (URL.test(item.summary)) found.add('URL_PRESENT');
  if (hasBadPlaceholder(item.summary, source)) found.add('BAD_PLACEHOLDER');
  const text = item.summary.replace(PLACEHOLDER, ' ');
  const allowed = sourceText(source);
  if (hasExtra(numericRuns(text.normalize('NFC')), numericRuns(allowed)) || hasExtra(units(text), units(allowed))) {
    found.add('INVENTED_NUMBER');
  }

  return found;
}

/** Checks every line the model wrote against the context that was sent. */
export function validateQueueSummary(context: QueueContext, parsed: QueueSummaryParsed): QueueValidation {
  const order = new Map(context.requests.map((request, index) => [request.sourceRef, index]));
  const sources = new Map(context.requests.map((request) => [request.sourceRef, request]));
  const seen = new Set<string>();
  const accepted: SummaryItem[] = [];
  const rejections: QueueRejection[] = [];
  for (const item of parsed.items) {
    const source = sources.get(item.sourceRef);
    if (source === undefined) {
      rejections.push({ code: 'UNKNOWN_SOURCE_REF', sourceRef: item.sourceRef });
      continue;
    }
    const found = lineCodes(item, source);
    if (seen.has(item.sourceRef)) found.add('DUPLICATE_SOURCE_REF');
    seen.add(item.sourceRef);
    if (found.size === 0) accepted.push(item);
    else rejections.push(...[...found].sort().map((code) => ({ code, sourceRef: item.sourceRef })));
  }
  accepted.sort((a, b) => (order.get(a.sourceRef) ?? 0) - (order.get(b.sourceRef) ?? 0));

  return { accepted, rejections };
}

/** A checked line with the amount of the backend written in place of the placeholder of its cost. */
export function renderCost(
  summary: string,
  costRef: string | null,
  cost: { amount: string; currency: string } | null,
): string {
  if (costRef === null || cost === null) return summary;

  return summary.split(`{{cost:${costRef}}}`).join(`${cost.amount} ${cost.currency}`);
}
