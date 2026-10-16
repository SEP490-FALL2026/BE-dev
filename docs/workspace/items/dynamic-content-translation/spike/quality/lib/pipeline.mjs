// Translation pipeline prototype (pure; the model is injected).
//
//   sentence split -> protect (placeholders + glossary) -> real-token length check (clause split if > limit)
//   -> translate ONE segment at a time -> finishReason gate -> placeholder gate -> polarity gate -> restore -> join.
//
// WHOLE-FIELD FALLBACK: if any segment fails (TOO_LONG, finishReason !== 'eos', error, placeholder gate, polarity gate)
// the pipeline returns the EXACT original source string (no trimming or normalisation) with status NOT_TRANSLATED and a
// reason. There is no PARTIAL status and no mixed-language output. A null / empty / whitespace-only source is returned
// exactly as given with status NOT_NEEDED, reason SOURCE_EMPTY, and the model is not called.
//
// Raw mode (comparison only): sentence split and translate, nothing else; no protection and no gates. Only a model error
// (including a source over the model limit) falls the field back.
import { segmentText, joinSegments, splitToLimit } from './segmenter.mjs';
import { protectSegment, restoreSegment, checkPlaceholders, isPlaceholderOnly } from './protect.mjs';
import { checkPolarity } from './polarity.mjs';
import { GLOSSARY } from './glossary.mjs';

export const DEFAULT_MAX_SEGMENT_TOKENS = 128;

const PLACEHOLDER_RE = /<x(\d+)>/g;
const nowMs = () => performance.now();

const isEmptySource = (text) => text === null || text === undefined || (typeof text === 'string' && text.trim() === '');

// Placeholders back to their original text (used to read the SOURCE of a piece for the polarity gate).
const spansIn = (protectedText, spans) => {
  const ids = new Set([...protectedText.matchAll(PLACEHOLDER_RE)].map((m) => Number(m[1])));
  return spans.filter((s) => ids.has(s.id));
};

// Text for the polarity gate: glossary spans carry their meaning (their cue stays), every other protected span
// (names, e-mails, codes, numbers, dates, software) is blanked so its characters can neither require nor satisfy a cue.
function gateSource(protectedText, spans) {
  const byId = new Map(spans.map((s) => [s.id, s]));
  return protectedText.replace(PLACEHOLDER_RE, (m, id) => {
    const s = byId.get(Number(id));
    return s && s.kind === 'glossary' ? s.original : ' ';
  });
}
function gateOutput(modelText, spans, direction) {
  const glossarySpans = spans.filter((s) => s.kind === 'glossary');
  return restoreSegment(modelText, glossarySpans, { direction }).replace(PLACEHOLDER_RE, ' ');
}

const failure = (text, reason, extra = {}) => ({
  output: text,
  status: 'NOT_TRANSLATED',
  reason,
  ...extra,
});

// opts: { direction: 'vi-en'|'en-vi', mode: 'raw'|'protected', knownTerms, glossary, protectNumbers,
//         translateSegment(text) -> Promise<{ text, finishReason, ... }>, countTokens(text) -> number,
//         maxSegmentTokens = 128 }
export async function translateText(text, opts) {
  const {
    direction,
    mode = 'protected',
    knownTerms = [],
    glossary = GLOSSARY,
    protectNumbers = true,
    translateSegment,
    countTokens,
    maxSegmentTokens = DEFAULT_MAX_SEGMENT_TOKENS,
  } = opts;

  if (isEmptySource(text)) {
    return { output: text, status: 'NOT_NEEDED', reason: 'SOURCE_EMPTY', counts: { total: 0, translated: 0, fallback: 0 }, segments: [], modelCalls: 0, finishReasons: {} };
  }
  if (typeof text !== 'string') throw new TypeError('source must be a string, null or undefined');

  const protectedMode = mode === 'protected';
  const parts = segmentText(text);

  // ---- plan: protect and length-check everything BEFORE the first model call ----------------------------------------------
  const plan = [];
  for (const part of parts) {
    if (!protectedMode) {
      plan.push({ source: part.text, protectedText: part.text, spans: [], sep: part.sep, kind: 'model' });
      continue;
    }
    const prot = protectSegment(part.text, { direction, knownTerms, glossary, protectNumbers });
    const split = splitToLimit(prot.text, countTokens, maxSegmentTokens);
    if (!split.ok) {
      return finish(text, parts.length, failure(text, 'TOO_LONG', { detail: { segment: part.text.slice(0, 80) } }), [], 0, {});
    }
    split.pieces.forEach((piece, i) => {
      const spans = spansIn(piece.text, prot.spans);
      const sep = i === split.pieces.length - 1 ? part.sep : piece.sep;
      if (isPlaceholderOnly(piece.text)) {
        plan.push({ source: part.text, protectedText: piece.text, spans, sep, kind: 'static', output: restoreSegment(piece.text, spans, { direction }) });
      } else {
        plan.push({ source: piece.text, protectedText: piece.text, spans, sep, kind: 'model' });
      }
    });
  }

  // ---- execute: one segment per call, stop at the first failure ----------------------------------------------------------
  const segments = [];
  const finishReasons = {};
  let modelCalls = 0;
  for (const item of plan) {
    if (item.kind === 'static') {
      segments.push({ protectedText: item.protectedText, status: 'static', output: item.output, ms: 0 });
      item.done = item.output;
      continue;
    }
    const t0 = nowMs();
    let res;
    try {
      modelCalls++;
      res = await translateSegment(item.protectedText);
    } catch (e) {
      segments.push({ protectedText: item.protectedText, status: 'error', ms: nowMs() - t0 });
      return finish(text, plan.length, failure(text, 'ERROR', { detail: { code: e?.code ?? e?.name ?? 'Error' } }), segments, modelCalls, finishReasons);
    }
    const ms = nowMs() - t0;
    const reason = res?.finishReason ?? 'unknown';
    finishReasons[reason] = (finishReasons[reason] ?? 0) + 1;
    const rec = { protectedText: item.protectedText, finishReason: reason, inputTokens: res?.inputTokens, generatedTokens: res?.generatedTokens, ms };
    if (typeof res?.text !== 'string') {
      segments.push({ ...rec, status: 'error' });
      return finish(text, plan.length, failure(text, 'ERROR', { detail: { code: 'NO_TEXT' } }), segments, modelCalls, finishReasons);
    }
    if (!protectedMode) {
      segments.push({ ...rec, status: 'ok', output: res.text });
      item.done = res.text;
      continue;
    }
    if (reason !== 'eos') {
      segments.push({ ...rec, status: 'failed' });
      const code = reason === 'max_new_tokens' ? 'MAX_NEW_TOKENS' : 'NOT_EOS';
      return finish(text, plan.length, failure(text, code, { detail: { finishReason: reason } }), segments, modelCalls, finishReasons);
    }
    const gate = checkPlaceholders(res.text, item.spans);
    if (!gate.ok) {
      segments.push({ ...rec, status: 'failed', gate });
      return finish(text, plan.length, failure(text, 'PLACEHOLDER_GATE', { detail: { gate } }), segments, modelCalls, finishReasons);
    }
    const pol = checkPolarity(gateSource(item.protectedText, item.spans), gateOutput(res.text, item.spans, direction), direction);
    if (!pol.ok) {
      segments.push({ ...rec, status: 'failed', polarity: { required: pol.required, missing: pol.missing } });
      return finish(text, plan.length, failure(text, 'QUALITY_GATE', { detail: { polarity: { required: pol.required, missing: pol.missing } } }), segments, modelCalls, finishReasons);
    }
    const out = restoreSegment(res.text, item.spans, { direction });
    segments.push({ ...rec, status: 'ok', output: out });
    item.done = out;
  }

  const output = joinSegments(plan.map((p) => ({ text: p.done, sep: p.sep })));
  const total = plan.length;
  return {
    output,
    status: 'TRANSLATED',
    reason: null,
    counts: { total, translated: total, fallback: 0 },
    segments,
    modelCalls,
    finishReasons,
  };
}

// Whole-field fallback result: the original string, counts with nothing translated, diagnostics kept.
function finish(text, total, fail, segments, modelCalls, finishReasons) {
  return {
    ...fail,
    output: text,
    counts: { total, translated: 0, fallback: total },
    segments,
    modelCalls,
    finishReasons,
  };
}
