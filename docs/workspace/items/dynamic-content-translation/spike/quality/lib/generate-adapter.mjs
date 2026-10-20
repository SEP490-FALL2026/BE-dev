// Shared generate adapter for the Opus-MT (Marian) spike models, transformers.js 3.x and 4.x.
// Spike code, not product code. Imported (read-only) by spike/runtime too: keep the interface stable.
//
//   loadDirection({ transformers, modelsDir, direction, sessionOptions }) -> handle
//   countSourceTokens(handle, text)                                       -> number
//   translateSegment(handle, text, { maxNewTokens, stoppingCriteria })    -> { text, inputTokens, generatedTokens,
//                                                                              endedWithEos, finishReason, maxNewTokens }
//   defaultMaxNewTokens(inputTokens)                                      -> min(512, 2 * inputTokens + 16)
//
// Why this exists (measured, see README):
//  * 4.3.1 never maps the textual ">>vie<<" prefix to the single vocab token, 3.8.1 does. We therefore tokenize the
//    sentence WITHOUT any prefix and prepend the language-token id looked up in the vocab, in both versions.
//  * The generation config of both models has forced_eos_token_id = 0. With it, a sequence cut by max_new_tokens still
//    ends with EOS, so truncation is indistinguishable from completion. generate() is called with
//    forced_eos_token_id: null; then a sequence ends with EOS only when the model produced it.
//  * A StoppingCriteria must be passed as a plain array (a StoppingCriteriaList instance was not invoked).
//  * Batch size is always 1 (padded batches corrupt shorter sequences).
// The adapter FAILS CLOSED: every assumption above is verified at load time and a violation throws
// AdapterError with code ADAPTER_ASSUMPTION_FAILED.
import fs from 'node:fs';
import path from 'node:path';

export const MODEL_IDS = {
  'vi-en': 'Xenova/opus-mt-vi-en',
  'en-vi': 'Xenova/opus-mt-en-vi',
};

// Marian target-language token needed by the multi-target en-vi model.
const LANG_TOKEN_TEXT = { 'en-vi': '>>vie<<' };
const TARGET_TOKEN_RE = /^>>.+<<$/;
const PROBE = {
  'vi-en': 'Giấy phép sẽ hết hạn vào cuối tháng này.',
  'en-vi': 'The license will expire at the end of this month.',
};

export const MAX_NEW_TOKENS_CAP = 512;

export class AdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
  }
}

const assumption = (message) => new AdapterError('ADAPTER_ASSUMPTION_FAILED', message);

/** Default decoder budget: min(512, 2 * inputTokens + 16). */
export function defaultMaxNewTokens(inputTokens) {
  return Math.min(MAX_NEW_TOKENS_CAP, 2 * inputTokens + 16);
}

function readJson(file, what) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw assumption(`cannot read ${what}: ${e.code ?? e.name}`);
  }
}

// transformers.js 4.x: tokenizer.get_vocab() -> Map; 3.x: tokenizer.model.tokens_to_ids (Map).
function vocabEntries(tokenizer) {
  const v = tokenizer.get_vocab?.();
  if (v) return v instanceof Map ? v : new Map(Object.entries(v));
  const m = tokenizer.model?.tokens_to_ids;
  if (m instanceof Map) return m;
  throw assumption('tokenizer exposes no vocabulary');
}

function toIdArray(tensorLike) {
  // transformers.js Tensor: { data: BigInt64Array|number[], dims }; take the first (only) row.
  if (tensorLike && tensorLike.data !== undefined && tensorLike.dims) {
    const all = Array.from(tensorLike.data, Number);
    const rowLen = tensorLike.dims[tensorLike.dims.length - 1];
    return all.slice(0, rowLen);
  }
  if (Array.isArray(tensorLike)) return Array.from(Array.isArray(tensorLike[0]) ? tensorLike[0] : tensorLike, Number);
  throw new AdapterError('ADAPTER_RESULT_UNREADABLE', 'generate() returned an unsupported shape');
}

function encodeIds(tokenizer, text) {
  const enc = tokenizer(text, { truncation: false });
  return toIdArray(enc.input_ids);
}

/** Loads one direction and verifies every assumption (fail closed). */
export async function loadDirection({ transformers, modelsDir, direction, sessionOptions }) {
  const modelId = MODEL_IDS[direction];
  if (!modelId) throw assumption(`unknown direction ${String(direction)}`);
  const modelDir = path.join(modelsDir, ...modelId.split('/'));
  const config = readJson(path.join(modelDir, 'config.json'), 'config.json');
  const gen = readJson(path.join(modelDir, 'generation_config.json'), 'generation_config.json');
  if (config.model_type !== 'marian')
    throw assumption(`config.model_type is ${JSON.stringify(config.model_type)}, expected "marian"`);
  const eosTokenId = gen.eos_token_id;
  const decoderStartTokenId = gen.decoder_start_token_id;
  if (!Number.isInteger(eosTokenId)) throw assumption('generation_config.eos_token_id is not an integer');
  if (!Number.isInteger(decoderStartTokenId))
    throw assumption('generation_config.decoder_start_token_id is not an integer');

  const { env, pipeline } = transformers;
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.useFSCache = false;
  env.localModelPath = modelsDir.endsWith(path.sep) ? modelsDir : modelsDir + path.sep;
  const pipeOptions = { dtype: 'q8', device: 'cpu' };
  if (sessionOptions) pipeOptions.session_options = sessionOptions;
  const pipe = await pipeline('translation', modelId, pipeOptions);
  const { tokenizer, model } = pipe;

  const fail = async (message) => {
    try {
      await pipe.dispose?.();
    } catch {
      /* best effort */
    }
    throw assumption(message);
  };

  const vocab = vocabEntries(tokenizer);
  const targetTokens = [...vocab.keys()].filter((k) => TARGET_TOKEN_RE.test(k));
  let langTokenId = null;
  if (LANG_TOKEN_TEXT[direction]) {
    const text = LANG_TOKEN_TEXT[direction];
    const id = vocab.get(text);
    if (!Number.isInteger(id)) return fail(`vocab has no ${text} token`);
    const back = String(tokenizer.decode([id], { skip_special_tokens: false })).trim();
    if (back !== text) return fail(`id ${id} decodes to ${JSON.stringify(back)}, not ${text}`);
    langTokenId = id;
  } else if (targetTokens.length > 0) {
    // vi-en is a single-target model (Helsinki-NLP/opus-mt-vi-en has no >>xxx<< target tokens). If the vocab ever
    // contained one, the model would need a language token and this adapter would silently be wrong.
    return fail(
      `${direction} vocab contains target-language tokens (${targetTokens.slice(0, 3).join(', ')}), a language token would be required`,
    );
  }

  // Probe: encoding WITHOUT prefix must not already start with the language id (no double prefix) and must end with </s>.
  let probeIds;
  try {
    probeIds = encodeIds(tokenizer, PROBE[direction]);
  } catch (e) {
    return fail(`probe encoding failed: ${e.name}`);
  }
  if (langTokenId !== null && probeIds[0] === langTokenId)
    return fail('encoding without prefix already starts with the language token id');
  if (probeIds[probeIds.length - 1] !== eosTokenId) return fail('encoded input does not end with the EOS token');

  return {
    direction,
    modelId,
    pipe,
    tokenizer,
    model,
    langTokenId,
    eosTokenId,
    decoderStartTokenId,
    maxInputTokens: Number.isInteger(config.max_position_embeddings)
      ? config.max_position_embeddings
      : MAX_NEW_TOKENS_CAP,
    Tensor: transformers.Tensor,
    info: { transformersVersion: transformers.env?.version ?? 'unknown', modelId },
  };
}

function sourceIds(handle, text) {
  const ids = encodeIds(handle.tokenizer, text);
  return handle.langTokenId === null ? ids : [handle.langTokenId, ...ids];
}

/** Number of tokens the model will see: [lang token,] sentence tokens, </s>. */
export function countSourceTokens(handle, text) {
  return sourceIds(handle, text).length;
}

/** Translates ONE segment (batch size 1). */
export async function translateSegment(handle, text, { maxNewTokens, stoppingCriteria = [] } = {}) {
  const ids = sourceIds(handle, text);
  const inputTokens = ids.length;
  if (inputTokens > handle.maxInputTokens) {
    throw new AdapterError(
      'INPUT_TOO_LONG',
      `${inputTokens} source tokens exceed the model limit ${handle.maxInputTokens}`,
    );
  }
  const budget = Number.isInteger(maxNewTokens) && maxNewTokens > 0 ? maxNewTokens : defaultMaxNewTokens(inputTokens);
  const T = handle.Tensor;
  const input_ids = new T('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]);
  const attention_mask = new T('int64', BigInt64Array.from(ids.map(() => 1n)), [1, ids.length]);
  const out = await handle.model.generate({
    input_ids,
    attention_mask,
    max_new_tokens: budget,
    forced_eos_token_id: null, // see header: otherwise a truncated sequence still ends with EOS
    stopping_criteria: [...stoppingCriteria], // PLAIN ARRAY, not a StoppingCriteriaList instance
  });
  const outIds = toIdArray(out);
  const generatedTokens = Math.max(0, outIds.length - 1); // the first id is the decoder start token
  const endedWithEosToken = generatedTokens > 0 && outIds[outIds.length - 1] === handle.eosTokenId;
  const finishReason = endedWithEosToken ? 'eos' : generatedTokens >= budget ? 'max_new_tokens' : 'stopped';
  const decoded = handle.tokenizer.batch_decode(out, { skip_special_tokens: true });
  return {
    text: decoded[0],
    inputTokens,
    generatedTokens,
    endedWithEos: finishReason === 'eos',
    finishReason,
    maxNewTokens: budget,
  };
}
