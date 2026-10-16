// BASELINE ONLY: the model is loaded in the API process itself (what the spike argues against). Same direct-generate
// path as the worker, no stopping criterion deadline, no process isolation. Shows event-loop stalls during load/run.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { splitSentences } from '../segmenter.mjs';
import { computeMaxNewTokens } from '../deadline-criteria.mjs';

export function createInproc({ depsDir, modelsDir, intraThreads = 1 }) {
  let tf = null;
  const pipes = new Map();
  const loading = new Map();
  async function lib() {
    if (tf) return tf;
    const pkgDir = path.join(depsDir, 'node_modules', '@huggingface', 'transformers');
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
    tf = await import(pathToFileURL(path.resolve(pkgDir, (pkg.exports?.['.']?.node?.import?.default ?? pkg.exports.node.import.default))).href);
    tf.env.allowRemoteModels = false;
    tf.env.allowLocalModels = true;
    tf.env.useFSCache = false;
    tf.env.localModelPath = path.resolve(modelsDir).replace(/\\/g, '/').replace(/\/?$/, '/');
    return tf;
  }
  async function get(direction) {
    if (pipes.has(direction)) return pipes.get(direction);
    if (!loading.has(direction)) {
      loading.set(
        direction,
        (async () => {
          const t = await lib();
          const p = await t.pipeline('translation', `Xenova/opus-mt-${direction}`, { dtype: 'q8', device: 'cpu', session_options: { intraOpNumThreads: intraThreads, interOpNumThreads: 1 } });
          pipes.set(direction, p);
          return p;
        })(),
      );
    }
    return loading.get(direction);
  }
  return {
    async translate(direction, text) {
      const t0 = performance.now();
      const pipe = await get(direction);
      const outs = [];
      for (const seg of splitSentences(text)) {
        const enc = pipe.tokenizer(seg);
        let ids = Array.from(enc.input_ids.data ?? enc.input_ids, Number);
        if (direction === 'en-vi') ids = [3, ...ids];
        const T = tf.Tensor;
        const out = await pipe.model.generate({
          input_ids: new T('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
          attention_mask: new T('int64', BigInt64Array.from(ids.map(() => 1n)), [1, ids.length]),
          max_new_tokens: computeMaxNewTokens(ids.length),
        });
        outs.push(pipe.tokenizer.batch_decode(out, { skip_special_tokens: true })[0]);
      }
      return { text: outs.join(' '), stats: { runMs: performance.now() - t0 } };
    },
  };
}
