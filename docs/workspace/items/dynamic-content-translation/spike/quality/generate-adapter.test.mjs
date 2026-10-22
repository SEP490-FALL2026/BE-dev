import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadDirection,
  countSourceTokens,
  translateSegment,
  defaultMaxNewTokens,
  MODEL_IDS,
} from './lib/generate-adapter.mjs';

// ---- fakes -------------------------------------------------------------------------------------------------------
class FakeTensor {
  constructor(type, data, dims) {
    this.type = type;
    this.data = data;
    this.dims = dims;
  }
}

const EOS = 0;
const START = { 'vi-en': 900, 'en-vi': 901 };
const LANG_ID = 7; // deliberately not 3: the adapter must look it up

// One word -> one id (100+), then </s>. Good enough to control token counts.
function fakeTokenizer({
  withVie = true,
  vieId = LANG_ID,
  extraLang = [],
  decodeVie = '>>vie<<',
  prefixAware = false,
} = {}) {
  const vocab = new Map([['</s>', EOS]]);
  if (withVie) vocab.set('>>vie<<', vieId);
  for (const [i, t] of extraLang.entries()) vocab.set(t, 2000 + i);
  const encode = (text) => {
    const words = String(text).split(/\s+/).filter(Boolean);
    const ids = words.map((_, i) => 100 + i);
    if (prefixAware && String(text).startsWith('>>vie<<')) ids.unshift(vieId); // simulates a tokenizer that DOES map the prefix
    return [...ids, EOS];
  };
  const tok = (text) => {
    const ids = encode(text);
    return { input_ids: { data: BigInt64Array.from(ids.map(BigInt)), dims: [1, ids.length] } };
  };
  tok.get_vocab = () => vocab;
  tok.decode = (ids) => {
    const id = Number(ids[0]);
    if (id === vieId) return decodeVie;
    return `<${id}>`;
  };
  tok.batch_decode = (out) => [`decoded:${Array.from(out.data ?? out[0], Number).join(',')}`];
  return tok;
}

function writeModelDir({ direction = 'en-vi', config = {}, generation = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-model-'));
  const modelDir = path.join(dir, ...MODEL_IDS[direction].split('/'));
  fs.mkdirSync(modelDir, { recursive: true });
  fs.writeFileSync(
    path.join(modelDir, 'config.json'),
    JSON.stringify({ model_type: 'marian', max_position_embeddings: 512, ...config }),
  );
  fs.writeFileSync(
    path.join(modelDir, 'generation_config.json'),
    JSON.stringify({
      eos_token_id: EOS,
      decoder_start_token_id: START[direction],
      forced_eos_token_id: EOS,
      ...generation,
    }),
  );
  return dir;
}

function fakeTransformers({ tokenizer, generate, version = '9.9.9' } = {}) {
  const calls = { pipeline: [], generate: [] };
  const tf = {
    env: { version },
    Tensor: FakeTensor,
    calls,
    async pipeline(task, id, opts) {
      calls.pipeline.push({ task, id, opts });
      return {
        tokenizer,
        model: {
          async generate(args) {
            calls.generate.push(args);
            return generate(args);
          },
        },
        async dispose() {},
      };
    },
  };
  return tf;
}

const outTensor = (ids) => ({ data: BigInt64Array.from(ids.map(BigInt)), dims: [1, ids.length] });

async function loaded(direction, { tokenizer, generate, config, generation } = {}) {
  const modelsDir = writeModelDir({ direction, config, generation });
  const transformers = fakeTransformers({
    tokenizer: tokenizer ?? fakeTokenizer(),
    generate: generate ?? (() => outTensor([START[direction], 11, EOS])),
  });
  const handle = await loadDirection({ transformers, modelsDir, direction, sessionOptions: { intraOpNumThreads: 1 } });
  return { handle, transformers, modelsDir };
}

const failsClosed = async (direction, opts, why) => {
  await assert.rejects(
    () => loaded(direction, opts),
    (e) => {
      assert.equal(e.code, 'ADAPTER_ASSUMPTION_FAILED', why);
      return true;
    },
    why,
  );
};

// ---- max_new_tokens rule -------------------------------------------------------------------------------------------
test('default max_new_tokens is min(512, 2*input+16)', () => {
  assert.equal(defaultMaxNewTokens(0), 16);
  assert.equal(defaultMaxNewTokens(10), 36);
  assert.equal(defaultMaxNewTokens(100), 216);
  assert.equal(defaultMaxNewTokens(247), 510);
  assert.equal(defaultMaxNewTokens(248), 512);
  assert.equal(defaultMaxNewTokens(1000), 512);
});

// ---- loadDirection: success and fail-closed -------------------------------------------------------------------------
test('loadDirection en-vi looks the language token up in the vocab (no hard-coded id) and exposes the handle contract', async () => {
  const { handle, transformers } = await loaded('en-vi');
  assert.equal(handle.direction, 'en-vi');
  assert.equal(handle.modelId, 'Xenova/opus-mt-en-vi');
  assert.equal(handle.langTokenId, LANG_ID);
  assert.equal(handle.eosTokenId, EOS);
  assert.equal(handle.decoderStartTokenId, START['en-vi']);
  assert.deepEqual(handle.info, { transformersVersion: '9.9.9', modelId: 'Xenova/opus-mt-en-vi' });
  assert.ok(handle.pipe && handle.tokenizer && handle.model);
  assert.equal(transformers.calls.pipeline[0].task, 'translation');
  assert.equal(transformers.calls.pipeline[0].id, 'Xenova/opus-mt-en-vi');
  assert.deepEqual(transformers.calls.pipeline[0].opts, {
    dtype: 'q8',
    device: 'cpu',
    session_options: { intraOpNumThreads: 1 },
  });
});

test('loadDirection vi-en needs no language token', async () => {
  const { handle } = await loaded('vi-en', { tokenizer: fakeTokenizer({ withVie: false }) });
  assert.equal(handle.langTokenId, null);
  assert.equal(handle.decoderStartTokenId, START['vi-en']);
  assert.equal(handle.info.modelId, 'Xenova/opus-mt-vi-en');
});

test('fail closed: config model_type is not marian', async () => {
  await failsClosed('en-vi', { config: { model_type: 't5' } }, 'model_type');
});

test('fail closed: generation_config lacks a numeric eos_token_id or decoder_start_token_id', async () => {
  await failsClosed('en-vi', { generation: { eos_token_id: undefined } }, 'eos missing');
  await failsClosed('en-vi', { generation: { eos_token_id: '0' } }, 'eos string');
  await failsClosed('en-vi', { generation: { decoder_start_token_id: null } }, 'start null');
});

test('fail closed: en-vi vocab has no >>vie<< token', async () => {
  await failsClosed('en-vi', { tokenizer: fakeTokenizer({ withVie: false }) }, 'no vie');
});

test('fail closed: the >>vie<< id does not decode back to >>vie<<', async () => {
  await failsClosed('en-vi', { tokenizer: fakeTokenizer({ decodeVie: '<unk>' }) }, 'decode mismatch');
});

test('fail closed: a tokenizer that already maps the prefix (probe encoding starts with the language id) is rejected', async () => {
  // If encoding WITHOUT a prefix starts with the language id, prepending it again would double the token.
  const tok = fakeTokenizer();
  const base = tok;
  const wrapped = (text) => {
    const r = base(text);
    const ids = [LANG_ID, ...Array.from(r.input_ids.data, Number)];
    return { input_ids: { data: BigInt64Array.from(ids.map(BigInt)), dims: [1, ids.length] } };
  };
  Object.assign(wrapped, { get_vocab: base.get_vocab, decode: base.decode, batch_decode: base.batch_decode });
  await failsClosed('en-vi', { tokenizer: wrapped }, 'double prefix');
});

test('fail closed: vi-en vocab exposes a >>xxx<< target token (the model would need a language token)', async () => {
  await failsClosed(
    'vi-en',
    { tokenizer: fakeTokenizer({ withVie: false, extraLang: ['>>eng<<'] }) },
    'vi-en needs target token',
  );
});

test('fail closed: encoded input does not end with </s> (source token count would be wrong)', async () => {
  const tok = fakeTokenizer();
  const wrapped = (text) => {
    const r = tok(text);
    const ids = Array.from(r.input_ids.data, Number).slice(0, -1);
    return { input_ids: { data: BigInt64Array.from(ids.map(BigInt)), dims: [1, ids.length] } };
  };
  Object.assign(wrapped, { get_vocab: tok.get_vocab, decode: tok.decode, batch_decode: tok.batch_decode });
  await failsClosed('en-vi', { tokenizer: wrapped }, 'no eos at end');
});

test('fail closed: unknown direction', async () => {
  await assert.rejects(
    () =>
      loadDirection({
        transformers: fakeTransformers({ tokenizer: fakeTokenizer() }),
        modelsDir: writeModelDir(),
        direction: 'fr-en',
      }),
    (e) => e.code === 'ADAPTER_ASSUMPTION_FAILED',
  );
});

// ---- countSourceTokens ---------------------------------------------------------------------------------------------
test('countSourceTokens includes the language token (en-vi) and the trailing </s>', async () => {
  const en = (await loaded('en-vi')).handle;
  const vi = (await loaded('vi-en', { tokenizer: fakeTokenizer({ withVie: false }) })).handle;
  assert.equal(countSourceTokens(en, 'one two three'), 3 + 1 + 1);
  assert.equal(countSourceTokens(vi, 'one two three'), 3 + 1);
});

// ---- translateSegment ----------------------------------------------------------------------------------------------
test('translateSegment: builds [lang, ...ids, </s>] input, default budget, plain-array criteria, forced EOS disabled', async () => {
  const { handle, transformers } = await loaded('en-vi', { generate: () => outTensor([START['en-vi'], 11, 12, EOS]) });
  const crit = () => [false];
  const r = await translateSegment(handle, 'one two three', { stoppingCriteria: [crit] });
  const args = transformers.calls.generate[0];
  assert.deepEqual(Array.from(args.input_ids.data, Number), [LANG_ID, 100, 101, 102, EOS]);
  assert.deepEqual(args.input_ids.dims, [1, 5]);
  assert.deepEqual(Array.from(args.attention_mask.data, Number), [1, 1, 1, 1, 1]);
  assert.equal(args.max_new_tokens, defaultMaxNewTokens(5));
  assert.ok(Array.isArray(args.stopping_criteria), 'criteria must be a plain array');
  assert.deepEqual(args.stopping_criteria, [crit]);
  assert.equal(args.forced_eos_token_id, null, 'forced EOS would turn a budget truncation into an EOS-ended sequence');
  assert.equal(r.inputTokens, 5);
  assert.equal(r.generatedTokens, 3, 'decoder start token is not counted');
  assert.equal(r.text, 'decoded:901,11,12,0');
  assert.equal(r.finishReason, 'eos');
  assert.equal(r.endedWithEos, true);
});

test('translateSegment: vi-en input has no language token', async () => {
  const { handle, transformers } = await loaded('vi-en', { tokenizer: fakeTokenizer({ withVie: false }) });
  await translateSegment(handle, 'a b', {});
  assert.deepEqual(Array.from(transformers.calls.generate[0].input_ids.data, Number), [100, 101, EOS]);
  assert.deepEqual(transformers.calls.generate[0].stopping_criteria, []);
});

test('finishReason: EOS exactly at the last allowed position counts as eos', async () => {
  const { handle } = await loaded('vi-en', {
    tokenizer: fakeTokenizer({ withVie: false }),
    generate: () => outTensor([START['vi-en'], 11, 12, EOS]), // 3 generated tokens, budget 3
  });
  const r = await translateSegment(handle, 'a b', { maxNewTokens: 3 });
  assert.equal(r.generatedTokens, 3);
  assert.equal(r.finishReason, 'eos');
  assert.equal(r.endedWithEos, true);
});

test('finishReason: budget reached without EOS is max_new_tokens', async () => {
  const { handle } = await loaded('vi-en', {
    tokenizer: fakeTokenizer({ withVie: false }),
    generate: () => outTensor([START['vi-en'], 11, 12, 13]),
  });
  const r = await translateSegment(handle, 'a b', { maxNewTokens: 3 });
  assert.equal(r.generatedTokens, 3);
  assert.equal(r.finishReason, 'max_new_tokens');
  assert.equal(r.endedWithEos, false);
});

test('finishReason: a criterion that ends generation early is stopped', async () => {
  const { handle } = await loaded('vi-en', {
    tokenizer: fakeTokenizer({ withVie: false }),
    generate: () => outTensor([START['vi-en'], 11]),
  });
  const r = await translateSegment(handle, 'a b', { maxNewTokens: 50, stoppingCriteria: [() => [true]] });
  assert.equal(r.generatedTokens, 1);
  assert.equal(r.finishReason, 'stopped');
  assert.equal(r.endedWithEos, false);
});

test('finishReason: nothing generated at all is stopped, not eos', async () => {
  const { handle } = await loaded('vi-en', {
    tokenizer: fakeTokenizer({ withVie: false }),
    generate: () => outTensor([START['vi-en']]),
  });
  const r = await translateSegment(handle, 'a b', { maxNewTokens: 5 });
  assert.equal(r.generatedTokens, 0);
  assert.equal(r.finishReason, 'stopped');
});

test('finishReason works with a nested-array generate result as well', async () => {
  const { handle } = await loaded('vi-en', {
    tokenizer: fakeTokenizer({ withVie: false }),
    generate: () => [[START['vi-en'], 11, EOS]],
  });
  const r = await translateSegment(handle, 'a b', { maxNewTokens: 9 });
  assert.equal(r.finishReason, 'eos');
  assert.equal(r.generatedTokens, 2);
});

test('inputs longer than the model position limit are refused before generate()', async () => {
  const { handle, transformers } = await loaded('vi-en', {
    tokenizer: fakeTokenizer({ withVie: false }),
    config: { max_position_embeddings: 8 },
  });
  await assert.rejects(
    () => translateSegment(handle, 'a b c d e f g h i j', {}),
    (e) => e.code === 'INPUT_TOO_LONG',
  );
  assert.equal(transformers.calls.generate.length, 0);
});

// ---- real model (opt-in) -------------------------------------------------------------------------------------------
const REAL = process.env.SPIKE_REAL === '1';
const realOpts = { skip: REAL ? false : 'set SPIKE_REAL=1 (needs SPIKE_DEPS_DIR and the offline models)' };

async function realHandle(direction) {
  const { resolveDirs, loadTransformers } = await import('./lib/model.mjs');
  const { depsDir, modelsDir } = resolveDirs();
  const { mod } = await loadTransformers(depsDir);
  return loadDirection({
    transformers: mod,
    modelsDir,
    direction,
    sessionOptions: { intraOpNumThreads: 1, interOpNumThreads: 1 },
  });
}

test(
  'REAL en-vi: normal sentence ends with eos; tiny budget is detected as max_new_tokens; prefix id comes from the vocab',
  realOpts,
  async () => {
    const h = await realHandle('en-vi');
    assert.equal(typeof h.langTokenId, 'number');
    const ok = await translateSegment(h, 'The license will expire at the end of this month.', {});
    assert.equal(ok.finishReason, 'eos');
    assert.equal(ok.text, 'Giấy phép sẽ hết hạn vào cuối tháng này.');
    const cut = await translateSegment(h, 'The license will expire at the end of this month.', { maxNewTokens: 3 });
    assert.equal(cut.generatedTokens, 3);
    assert.equal(
      cut.finishReason,
      'max_new_tokens',
      'forced_eos_token_id must be disabled, otherwise truncation looks like EOS',
    );
    assert.equal(cut.endedWithEos, false);
    await h.pipe.dispose?.();
  },
);

test('REAL vi-en: normal sentence ends with eos; tiny budget is detected as max_new_tokens', realOpts, async () => {
  const h = await realHandle('vi-en');
  assert.equal(h.langTokenId, null);
  const ok = await translateSegment(h, 'Giấy phép sẽ hết hạn vào cuối tháng này.', {});
  assert.equal(ok.finishReason, 'eos');
  assert.equal(ok.text, 'The pass will expire by the end of the month.');
  const cut = await translateSegment(h, 'Giấy phép sẽ hết hạn vào cuối tháng này.', { maxNewTokens: 3 });
  assert.equal(cut.finishReason, 'max_new_tokens');
  assert.ok(countSourceTokens(h, 'Giấy phép sẽ hết hạn vào cuối tháng này.') >= 10);
  await h.pipe.dispose?.();
});
