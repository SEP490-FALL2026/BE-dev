// Offline smoke for @huggingface/transformers: load both local Opus-MT models,
// translate two short sentences each direction, report timings, memory and
// attempted network calls. Copied into the scratch project by setup-candidate.mjs
// (so that `@huggingface/transformers` resolves from the project's node_modules).
//
// Env:
//   SPIKE_MODELS_DIR  dir holding Xenova/opus-mt-vi-en and Xenova/opus-mt-en-vi (read-only is fine)
//   SPIKE_OUT         optional file to also write the JSON result to
//   SPIKE_LABEL       optional label stored in the result
//   SPIKE_SKIP_TRANSLATE=1  only load the library + inspect the install (used for the sharp-absent experiment)
// Output: one line `SPIKE_RESULT {json}` on stdout (exit 0 even on translation failure; see `ok`).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const here = path.dirname(fileURLToPath(import.meta.url));
const modelsDir = process.env.SPIKE_MODELS_DIR;
const result = {
  label: process.env.SPIKE_LABEL || null,
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  user: os.userInfo().username === 'node' ? 'node' : '<user>',
  ok: false,
};

// ---- network attempt counter (remote models are disabled; this proves nothing tries anyway)
const fetchCalls = [];
let envFetchLocalCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (...args) => {
  const u = typeof args[0] === 'string' ? args[0] : args[0]?.url || String(args[0]);
  fetchCalls.push(u.replace(/^(https?:\/\/[^/]+).*$/, '$1'));
  return realFetch(...args);
};

// ---- memory sampling
let peakRss = process.memoryUsage.rss();
const sample = () => {
  const r = process.memoryUsage.rss();
  if (r > peakRss) peakRss = r;
};
const timer = setInterval(sample, 5);
const mb = (b) => +(b / 1048576).toFixed(1);

// ---- install inspection (resolved packages + native binaries actually on disk)
function inspectInstall() {
  const out = { packages: [], onnxruntimeNodeBinaries: [], sharpNative: [] };
  const pnpmDir = path.join(here, 'node_modules', '.pnpm');
  if (!fs.existsSync(pnpmDir)) return out;
  for (const d of fs.readdirSync(pnpmDir)) {
    if (
      /^(sharp|onnxruntime-node|onnxruntime-web|onnxruntime-common|@huggingface\+(tokenizers|jinja|transformers)|@img\+)/.test(
        d,
      )
    )
      out.packages.push(d);
  }
  for (const d of out.packages) {
    if (d.startsWith('onnxruntime-node@')) {
      const bin = path.join(pnpmDir, d, 'node_modules', 'onnxruntime-node', 'bin');
      const walk = (p, rel = '') => {
        if (!fs.existsSync(p)) return;
        for (const e of fs.readdirSync(p, { withFileTypes: true })) {
          const full = path.join(p, e.name);
          if (e.isDirectory()) walk(full, `${rel}${e.name}/`);
          else if (/\.(node|so[.\d]*|dll|dylib)$/.test(e.name))
            out.onnxruntimeNodeBinaries.push({ file: `${rel}${e.name}`, mb: mb(fs.statSync(full).size) });
        }
      };
      walk(bin);
    }
    if (d.startsWith('@img+sharp-') && !d.includes('libvips')) {
      const walk = (p, rel = '') => {
        for (const e of fs.readdirSync(p, { withFileTypes: true })) {
          const full = path.join(p, e.name);
          if (e.isDirectory()) walk(full, `${rel}${e.name}/`);
          else if (/\.node$/.test(e.name))
            out.sharpNative.push({ pkg: d, file: `${rel}${e.name}`, mb: mb(fs.statSync(full).size) });
        }
      };
      walk(path.join(pnpmDir, d));
    }
  }
  return out;
}
result.install = inspectInstall();

const SENTENCES = {
  'vi-en': ['Giấy phép phần mềm sẽ hết hạn vào cuối tháng này.', 'Vui lòng liên hệ bộ phận hỗ trợ để gia hạn.'],
  'en-vi': [
    '>>vie<< The license will expire at the end of this month.',
    '>>vie<< Please contact support to renew your subscription.',
  ],
};

try {
  const t0 = performance.now();
  const tf = await import('@huggingface/transformers');
  result.importMs = Math.round(performance.now() - t0);
  result.exports = { pipeline: typeof tf.pipeline, env: typeof tf.env };
  result.transformersVersion = tf.env?.version ?? null;
  if (process.env.SPIKE_SKIP_TRANSLATE === '1') {
    result.ok = true;
    result.note = 'library import only (SPIKE_SKIP_TRANSLATE=1)';
  } else {
    if (!modelsDir) throw new Error('SPIKE_MODELS_DIR is required');
    const { env, pipeline } = tf;
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.useFSCache = false;
    // 4.x only options (ignored / absent in 3.x): no wasm cache downloads, quiet logs, env.fetch tripwire.
    if ('useWasmCache' in env) env.useWasmCache = false;
    if (tf.LogLevel && 'logLevel' in env) env.logLevel = tf.LogLevel.ERROR;
    result.env4 = { useWasmCache: env.useWasmCache ?? null, hasEnvFetch: typeof env.fetch === 'function' };
    if (typeof env.fetch === 'function') {
      const realEnvFetch = env.fetch;
      env.fetch = (...args) => {
        const u = typeof args[0] === 'string' ? args[0] : args[0]?.url || String(args[0]);
        // local file reads may also go through env.fetch; only http(s) targets count as network attempts
        if (/^https?:/i.test(u)) fetchCalls.push(`env.fetch:${u.replace(/^(https?:\/\/[^/]+).*$/, '$1')}`);
        else envFetchLocalCalls++;
        return realEnvFetch(...args);
      };
    }
    env.localModelPath = path.resolve(modelsDir).replace(/\\/g, '/').replace(/\/?$/, '/');
    result.models = {};
    const failures = [];
    for (const dir of ['vi-en', 'en-vi']) {
      const id = `Xenova/opus-mt-${dir}`;
      const m = { id };
      try {
        const tl = performance.now();
        const tr = await pipeline('translation', id, { dtype: 'q8', device: 'cpu' });
        m.loadMs = Math.round(performance.now() - tl);
        m.rssAfterLoadMb = mb(process.memoryUsage.rss());
        m.sentences = [];
        for (const text of SENTENCES[dir]) {
          const runs = [];
          let output;
          for (let i = 0; i < 2; i++) {
            const ts = performance.now();
            const o = await tr(text, { max_new_tokens: 128 });
            runs.push(Math.round(performance.now() - ts));
            output = o[0].translation_text;
          }
          m.sentences.push({ input: text, output, firstMs: runs[0], secondMs: runs[1] });
        }
        if (typeof tr.dispose === 'function') await tr.dispose();
      } catch (e) {
        m.error = String(e?.stack || e)
          .split('\n')
          .slice(0, 5)
          .join('\n');
        failures.push(id);
      }
      result.models[dir] = m;
    }
    result.ok = failures.length === 0;
    if (failures.length) result.failures = failures;
  }
} catch (e) {
  result.error = String(e?.stack || e)
    .split('\n')
    .slice(0, 8)
    .join('\n');
}

sample();
clearInterval(timer);
result.peakRssSampledMb = mb(peakRss);
result.maxRssResourceUsageMb = +(process.resourceUsage().maxRSS / 1024).toFixed(1);
try {
  const status = fs.readFileSync('/proc/self/status', 'utf8');
  const hwm = status.match(/VmHWM:\s+(\d+) kB/);
  if (hwm) result.vmHwmMb = +(Number(hwm[1]) / 1024).toFixed(1);
} catch {
  /* not Linux */
}
result.fetchCalls = { count: fetchCalls.length, hosts: [...new Set(fetchCalls)], envFetchLocalCalls };

const scrub = (s) => s.split(os.homedir()).join('<home>').split(os.homedir().replace(/\\/g, '/')).join('<home>');
const json = scrub(JSON.stringify(result));
console.log(`SPIKE_RESULT ${json}`);
if (process.env.SPIKE_OUT) fs.writeFileSync(process.env.SPIKE_OUT, JSON.stringify(JSON.parse(json), null, 2) + '\n');
process.exit(0);
