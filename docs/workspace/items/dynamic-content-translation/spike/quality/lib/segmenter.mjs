// Sentence segmenter (pure). Splits a field into sentences so each is translated on
// its own (whole paragraphs degenerate into repetition with Opus-MT).
// segmentText() returns [{ text, sep }]: `sep` is the original whitespace that
// followed the segment, so joinSegments() can rebuild the layout (newlines kept).

// Lower-case, without the final dot. Abbreviations never end a sentence.
export const ABBREVIATIONS = new Set([
  // Vietnamese
  'ts', 'ths', 'pgs', 'gs', 'bs', 'ks', 'tp', 'q', 'p', 'tr', 'v.v', 'đ',
  // English
  'mr', 'mrs', 'ms', 'dr', 'prof', 'vs', 'e.g', 'i.e', 'etc', 'inc', 'ltd', 'co', 'approx', 'st', 'jr', 'sr', 'fig', 'cf',
]);

const BOUNDARY = /([.!?…]+["')\]”’]*)([ \t]+)/gu;
const SENTENCE_START = /^[\p{Lu}\p{N}"'“‘(\[]/u;

function isAbbreviation(textBeforeAndIncludingPunct) {
  const m = /([^\s]+)$/u.exec(textBeforeAndIncludingPunct);
  if (!m) return false;
  // strip leading opening punctuation and the trailing run of terminators/closers
  const token = m[1].replace(/^["'“‘(\[]+/u, '');
  if (!/\.["')\]”’]*$/u.test(token) || /[!?…]/u.test(token.slice(-3))) return false;
  const bare = token.replace(/["')\]”’]*$/u, '').replace(/\.$/u, '').toLowerCase();
  return ABBREVIATIONS.has(bare);
}

function splitLine(line) {
  const out = [];
  let start = 0;
  BOUNDARY.lastIndex = 0;
  let m;
  while ((m = BOUNDARY.exec(line)) !== null) {
    const endOfPunct = m.index + m[1].length;
    const next = line.slice(endOfPunct + m[2].length);
    if (!SENTENCE_START.test(next)) continue;
    if (isAbbreviation(line.slice(start, endOfPunct))) continue;
    out.push({ text: line.slice(start, endOfPunct), sep: m[2] });
    start = endOfPunct + m[2].length;
  }
  if (start < line.length) out.push({ text: line.slice(start), sep: '' });
  return out;
}

export function segmentText(input) {
  const src = String(input);
  const segments = [];
  // Split into lines keeping the whitespace run that contains a newline as separator.
  const lineRe = /[ \t]*\r?\n\s*/gu;
  let last = 0;
  const pieces = [];
  let m;
  while ((m = lineRe.exec(src)) !== null) {
    pieces.push({ line: src.slice(last, m.index), sep: m[0] });
    last = m.index + m[0].length;
  }
  pieces.push({ line: src.slice(last), sep: '' });
  for (const { line, sep } of pieces) {
    const trimmed = line.replace(/^[ \t]+/u, '').replace(/[ \t]+$/u, '');
    if (trimmed === '') continue;
    const parts = splitLine(trimmed);
    parts.forEach((p, i) => {
      segments.push({ text: p.text, sep: i === parts.length - 1 ? sep : p.sep });
    });
  }
  // Final segment carries no trailing separator.
  if (segments.length) segments[segments.length - 1].sep = '';
  return segments;
}

export function joinSegments(segments) {
  return segments.map((s) => s.text + (s.sep ?? '')).join('');
}

// ---- clause splitting by real token count ---------------------------------------------------------------------------
// A sentence longer than the token limit is cut at clause boundaries: after `;` or `,` followed by whitespace, or before
// a conjunction word. Cut points are found on the (already placeholder-protected) text; none of these characters occur
// inside an <xN> placeholder, so a placeholder is never split. Clauses are then packed greedily so the pieces are as long
// as the limit allows. If a single clause is still over the limit the segment cannot be translated safely: TOO_LONG.
const CONJUNCTIONS = [
  // Vietnamese
  'và', 'nhưng', 'vì', 'nên', 'hoặc', 'còn', 'nếu', 'tuy', 'mặc dù', 'trong khi', 'để', 'do đó', 'vì vậy',
  // English
  'and', 'but', 'because', 'so', 'or', 'while', 'although', 'though', 'which', 'where', 'when', 'if', 'since', 'unless',
];
const CONJ_ALT = CONJUNCTIONS.map((c) => c.replace(/ /gu, '\\s+')).join('|');
const CUT_RE = new RegExp(`([;,])(\\s+)|(\\s+)(?=(?:${CONJ_ALT})(?![\\p{L}\\p{N}_]))`, 'giu');

// splitToLimit(text, countTokens, maxTokens) -> { ok: true, pieces: [{ text, sep }] } | { ok: false, reason: 'TOO_LONG' }
// Concatenating text + sep over the pieces gives back `text` exactly; the last piece has sep ''.
export function splitToLimit(text, countTokens, maxTokens) {
  if (countTokens(text) <= maxTokens) return { ok: true, pieces: [{ text, sep: '' }] };
  // atomic clauses as index ranges
  const clauses = [];
  let start = 0;
  CUT_RE.lastIndex = 0;
  let m;
  while ((m = CUT_RE.exec(text)) !== null) {
    const punct = m[1] !== undefined;
    const end = punct ? m.index + 1 : m.index; // the delimiter stays with the left clause
    const ws = punct ? m[2] : m[3];
    const next = m.index + m[0].length;
    if (end > start) clauses.push({ s: start, e: end, sepEnd: punct ? m.index + 1 + ws.length : next });
    else continue;
    start = punct ? m.index + 1 + ws.length : next;
    if (m[0].length === 0) CUT_RE.lastIndex++;
  }
  if (start < text.length) clauses.push({ s: start, e: text.length, sepEnd: text.length });
  if (clauses.length < 2) return { ok: false, reason: 'TOO_LONG' };

  const pieces = [];
  let a = 0;
  while (a < clauses.length) {
    if (countTokens(text.slice(clauses[a].s, clauses[a].e)) > maxTokens) return { ok: false, reason: 'TOO_LONG' };
    let b = a;
    while (b + 1 < clauses.length && countTokens(text.slice(clauses[a].s, clauses[b + 1].e)) <= maxTokens) b++;
    const last = b === clauses.length - 1;
    pieces.push({
      text: text.slice(clauses[a].s, clauses[b].e),
      sep: last ? '' : text.slice(clauses[b].e, clauses[b].sepEnd),
    });
    a = b + 1;
  }
  return { ok: true, pieces };
}
