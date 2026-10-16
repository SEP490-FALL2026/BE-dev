// Placeholder protection (pure). Replaces spans that must not be machine-translated
// (names, software, emails, URLs, codes, dates, amounts, glossary terms, and text that
// already looks like a placeholder) with <xN>, then restores them after translation.
// Dates (numeric and textual) are restored VERBATIM; date localisation is out of scope.
import { GLOSSARY, compileGlossary, NEXT_UPPER_OK } from './glossary.mjs';

const PLACEHOLDER_RE = /<x(\d+)>/g;
const WORD_CHAR = /[\p{L}\p{N}]/u;

// Priority classes: lower number wins an overlap.
const PRIO = { collision: 0, url: 1, email: 1, code: 2, known: 3, date: 4, number: 5, glossary: 6 };

const MONTHS_EN = [
  ['January', 'Jan'], ['February', 'Feb'], ['March', 'Mar'], ['April', 'Apr'], ['May', 'May'], ['June', 'Jun'],
  ['July', 'Jul'], ['August', 'Aug'], ['September', 'Sep', 'Sept'], ['October', 'Oct'], ['November', 'Nov'], ['December', 'Dec'],
];
const MONTH_ALT = MONTHS_EN.flatMap((m) => m).join('|');

const DAY = '(?:0?[1-9]|[12]\\d|3[01])';
const MONTH = '(?:0?[1-9]|1[0-2])';
const NB = '(?<![\\p{L}\\p{N}])'; // not preceded by letter/digit
const NA = '(?![\\p{L}\\p{N}])'; // not followed by letter/digit

const RE = {
  collision: /<x\d+>/gu,
  url: /https?:\/\/[^\s<>"']+/gu,
  email: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu,
  code: new RegExp(`${NB}[A-Z]{2,}-\\d{2,}(?:-\\d+)*${NA}`, 'gu'),
  dateNumeric: [
    new RegExp(`(?<![\\p{L}\\p{N}./,-])${DAY}([/.-])${MONTH}\\1\\d{4}(?![\\p{N}])`, 'gu'),
    new RegExp(`(?<![\\p{L}\\p{N}./,-])${DAY}/${MONTH}/\\d{2}(?![\\p{N}/])`, 'gu'),
    new RegExp(`(?<![\\p{L}\\p{N}./,-])\\d{4}-${MONTH}-${DAY}(?![\\p{N}])`, 'gu'),
    new RegExp(`(?<![\\p{L}\\p{N}./,-])${DAY}/${MONTH}(?![\\p{N}/])`, 'gu'),
  ],
  dateVi: new RegExp(`(?<![\\p{L}\\p{N}])(?:ngày\\s+)?(${DAY})\\s+tháng\\s+(${MONTH})(?:\\s+năm\\s+(\\d{4}))?${NA}`, 'giu'),
  // The optional dot after an abbreviated month is only consumed when a day follows ("Nov. 15"),
  // so a sentence-final period ("by 3 Feb.") stays outside the span.
  dateEn1: new RegExp(`${NB}(${MONTH_ALT})(?:\\.(?=\\s+\\d))?\\s+(${DAY})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?${NA}`, 'gu'),
  dateEn2: new RegExp(`${NB}(${DAY})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_ALT})(?:,?\\s+(\\d{4}))?${NA}`, 'gu'),
  number: new RegExp(
    '(?<![\\p{L}\\p{N}.,])(?:[$€£₫]\\s?)?\\d+(?:[.,]\\d+)*' +
      '(?:\\s?(?:triệu|nghìn|ngàn|million|thousand))?' +
      '(?:\\s?(?:%|₫|VND|USD|EUR|đồng|đ))?' +
      NA,
    'gu',
  ),
};

function boundaryOk(text, start, end) {
  const before = start > 0 ? text[start - 1] : '';
  const after = end < text.length ? text[end] : '';
  const first = text[start];
  const last = text[end - 1];
  if (WORD_CHAR.test(first) && before && WORD_CHAR.test(before)) return false;
  if (WORD_CHAR.test(last) && after && WORD_CHAR.test(after)) return false;
  return true;
}

function collect(text, direction, { knownTerms, glossaryRules, protectNumbers }) {
  const [srcLang] = direction.split('-');
  const cands = [];
  const add = (start, end, kind, extra = {}) =>
    cands.push({ start, end, kind, prio: PRIO[kind], original: text.slice(start, end), ...extra });

  for (const m of text.matchAll(RE.collision)) add(m.index, m.index + m[0].length, 'collision');
  for (const m of text.matchAll(RE.url)) {
    const trimmed = m[0].replace(/[.,;:!?)\]]+$/u, '');
    add(m.index, m.index + trimmed.length, 'url');
  }
  for (const m of text.matchAll(RE.email)) add(m.index, m.index + m[0].length, 'email');
  for (const m of text.matchAll(RE.code)) add(m.index, m.index + m[0].length, 'code');

  const terms = [...new Set(knownTerms)].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(term, from);
      if (i === -1) break;
      if (boundaryOk(text, i, i + term.length)) add(i, i + term.length, 'known');
      from = i + 1;
    }
  }

  for (const re of RE.dateNumeric) for (const m of text.matchAll(re)) add(m.index, m.index + m[0].length, 'date');
  if (srcLang === 'vi') {
    for (const m of text.matchAll(RE.dateVi)) add(m.index, m.index + m[0].length, 'date');
  } else {
    for (const m of text.matchAll(RE.dateEn1)) add(m.index, m.index + m[0].length, 'date');
    for (const m of text.matchAll(RE.dateEn2)) add(m.index, m.index + m[0].length, 'date');
  }

  if (protectNumbers) for (const m of text.matchAll(RE.number)) add(m.index, m.index + m[0].length, 'number');

  for (const { entry, regex, nextUpper } of glossaryRules) {
    for (const m of text.matchAll(regex)) {
      const end = m.index + m[0].length;
      if (nextUpper && !NEXT_UPPER_OK.test(text.slice(end))) continue;
      add(m.index, end, 'glossary', { entry });
    }
  }
  return cands;
}

function selectSpans(cands, length) {
  const taken = new Uint8Array(length);
  const chosen = [];
  const ordered = [...cands].sort((a, b) => a.prio - b.prio || b.end - b.start - (a.end - a.start) || a.start - b.start);
  for (const c of ordered) {
    let free = true;
    for (let i = c.start; i < c.end; i++) {
      if (taken[i]) {
        free = false;
        break;
      }
    }
    if (!free) continue;
    for (let i = c.start; i < c.end; i++) taken[i] = 1;
    chosen.push(c);
  }
  return chosen.sort((a, b) => a.start - b.start);
}

// protectSegment(text, { direction, knownTerms, glossary, protectNumbers })
// -> { text: protected text, spans: [{ id, kind, original, value?, entry? }] }
export function protectSegment(text, opts) {
  const { direction, knownTerms = [], glossary = GLOSSARY, protectNumbers = true } = opts;
  const glossaryRules = compileGlossary(glossary, direction);
  const chosen = selectSpans(collect(text, direction, { knownTerms, glossaryRules, protectNumbers }), text.length);
  let out = '';
  let pos = 0;
  const spans = chosen.map((c, id) => {
    out += text.slice(pos, c.start) + `<x${id}>`;
    pos = c.end;
    const span = { id, kind: c.kind, original: c.original };
    if (c.entry) span.entry = c.entry;
    return span;
  });
  out += text.slice(pos);
  return { text: out, spans };
}

const AUX_BEFORE = /(?:^|[^\p{L}])(?:be|is|are|was|were|been|being|get|gets|got|has|have|had)\s+$/iu;
const DET_BEFORE = /(?:^|[^\p{L}])(?:the|a|an|of|for|its|their|your|our|this|that|upon|any|no|each|every|before|after)\s+$/iu;

function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function spanValue(span, tgtLang, before) {
  if (span.kind !== 'glossary') return span.original;
  const { entry } = span;
  if (entry.keep) return span.original;
  const side = entry[tgtLang];
  let out = side.out;
  if (tgtLang === 'en') {
    if (side.pp && AUX_BEFORE.test(before)) out = side.pp;
    else if (side.noun && DET_BEFORE.test(before)) out = side.noun;
  }
  const srcFirst = span.original.charAt(0);
  if (!entry.fixedCase && srcFirst !== srcFirst.toLowerCase()) out = capitalise(out);
  return out;
}

// Single pass: restored values are never scanned again.
export function restoreSegment(translated, spans, { direction }) {
  const tgtLang = direction.split('-')[1];
  const byId = new Map(spans.map((s) => [s.id, s]));
  return translated.replace(PLACEHOLDER_RE, (match, idStr, offset, whole) => {
    const span = byId.get(Number(idStr));
    if (!span) return match;
    return spanValue(span, tgtLang, whole.slice(0, offset));
  });
}

// The gate: the translated segment must contain exactly the placeholders it was given.
export function checkPlaceholders(translated, spans) {
  const expected = new Set(spans.map((s) => s.id));
  const counts = new Map();
  for (const m of translated.matchAll(PLACEHOLDER_RE)) {
    const id = Number(m[1]);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const missing = [...expected].filter((id) => !counts.has(id));
  const extra = [...counts.keys()].filter((id) => !expected.has(id));
  const duplicated = [...counts.entries()].filter(([id, c]) => expected.has(id) && c > 1).map(([id]) => id);
  return { ok: missing.length === 0 && extra.length === 0 && duplicated.length === 0, missing, extra, duplicated };
}

// True when removing placeholders and punctuation leaves nothing for the model to translate.
export function isPlaceholderOnly(protectedText) {
  if (!PLACEHOLDER_RE.test(protectedText)) {
    PLACEHOLDER_RE.lastIndex = 0;
    return false;
  }
  PLACEHOLDER_RE.lastIndex = 0;
  return !/[\p{L}\p{N}]/u.test(protectedText.replace(PLACEHOLDER_RE, ''));
}
