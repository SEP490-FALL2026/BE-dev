// Diagnostic: the en->vi vocab contains the single token ">>vie<<" (id 3). transformers.js 3.8.1 emits id 3 for the
// textual prefix; 4.3.1 (@huggingface/tokenizers) splits it into 5 pieces. This probe checks whether prepending
// id 3 manually (tokenize the raw sentence, then [3, ...ids]) restores the 3.8.1 behaviour on 4.x.
// Experiment only, NOT a recommendation. Env: SPIKE_MODELS_DIR, SPIKE_OUT, SPIKE_LABEL.
import fs from 'node:fs';
import path from 'node:path';

const tf = await import('@huggingface/transformers');
const { env, pipeline } = tf;
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useFSCache = false;
env.localModelPath = path.resolve(process.env.SPIKE_MODELS_DIR).replace(/\\/g, '/').replace(/\/?$/, '/');

const INPUTS = [
  'The license will expire at the end of this month.',
  'Please contact support to renew your subscription.',
  'New employees must be granted access to the license management system.',
  'The October invoice has been emailed to the customer.',
  'The enterprise plan includes fifty user licenses.',
  'An administrator can revoke the license of an employee who has left.',
  'Hello, I would like to change my account password.',
  'The contract renews automatically unless a cancellation notice is given.',
  'The software usage report is updated every week.',
  'This device has reached the maximum number of activations.',
];
const tr = await pipeline('translation', 'Xenova/opus-mt-en-vi', { dtype: 'q8', device: 'cpu' });
const vocabId = (await tr.tokenizer('>>vie<<')).input_ids;
const items = [];
for (const raw of INPUTS) {
  const item = { input: raw };
  item.pipelineWithTextPrefix = (await tr(`>>vie<< ${raw}`, { max_new_tokens: 128 }))[0].translation_text;
  try {
    const enc = await tr.tokenizer(raw);
    const ids = Array.from(enc.input_ids.data ?? enc.input_ids, Number);
    const withPrefix = [3, ...ids];
    const input_ids = new tf.Tensor('int64', BigInt64Array.from(withPrefix.map(BigInt)), [1, withPrefix.length]);
    const attention_mask = new tf.Tensor('int64', BigInt64Array.from(withPrefix.map(() => 1n)), [1, withPrefix.length]);
    const out = await tr.model.generate({ input_ids, attention_mask, max_new_tokens: 128 });
    item.manualIdPrefix = tr.tokenizer.batch_decode(out, { skip_special_tokens: true })[0];
    item.manualIdsFirst3 = withPrefix.slice(0, 3);
  } catch (e) {
    item.manualIdPrefixError = String(e?.stack || e).split('\n').slice(0, 3).join(' | ');
  }
  items.push(item);
}
const out = { label: process.env.SPIKE_LABEL || null, version: env.version ?? null, items };
const json = JSON.stringify(out, null, 2) + '\n';
if (process.env.SPIKE_OUT) fs.writeFileSync(process.env.SPIKE_OUT, json);
else process.stdout.write(json);
process.exit(0);
