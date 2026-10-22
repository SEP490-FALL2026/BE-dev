// Model glue for the benchmark: loads @huggingface/transformers from SPIKE_DEPS_DIR and the two Opus-MT pipelines from
// SPIKE_MODELS_DIR (offline, read-only use) through the shared generate adapter (lib/generate-adapter.mjs).
// There is NO string-prefix path any more: the en->vi language token is prepended as an id by the adapter, in every
// transformers.js version, and every segment is translated with batch size 1.
// Integration code, exercised by run-benchmark.mjs; the pure logic lives in the other lib/ modules.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {
  loadDirection as loadAdapterDirection,
  countSourceTokens,
  translateSegment,
  MODEL_IDS,
} from './generate-adapter.mjs';

export { MODEL_IDS };

export const DEFAULT_DEPS_DIR = 'D:\\FPT\\FALL2026\\Code\\BE-dev-software-license-management';
export const DEFAULT_MODELS_DIR = 'D:\\FPT\\FALL2026\\Code\\BE-dev-software-license-management\\.models\\translation';

export function resolveDirs(env = process.env) {
  return {
    depsDir: env.SPIKE_DEPS_DIR || DEFAULT_DEPS_DIR,
    modelsDir: env.SPIKE_MODELS_DIR || DEFAULT_MODELS_DIR,
  };
}

export async function loadTransformers(depsDir) {
  const req = createRequire(path.join(depsDir, 'package.json'));
  // The package does not export ./package.json, so walk up from the resolved entry.
  const entry = req.resolve('@huggingface/transformers');
  let dir = path.dirname(entry);
  let version = 'unknown';
  while (dir !== path.dirname(dir)) {
    const p = path.join(dir, 'package.json');
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (j.name === '@huggingface/transformers') {
        version = j.version;
        break;
      }
    }
    dir = path.dirname(dir);
  }
  const imported = await import(pathToFileURL(entry).href);
  const mod = imported.pipeline ? imported : imported.default; // CJS build exposes exports on default
  return { mod, version };
}

export function readManifest(modelsDir) {
  const raw = JSON.parse(fs.readFileSync(path.join(modelsDir, 'manifest.json'), 'utf8'));
  const revisions = {};
  const files = [];
  for (const row of raw) {
    revisions[row.model] = row.revision;
    files.push({ model: row.model, file: row.file, bytes: row.bytes, sha256: row.sha256 });
  }
  return { revisions, files };
}

// Returns { direction, loadMs, handle, countTokens(text), translateSegment(text, opts), dispose() } for one direction.
// countTokens counts what the model will see (language token for en-vi, sentence tokens, </s>), untruncated.
export async function loadDirection({ direction, mod, modelsDir, sessionOptions }) {
  const t0 = performance.now();
  const handle = await loadAdapterDirection({ transformers: mod, modelsDir, direction, sessionOptions });
  const loadMs = performance.now() - t0;
  return {
    direction,
    loadMs,
    handle,
    countTokens: (text) => countSourceTokens(handle, text),
    translateSegment: (text, opts) => translateSegment(handle, text, opts),
    async dispose() {
      await handle.pipe.dispose?.();
    },
  };
}
