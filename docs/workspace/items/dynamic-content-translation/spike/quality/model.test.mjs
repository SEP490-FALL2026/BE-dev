import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

test('model.mjs has no textual language-prefix path left and goes through the adapter', () => {
  const src = fs.readFileSync(path.join(here, 'lib', 'model.mjs'), 'utf8');
  assert.ok(!/EN_VI_PREFIX/.test(src));
  assert.ok(!/prefix\s*\+/.test(src), 'no string concatenation of a prefix');
  assert.ok(!/translateBatch/.test(src));
  assert.match(src, /generate-adapter\.mjs/);
});

test('pipeline and benchmark runner use translateSegment, not translateBatch', () => {
  for (const f of ['lib/pipeline.mjs', 'run-benchmark.mjs']) {
    const src = fs.readFileSync(path.join(here, f), 'utf8');
    assert.ok(!/translateBatch/.test(src), f);
  }
});

test('REAL: loadDirection wraps the adapter for en-vi (countTokens includes the language token)', { skip: process.env.SPIKE_REAL === '1' ? false : 'set SPIKE_REAL=1' }, async () => {
  const { resolveDirs, loadTransformers, loadDirection } = await import('./lib/model.mjs');
  const { depsDir, modelsDir } = resolveDirs();
  const { mod } = await loadTransformers(depsDir);
  const m = await loadDirection({ direction: 'en-vi', mod, modelsDir, sessionOptions: { intraOpNumThreads: 1, interOpNumThreads: 1 } });
  assert.ok(m.loadMs > 0);
  assert.equal(typeof m.handle.langTokenId, 'number');
  const n = m.countTokens('The license will expire at the end of this month.');
  assert.equal(n, 13, 'lang token + 11 sentence tokens + </s>');
  const r = await m.translateSegment('The license will expire at the end of this month.');
  assert.equal(r.finishReason, 'eos');
  await m.dispose();
});
