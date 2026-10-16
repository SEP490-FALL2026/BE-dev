// REAL translation worker (child process). One job at a time. Spike code, not product code.
//
// Why a child process: onnxruntime-node session.run and model load are synchronous native calls on the calling JS
// thread, RunOptions.terminate is not supported by the node binding, and worker_threads.terminate() mid-run crashed the
// whole process (ORT 1.21). Only SIGKILL of a separate process reliably stops a native run.
//
// Env (set explicitly by the supervisor; the parent's environment is NOT inherited):
//   SPIKE_DEPS_DIR          dir containing node_modules/@huggingface/transformers (default: normal resolution)
//   SPIKE_MODELS_DIR        dir containing Xenova/opus-mt-vi-en and Xenova/opus-mt-en-vi (read-only is fine)
//   SPIKE_INTRA_THREADS     onnxruntime intraOpNumThreads (default 1); interOpNumThreads is always 1
//   SPIKE_MODEL_LOCK        path of the lock file (default ../model-lock.json)
//   SPIKE_MAX_NEW_TOKENS    TEST/BENCH ONLY integer: replaces the min(512, 2n+16) budget (used to provoke truncation)
//
// Load order per direction: (1) verify-lock.mjs on that model's directory, BEFORE the library is imported or any model
// byte is parsed; a mismatch is loadFailed{permanent:true, code:'MODEL_LOCK_MISMATCH'}; (2) import transformers;
// (3) adapter.loadDirection (spike/quality/lib/generate-adapter.mjs, read-only import) which fails closed on any broken
// assumption about the model/tokenizer/generation config (code ADAPTER_ASSUMPTION_FAILED, also permanent).
//
// IPC in : load{direction} run{jobId,direction,segments,computeDeadlineEpochMs,maxNewTokensRule} cancel{jobId}
//          unload{direction} shutdown
// IPC out: loaded{direction,ms,rssMb,lockMs} loadFailed{direction,permanent,code?} started{jobId}
//          done{jobId,outputs,complete,deadlineHit,cancelled,reason?,stats} error{jobId,code} unloaded{direction}
// done.reason when !complete: DEADLINE | CANCELLED | TRUNCATED | INCOMPLETE. A job is complete only if every segment
// ended with EOS (see run-job.mjs).
// Raw text and raw library error messages are never sent over IPC or logged: errors map to short codes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runJob } from './run-job.mjs';
import { verifyLock, loadLock, MODEL_LOCK_CODE } from '../verify-lock.mjs';
import { loadDirection, translateSegment, MODEL_IDS } from '../../quality/lib/generate-adapter.mjs';

// Network tripwire BEFORE the library is imported: any fetch is counted and refused.
let fetchCalls = 0;
globalThis.fetch = () => {
  fetchCalls++;
  return Promise.reject(new Error('network disabled'));
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const send = (m) => process.send?.(m);
const rssMb = () => +(process.memoryUsage.rss() / 1048576).toFixed(1);
const intraThreads = Number(process.env.SPIKE_INTRA_THREADS ?? 1);
const maxNewTokensOverride = process.env.SPIKE_MAX_NEW_TOKENS ? Number(process.env.SPIKE_MAX_NEW_TOKENS) : null;
const modelsDir = path.resolve(process.env.SPIKE_MODELS_DIR ?? '');
const lockPath = process.env.SPIKE_MODEL_LOCK ?? path.join(HERE, '..', 'model-lock.json');
const SAFE_CODES = new Set(['INPUT_TOO_LONG', 'ADAPTER_RESULT_UNREADABLE', 'ADAPTER_ASSUMPTION_FAILED', 'CRITERION_NOT_INVOKED', 'BAD_MAX_NEW_TOKENS']);

let tf = null;
const handles = new Map(); // direction -> adapter handle
const lockVerified = new Set(); // directions whose model dir passed the lock in THIS process
const cancelled = new Set();

async function importLibrary() {
  if (tf) return tf;
  const depsDir = process.env.SPIKE_DEPS_DIR;
  if (depsDir) {
    const pkgDir = path.join(depsDir, 'node_modules', '@huggingface', 'transformers');
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
    const entry = pkg.exports?.['.']?.node?.import?.default ?? pkg.exports?.node?.import?.default ?? pkg.module ?? pkg.main;
    tf = await import(pathToFileURL(path.resolve(pkgDir, entry)).href);
  } else {
    tf = await import('@huggingface/transformers');
  }
  const { env } = tf;
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.useFSCache = false;
  env.useBrowserCache = false;
  try {
    env.fetch = globalThis.fetch; // 4.x: the library's own fetch hook (tripwire)
    env.useWasmCache = false;
    if (tf.LogLevel) env.logLevel = tf.LogLevel.ERROR;
  } catch {
    /* 3.x has no such fields */
  }
  return tf;
}

/** Lock check for one direction's model directory. Returns null when fine, else the loadFailed message. */
async function checkLock(direction) {
  if (lockVerified.has(direction)) return { ms: 0 };
  let lock;
  try {
    lock = await loadLock(lockPath);
  } catch (e) {
    process.stderr.write(`lockUnreadable ${direction} ${e?.code ?? e?.name ?? 'Error'}\n`);
    return { fail: { type: 'loadFailed', direction, permanent: true, code: MODEL_LOCK_CODE } };
  }
  const r = await verifyLock({ root: modelsDir, lock, models: [MODEL_IDS[direction]] });
  if (!r.ok) {
    process.stderr.write(`lockMismatch ${direction} reason=${r.reason}\n`); // reason is a short code; detail names a path only
    return { fail: { type: 'loadFailed', direction, permanent: true, code: MODEL_LOCK_CODE } };
  }
  lockVerified.add(direction);
  return { ms: r.ms };
}

async function onLoad({ direction }) {
  const t0 = Date.now();
  if (!MODEL_IDS[direction]) return send({ type: 'loadFailed', direction, permanent: true, code: 'UNKNOWN_DIRECTION' });
  try {
    const lock = await checkLock(direction);
    if (lock.fail) return send(lock.fail);
    const lib = await importLibrary();
    const handle = await loadDirection({
      transformers: lib,
      modelsDir,
      direction,
      sessionOptions: { intraOpNumThreads: intraThreads, interOpNumThreads: 1 },
    });
    handles.set(direction, handle);
    send({ type: 'loaded', direction, ms: Date.now() - t0, rssMb: rssMb(), lockMs: lock.ms });
  } catch (e) {
    // A broken adapter assumption or a missing model file is permanent; everything else is treated as transient.
    // Never echo e.message.
    const msg = String(e?.message ?? '');
    const assumption = e?.code === 'ADAPTER_ASSUMPTION_FAILED';
    const permanent = assumption || e?.code === 'ENOENT' || /could not locate file|file not found|not found/i.test(msg);
    process.stderr.write(`loadFailed ${direction} permanent=${permanent} name=${e?.name ?? 'Error'} code=${e?.code ?? ''}\n`);
    send({ type: 'loadFailed', direction, permanent, ...(assumption ? { code: 'ADAPTER_ASSUMPTION_FAILED' } : {}) });
  }
}

async function onRun({ jobId, direction, segments, computeDeadlineEpochMs }) {
  send({ type: 'started', jobId });
  const handle = handles.get(direction);
  if (!handle) return send({ type: 'error', jobId, code: 'NOT_LOADED' });
  try {
    const done = await runJob({
      jobId,
      segments,
      computeDeadlineEpochMs,
      handle,
      translateSegment,
      StoppingCriteria: tf.StoppingCriteria,
      isCancelled: () => cancelled.has(jobId),
      rssMb,
      maxNewTokensOverride,
      extraStats: { fetchCalls },
    });
    send({ type: 'done', ...done });
  } catch (e) {
    const code = SAFE_CODES.has(e?.code) ? e.code : 'RUN_FAILED';
    process.stderr.write(`runFailed name=${e?.name ?? 'Error'} code=${code}\n`);
    send({ type: 'error', jobId, code });
  } finally {
    cancelled.delete(jobId);
  }
}

async function disposeAll() {
  for (const [dir, h] of handles) {
    try {
      await h.pipe?.dispose?.();
    } catch {
      /* best effort */
    }
    handles.delete(dir);
  }
}

process.on('disconnect', () => process.exit(0));
process.on('uncaughtException', (e) => {
  process.stderr.write(`uncaught name=${e?.name ?? 'Error'}\n`);
  process.exit(70);
});
process.on('unhandledRejection', () => {
  process.stderr.write('unhandledRejection\n');
  process.exit(70);
});
process.on('message', (msg) => {
  if (!msg || typeof msg.type !== 'string') return;
  switch (msg.type) {
    case 'cancel':
      cancelled.add(msg.jobId);
      break;
    case 'load':
      void onLoad(msg);
      break;
    case 'run':
      void onRun(msg);
      break;
    case 'unload':
      void (async () => {
        const h = handles.get(msg.direction);
        handles.delete(msg.direction);
        try {
          await h?.pipe?.dispose?.();
        } catch {
          /* best effort */
        }
        send({ type: 'unloaded', direction: msg.direction });
      })();
      break;
    case 'shutdown':
      void disposeAll().then(() => process.exit(0));
      break;
    default:
      break;
  }
});
