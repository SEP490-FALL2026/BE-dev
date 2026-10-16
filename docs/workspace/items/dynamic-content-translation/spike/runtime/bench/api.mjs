// Bench "API": a plain node:http server (the stand-in for the NestJS process) exposing
//   GET  /health                      -> {ok:true}
//   POST /translate {text,source,target,org?,scope?,timeoutMs?}  -> coordinator.translate (BENCH_MODE=worker)
//                                                                   or direct in-process translation (BENCH_MODE=inproc, baseline)
//   GET  /stats?resetEld=1            -> RSS, event-loop delay histogram, coordinator snapshot, worker pids, running jobs
//   GET  /events                      -> supervisor event log (bounded)
//   POST /config {computeMaxMs,timeoutMs}  runtime knobs for the bench
//   POST /control/shutdown            -> graceful shutdown (same path as SIGTERM)
// The API process NEVER imports transformers in worker mode.
//
// Env: BENCH_PORT (0 = random), BENCH_MODE, SPIKE_DEPS_DIR, SPIKE_MODELS_DIR, BENCH_CONCURRENCY (1), BENCH_INTRA (1),
//      BENCH_QUEUE_MAX (4), BENCH_COMPUTE_MAX_MS (10000), BENCH_KILL_GRACE_MS (3000), BENCH_TIMEOUT_MS (10000),
//      BENCH_BREAKER_THRESHOLD (3), BENCH_SHUTDOWN_GRACE_MS (5000)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { Supervisor } from '../supervisor.mjs';
import { Coordinator } from '../coordinator.mjs';
import { TranslationCache } from '../cache.mjs';
import { makeSpawn } from '../worker/spawn.mjs';

const E = process.env;
const mode = E.BENCH_MODE ?? 'worker';
const modelsDir = E.SPIKE_MODELS_DIR;
const eld = monitorEventLoopDelay({ resolution: 10 });
eld.enable();
const rssMb = () => +(process.memoryUsage.rss() / 1048576).toFixed(1);
const rssAtStart = rssMb();

async function sha256File(f) {
  const h = createHash('sha256');
  for await (const c of fs.createReadStream(f)) h.update(c);
  return h.digest('hex');
}

let coord = null;
let sup = null;
const events = [];
const failures = [];
let inproc = null;

if (mode === 'worker') {
  const onnx = ['opus-mt-vi-en', 'opus-mt-en-vi'].map((m) => path.join(modelsDir, 'Xenova', m, 'onnx', 'encoder_model_quantized.onnx'));
  const digest = createHash('sha256');
  for (const f of onnx) digest.update(await sha256File(f)); // identity only (cache key); NOT an integrity gate in the spike
  sup = new Supervisor({
    spawn: makeSpawn({ depsDir: E.SPIKE_DEPS_DIR, modelsDir, intraThreads: Number(E.BENCH_INTRA ?? 1), workerPath: E.BENCH_WORKER_PATH || undefined, execPath: E.BENCH_EXEC_PATH || undefined, cwd: E.BENCH_SPAWN_CWD || undefined, maxNewTokensOverride: E.BENCH_MAX_NEW_TOKENS ? Number(E.BENCH_MAX_NEW_TOKENS) : null }),
    concurrency: Number(E.BENCH_CONCURRENCY ?? 1),
    computeMaxMs: Number(E.BENCH_COMPUTE_MAX_MS ?? 10_000),
    killGraceMs: Number(E.BENCH_KILL_GRACE_MS ?? 3000),
    shutdownGraceMs: Number(E.BENCH_SHUTDOWN_GRACE_MS ?? 5000),
    loadTimeoutMs: Number(E.BENCH_LOAD_TIMEOUT_MS ?? 30_000),
    exitWaitMs: Number(E.BENCH_EXIT_WAIT_MS ?? 2000),
    deadlineCancel: E.BENCH_DEADLINE_CANCEL !== '0',
  });
  sup.on('event', (e) => {
    if (events.length < 100_000) events.push(e);
  });
  sup.on('failure', (f) => failures.push({ ...f, wall: Date.now() }));
  coord = new Coordinator({
    supervisor: sup,
    cache: new TranslationCache(),
    identity: { engineId: 'opus-mt-q8@transformers-4.3.1', modelDigest: digest.digest('hex').slice(0, 16), glossaryVersion: 'g0', placeholderPolicyVersion: 'p0' },
    timeoutMs: Number(E.BENCH_TIMEOUT_MS ?? 10_000),
    queueMax: Number(E.BENCH_QUEUE_MAX ?? 4),
    breakerOptions: { threshold: Number(E.BENCH_BREAKER_THRESHOLD ?? 3) },
  });
} else {
  const { createInproc } = await import('./inproc.mjs');
  inproc = createInproc({ depsDir: E.SPIKE_DEPS_DIR, modelsDir, intraThreads: Number(E.BENCH_INTRA ?? 1) });
}

const readBody = (req) =>
  new Promise((resolve) => {
    const c = [];
    req.on('data', (x) => c.push(x));
    req.on('end', () => resolve(Buffer.concat(c).toString('utf8')));
  });
const send = (res, code, obj) => {
  const b = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(b) });
  res.end(b);
};

let shuttingDown = false;
async function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  const t0 = Date.now();
  if (coord) await coord.shutdown();
  const summary = sup
    ? { reason, ms: Date.now() - t0, exits: events.filter((e) => e.type === 'exit').map((e) => ({ pid: e.pid, code: e.code, signal: e.signal })), killSent: events.filter((e) => e.type === 'killSent').map((e) => e.reason) }
    : { reason, ms: Date.now() - t0 };
  process.stdout.write(`SHUTDOWN_EVENTS ${JSON.stringify(summary)}\n`);
  server.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
    if (req.method === 'POST' && url.pathname === '/translate') {
      const b = JSON.parse(await readBody(req));
      const t0 = performance.now();
      if (coord) {
        const r = await coord.translate({
          organizationId: b.org ?? 'org1',
          scope: b.scope ?? 'bench',
          text: b.text,
          storedSource: b.source,
          ...(b.sourceOverride ? { sourceOverride: b.sourceOverride } : {}),
          target: b.target,
          ...(b.timeoutMs ? { deadlineAt: Date.now() + b.timeoutMs } : {}),
        });
        return send(res, 200, { ...r, chars: r.text?.length ?? 0, serverMs: performance.now() - t0, ...(b.returnText ? {} : { text: undefined }) });
      }
      const out = await inproc.translate(`${b.source}-${b.target}`, b.text);
      return send(res, 200, { status: 'OK', cacheHit: false, chars: out.text.length, serverMs: performance.now() - t0, stats: out.stats, ...(b.returnText ? { text: out.text } : {}) });
    }
    if (req.method === 'GET' && url.pathname === '/stats') {
      const ms = (n) => +(n / 1e6).toFixed(2);
      const snap = {
        pid: process.pid,
        mode,
        rssMb: rssMb(),
        rssAtStartMb: rssAtStart,
        heapUsedMb: +(process.memoryUsage().heapUsed / 1048576).toFixed(1),
        eld: { min: ms(eld.min), mean: ms(eld.mean), p50: ms(eld.percentile(50)), p99: ms(eld.percentile(99)), p999: ms(eld.percentile(99.9)), max: ms(eld.max), count: eld.count, resolutionMs: 10 },
      };
      if (coord) {
        snap.coordinator = coord.snapshot();
        snap.workers = sup.slots.map((s) => ({ slot: s.id, pid: s.pid, job: s.job ? { id: s.job.id, state: s.job.state, phase: s.job.phase } : null, models: Object.fromEntries(s.models) }));
        snap.failures = failures.length;
        snap.eventCount = events.length;
      }
      if (url.searchParams.get('resetEld')) eld.reset();
      return send(res, 200, snap);
    }
    if (req.method === 'GET' && url.pathname === '/events') return send(res, 200, { events, failures });
    if (req.method === 'POST' && url.pathname === '/config') {
      const b = JSON.parse(await readBody(req));
      if (b.computeMaxMs) sup.computeMaxMs = b.computeMaxMs;
      if (b.timeoutMs) coord.timeoutMs = b.timeoutMs;
      return send(res, 200, { computeMaxMs: sup?.computeMaxMs, timeoutMs: coord?.timeoutMs });
    }
    if (req.method === 'POST' && url.pathname === '/control/shutdown') {
      send(res, 200, { ok: true });
      void shutdown('control');
      return;
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: String(e?.name ?? 'Error') });
  }
});
server.listen(Number(E.BENCH_PORT ?? 0), '127.0.0.1', () => {
  process.stdout.write(`LISTENING ${server.address().port}\n`);
});
