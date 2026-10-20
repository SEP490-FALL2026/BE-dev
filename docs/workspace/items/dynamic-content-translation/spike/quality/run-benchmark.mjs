#!/usr/bin/env node
// Translation-quality benchmark for the Opus-MT spike (offline, CPU, q8), whole-field fallback pipeline.
//
//   node run-benchmark.mjs [--direction vi-en|en-vi|both] [--mode raw|protected|both]
//                          [--fixtures main|heldout|main,heldout] [--tag 4.3.1]
//                          [--warmup N] [--repetitions N] [--out <file>]
//                          [--max-segment-tokens N] [--limit N] [--known-terms fixture|none]
//
// Env: SPIKE_DEPS_DIR   directory containing node_modules/@huggingface/transformers (and pnpm-lock.yaml)
//      SPIKE_MODELS_DIR directory with Xenova/opus-mt-{vi-en,en-vi} and manifest.json
//
// With --tag the result files are results/<date>-<tag>-<set>-<direction>-<mode>.json and results/summary.md is NOT touched
// (the 3.8.1 baseline files and summary stay as they are). Without --tag the legacy names are used.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib/cli.mjs';
import { resolveDirs, loadTransformers, loadDirection, readManifest, MODEL_IDS } from './lib/model.mjs';
import { translateText } from './lib/pipeline.mjs';
import { sentenceChrF } from './lib/chrf.mjs';
import { checkPreservation, checkMeaning, aggregate, fieldMetrics, percentile } from './lib/metrics.mjs';
import { serializeRun, renderSummary } from './lib/report.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = path.join(here, 'results');

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export function libHashes() {
  const dir = path.join(here, 'lib');
  return Object.fromEntries(
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.mjs'))
      .sort()
      .map((f) => [`lib/${f}`, sha256(path.join(dir, f))]),
  );
}

const FIXTURE_FILES = {
  main: (d) => `${d}.json`,
  heldout: (d) => `heldout-${d}.json`,
};

function loadFixtureSet(set, direction) {
  const file = path.join(here, 'fixtures', FIXTURE_FILES[set](direction));
  return {
    file: `fixtures/${path.basename(file)}`,
    sha256: sha256(file),
    data: JSON.parse(fs.readFileSync(file, 'utf8')),
  };
}

const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

async function runMode({ model, direction, mode, fixture, opts }) {
  const items = opts.limit ? fixture.items.slice(0, opts.limit) : fixture.items;
  // 'fixture': known terms = the item's protected list (an oracle: the product would take them from
  // the user directory and software catalogue). 'none': regex-only protection (ablation).
  const terms = (it) => (opts.knownTerms === 'none' ? [] : it.protected);
  const run = (text, knownTerms) =>
    translateText(text, {
      direction,
      mode,
      knownTerms,
      translateSegment: model.translateSegment,
      countTokens: model.countTokens,
      maxSegmentTokens: opts.maxSegmentTokens,
    });

  // Warm-up: first N items, results discarded (JIT, allocator, ONNX session warm).
  for (const it of items.slice(0, opts.warmup)) await run(it.source, terms(it));

  const results = [];
  const unstable = [];
  const wall0 = performance.now();
  for (const it of items) {
    const samples = [];
    const segmentMs = [];
    let first = null;
    let stable = true;
    for (let r = 0; r < opts.repetitions; r++) {
      const t0 = performance.now();
      const res = await run(it.source, terms(it));
      samples.push(performance.now() - t0);
      for (const s of res.segments) if (s.status !== 'static' && Number.isFinite(s.ms)) segmentMs.push(round(s.ms, 1));
      if (r === 0) first = res;
      else if (res.output !== first.output || res.status !== first.status || res.reason !== first.reason)
        stable = false;
    }
    if (!stable) unstable.push(it.id);
    const medianMs = percentile(samples, 50);
    if (medianMs > 10000 || results.length % 20 === 19)
      console.log(`  [progress] ${it.id} (${results.length + 1}/${items.length}) median ${Math.round(medianMs)} ms`);
    const preserved = checkPreservation(first.output, it.protected);
    const meaning = checkMeaning(first.output, it);
    results.push({
      id: it.id,
      categories: it.categories,
      reference: it.reference, // stripped before writing
      output: first.output,
      chrf: round(sentenceChrF(first.output, it.reference)),
      hasProtected: it.protected.length > 0,
      preserved,
      meaning,
      status: first.status,
      reason: first.reason,
      detail: first.detail ?? null,
      counts: first.counts,
      modelCalls: first.modelCalls,
      finishReasons: first.finishReasons,
      latencyMs: round(percentile(samples, 50), 1),
      latencySamplesMs: samples.map((s) => round(s, 1)),
      segmentMs,
    });
  }
  return { items: results, unstable, wallSec: round((performance.now() - wall0) / 1000, 1) };
}

function lockInfo(depsDir) {
  const lock = path.join(depsDir, 'pnpm-lock.yaml');
  if (!fs.existsSync(lock)) return { file: null, sha256: null };
  const text = fs.readFileSync(lock, 'utf8');
  const ver = (name) => new RegExp(`${name.replace(/[/.]/g, '\\$&')}@(\\d[\\w.+-]*)`).exec(text)?.[1] ?? null;
  return {
    file: 'pnpm-lock.yaml',
    sha256: sha256(lock),
    versions: {
      '@huggingface/transformers': ver('@huggingface/transformers'),
      'onnxruntime-node': ver('onnxruntime-node'),
      sharp: ver('sharp'),
      '@huggingface/tokenizers': ver('@huggingface/tokenizers'),
    },
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { depsDir, modelsDir } = resolveDirs();
  const { mod, version } = await loadTransformers(depsDir);
  const manifest = readManifest(modelsDir);
  const date = new Date().toISOString().slice(0, 10);
  const cpus = os.cpus();
  const environment = {
    os: `${os.type()} ${os.release()} (${os.platform()} ${os.arch()})`,
    cpuModel: cpus[0]?.model?.trim() ?? 'unknown',
    cpuCount: cpus.length,
    totalMemGb: round(os.totalmem() / 1024 ** 3, 1),
    node: process.version,
    transformers: version,
    dtype: 'q8',
    device: 'cpu',
  };
  const lock = lockInfo(depsDir);
  const lib = libHashes();

  const directions = opts.direction === 'both' ? ['vi-en', 'en-vi'] : [opts.direction];
  const modes = opts.mode === 'both' ? ['raw', 'protected'] : [opts.mode];
  const sets = opts.fixtures.split(',');
  const runs = [];

  for (const direction of directions) {
    console.log(`[${direction}] loading model...`);
    const model = await loadDirection({ direction, mod, modelsDir });
    console.log(
      `[${direction}] loaded in ${(model.loadMs / 1000).toFixed(2)} s (lang token id ${model.handle.langTokenId})`,
    );
    for (const set of sets) {
      const fx = loadFixtureSet(set, direction);
      for (const mode of modes) {
        console.log(
          `[${direction}/${set}/${mode}] running ${fx.data.items.length} items (warmup ${opts.warmup}, repetitions ${opts.repetitions})...`,
        );
        const { items, unstable, wallSec } = await runMode({ model, direction, mode, fixture: fx.data, opts });
        const run = {
          date,
          tag: opts.tag,
          fixtureSet: set,
          fixtureFile: { file: fx.file, sha256: fx.sha256, items: fx.data.items.length },
          direction,
          mode,
          options: {
            warmup: opts.warmup,
            repetitions: opts.repetitions,
            maxSegmentTokens: opts.maxSegmentTokens,
            maxNewTokensRule: 'min(512, 2*inputTokens+16)',
            batchSize: 1,
            limit: opts.limit,
            knownTerms: opts.knownTerms,
            decoding: 'greedy (num_beams ignored by transformers.js), forced_eos_token_id disabled in generate()',
          },
          environment,
          lockfile: lock,
          libSha256: lib,
          adapter: model.handle.info,
          model: {
            id: MODEL_IDS[direction],
            revision: manifest.revisions[MODEL_IDS[direction]],
            langTokenId: model.handle.langTokenId,
            eosTokenId: model.handle.eosTokenId,
            decoderStartTokenId: model.handle.decoderStartTokenId,
            files: manifest.files
              .filter((f) => f.model === MODEL_IDS[direction])
              .map(({ file, bytes, sha256 }) => ({ file, bytes, sha256 })),
          },
          loadMs: round(model.loadMs, 0),
          peakRssMb: round(process.resourceUsage().maxRSS / 1024, 0), // process-wide peak so far
          wallSec,
          unstableItems: unstable,
          aggregate: aggregate(items),
          fields: fieldMetrics(items),
          items,
        };
        runs.push(run);
        const f = run.fields;
        console.log(
          `[${direction}/${set}/${mode}] chrF ${f.chrF.corpus}  translated ${f.translatedPct}%  fallback ${f.fallback.pct}% ${JSON.stringify(f.fallback.byReason)}  flags ${f.automaticFlags.meaningFlags}/${f.automaticFlags.translatedFields}  field p50 ${f.latency.field.p50} ms p95 ${f.latency.field.p95} ms  seg p50 ${f.latency.segment.p50} ms  wall ${wallSec}s`,
        );
        if (opts.tag && !opts.out) writeRun(run, opts.tag);
      }
    }
    await model.dispose();
  }

  if (opts.out) {
    const target = path.resolve(opts.out);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, runs.map((r) => serializeRun(r)).join(''), 'utf8');
    console.log(`wrote ${runs.length} run(s) to ${path.basename(target)}`);
    return;
  }
  if (opts.tag) return; // tagged runs are written one by one above; baseline summary stays untouched

  fs.mkdirSync(resultsDir, { recursive: true });
  for (const run of runs) {
    const file = path.join(resultsDir, `${date}-${run.direction}-${run.mode}.json`);
    fs.writeFileSync(file, serializeRun(run), 'utf8');
    console.log(`wrote results/${path.basename(file)}`);
  }
  const canonical = fs
    .readdirSync(resultsDir)
    .filter((f) => new RegExp(`^${date}-(vi-en|en-vi)-(raw|protected)\\.json$`).test(f))
    .sort();
  const all = canonical.map((f) => JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf8')));
  const fixtures = { 'vi-en': loadFixtureSet('main', 'vi-en').data, 'en-vi': loadFixtureSet('main', 'en-vi').data };
  fs.writeFileSync(path.join(resultsDir, 'summary.md'), renderSummary({ runs: all, fixtures }), 'utf8');
  console.log('wrote results/summary.md');
}

function writeRun(run, tag) {
  fs.mkdirSync(resultsDir, { recursive: true });
  const file = path.join(resultsDir, `${run.date}-${tag}-${run.fixtureSet}-${run.direction}-${run.mode}.json`);
  fs.writeFileSync(file, serializeRun(run), 'utf8');
  console.log(`wrote results/${path.basename(file)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
