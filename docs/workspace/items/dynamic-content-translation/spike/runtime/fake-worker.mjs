// TEST DOUBLE, not evidence about ONNX. A forked process that speaks the supervisor<->worker IPC protocol with
// configurable behaviour. A fake that never resolves proves nothing about native cancellation; real-model runs
// (worker/main.mjs) are required for those claims. What this double IS good for: real processes, real IPC, real
// SIGKILL, so supervisor/coordinator logic (slot rule, clocks, single-flight) is exercised against real exit events.
//
// Behaviour comes from env (defaults) and from a directive string in the FIRST segment of a run, e.g.
//   "n=10 step=30 ignoreCancel ignoreDeadline hang crash crashAt=3 hangMs=500 incomplete"
//   n=<steps> step=<ms per step, event loop free between steps> ignoreCancel ignoreDeadline
//   hang        synchronous busy loop forever (stands for a blocking native session.run): nothing is processed
//   hangMs=<ms> synchronous busy loop for that long, then continue
//   crash       process.exit(13) as soon as the job starts; crashAt=<k> crashes at step k
//   incomplete  report complete:false without deadline/cancel
//   truncated   report done{complete:false, reason:'TRUNCATED'} (output hit max_new_tokens without EOS)
//   error       reply error{code:'RUN_FAILED'}
// Env: FAKE_STEP_MS, FAKE_STEPS, FAKE_LOAD_MS (blocking load), FAKE_LOAD_FAIL=permanent|transient (optionally only the
// first FAKE_LOAD_FAIL_TIMES loads, optionally only for FAKE_LOAD_FAIL_DIR), FAKE_LOAD_HANG=1, FAKE_LOAD_CODE (code sent with loadFailed)
import { setTimeout as sleep } from 'node:timers/promises';

const env = process.env;
const send = (m) => process.send?.(m);
const busy = (ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin: event loop blocked like a native call */
  }
};
const parse = (s) => {
  const o = {};
  for (const tok of String(s).split(/\s+/)) {
    const m = /^([a-zA-Z]+)(?:=(.*))?$/.exec(tok);
    if (m) o[m[1]] = m[2] === undefined ? true : Number.isNaN(Number(m[2])) ? m[2] : Number(m[2]);
  }
  return o;
};

const loaded = new Set();
let loadAttempts = 0;
let cancelled = new Set();

process.on('disconnect', () => process.exit(0));
process.on('message', (msg) => {
  if (!msg || typeof msg.type !== 'string') return;
  if (msg.type === 'cancel') cancelled.add(msg.jobId);
  else if (msg.type === 'load') onLoad(msg);
  else if (msg.type === 'run') void onRun(msg);
  else if (msg.type === 'unload') {
    loaded.delete(msg.direction);
    send({ type: 'unloaded', direction: msg.direction });
  } else if (msg.type === 'shutdown') {
    loaded.clear();
    process.exit(0);
  }
});

function onLoad({ direction }) {
  const t0 = Date.now();
  if (env.FAKE_LOAD_HANG) for (;;) busy(1000);
  if (env.FAKE_LOAD_MS) busy(Number(env.FAKE_LOAD_MS));
  loadAttempts++;
  if (env.FAKE_LOAD_FAIL && (!env.FAKE_LOAD_FAIL_DIR || env.FAKE_LOAD_FAIL_DIR === direction) && (!env.FAKE_LOAD_FAIL_TIMES || loadAttempts <= Number(env.FAKE_LOAD_FAIL_TIMES))) {
    send({ type: 'loadFailed', direction, permanent: env.FAKE_LOAD_FAIL === 'permanent', ...(env.FAKE_LOAD_CODE ? { code: env.FAKE_LOAD_CODE } : {}) });
    return;
  }
  loaded.add(direction);
  send({ type: 'loaded', direction, ms: Date.now() - t0 });
}

async function onRun({ jobId, direction, segments, computeDeadlineEpochMs }) {
  const d = { n: Number(env.FAKE_STEPS ?? 5), step: Number(env.FAKE_STEP_MS ?? 20), ...parse(segments?.[0] ?? '') };
  send({ type: 'started', jobId });
  if (!loaded.has(direction)) return send({ type: 'error', jobId, code: 'NOT_LOADED' });
  if (d.crash && d.crashAt === undefined) process.exit(13);
  if (d.hang) for (;;) busy(1000);
  if (d.hangMs) busy(d.hangMs);
  if (d.error) return send({ type: 'error', jobId, code: 'RUN_FAILED' });
  let steps = 0;
  let deadlineHit = false;
  let wasCancelled = false;
  const t0 = Date.now();
  while (steps < d.n) {
    await sleep(d.step);
    steps++;
    if (d.crashAt === steps) process.exit(13);
    if (!d.ignoreCancel && cancelled.has(jobId)) {
      wasCancelled = true;
      break;
    }
    if (!d.ignoreDeadline && Date.now() >= computeDeadlineEpochMs) {
      deadlineHit = true;
      break;
    }
  }
  const complete = !deadlineHit && !wasCancelled && !d.incomplete && !d.truncated;
  send({
    type: 'done',
    jobId,
    outputs: complete ? segments.map((s) => 'T:' + s) : segments.map(() => ''),
    complete,
    deadlineHit,
    cancelled: wasCancelled,
    ...(d.truncated && !deadlineHit && !wasCancelled ? { reason: 'TRUNCATED' } : {}),
    stats: { steps, runMs: Date.now() - t0 },
  });
}
