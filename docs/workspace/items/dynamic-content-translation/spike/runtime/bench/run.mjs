// Bench orchestrator. Usage:  node bench/run.mjs <scenario> [<scenario> ...]
// Scenarios: env coldload healthcompare latency saturation extkill killcycles longrun threads sigterm
// Env: SPIKE_DEPS_DIR, SPIKE_MODELS_DIR (required), BENCH_OUT (default ./evidence), BENCH_PROFILE (label, default platform),
//      BENCH_JOBS (longrun, default 200), BENCH_LAT_CONC ("1,2"), BENCH_LAT_DIRS ("vi-en,en-vi"), BENCH_FAST=1 (fewer reps)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HERE, sleep, summarize, httpJson, startApi, startHealthPoller, procStatus, childrenOf, pidAlive, cgroup, isLinux } from './lib.mjs';
import { analyzeEvents } from './analyze.mjs';
import { makeText } from './corpus.mjs';

const E = process.env;
const OUT = E.BENCH_OUT ?? path.join(HERE, '..', 'evidence');
const PROFILE = E.BENCH_PROFILE ?? process.platform;
const FAST = E.BENCH_FAST === '1';
// New measurements never overwrite old evidence: file suffix = BENCH_SUFFIX, else the run id, else the date.
const SUFFIX = E.BENCH_SUFFIX ? E.BENCH_SUFFIX : '-' + (E.BENCH_RUN_ID || new Date().toISOString().slice(0, 10)).replace(/[^A-Za-z0-9._-]/g, '_');
fs.mkdirSync(OUT, { recursive: true });
const baseEnv = { SPIKE_DEPS_DIR: E.SPIKE_DEPS_DIR, SPIKE_MODELS_DIR: E.SPIKE_MODELS_DIR };
const LONG = { BENCH_COMPUTE_MAX_MS: '120000', BENCH_TIMEOUT_MS: '120000', BENCH_BREAKER_THRESHOLD: '1000000' };
const DIRS = { 'vi-en': ['vi', 'en'], 'en-vi': ['en', 'vi'] };
const round = (x, d = 1) => (x === null || x === undefined ? null : +x.toFixed(d));

async function tr(api, direction, text, extra = {}) {
  const [source, target] = DIRS[direction];
  const r = await api.post('/translate', { text, source, target, ...extra });
  return { ...r.json, ms: r.ms, wall: r.wall, http: r.status };
}
const stats = (api, reset = false) => api.get('/stats' + (reset ? '?resetEld=1' : ''));
const workerPid = async (api) => (await stats(api)).workers?.[0]?.pid ?? null;
async function waitExecuting(api, timeoutMs = 60_000) {
  const t0 = Date.now();
  for (;;) {
    const s = await stats(api);
    const w = s.workers?.find((x) => x.job?.phase === 'EXECUTING');
    if (w) return w.pid;
    if (Date.now() - t0 > timeoutMs) throw new Error('timeout waiting for EXECUTING');
    await sleep(20);
  }
}
async function pool(n, conc, fn) {
  let next = 0;
  const results = [];
  await Promise.all(
    Array.from({ length: conc }, async () => {
      while (next < n) {
        const i = next++;
        results[i] = await fn(i);
      }
    }),
  );
  return results;
}
/** OS-level sampler of live worker processes (children of the API). Linux: /proc; else: pids seen via /stats + liveness. */
function startLiveSampler(api, everyMs = 50) {
  let max = 0;
  let samples = 0;
  const seen = new Set();
  let busy = false;
  const timer = setInterval(async () => {
    if (isLinux) {
      max = Math.max(max, childrenOf(api.pid).length);
      samples++;
    } else if (!busy) {
      busy = true;
      try {
        const s = await stats(api);
        for (const w of s.workers) if (w.pid) seen.add(w.pid);
        max = Math.max(max, [...seen].filter(pidAlive).length);
        samples++;
      } catch {
        /* api busy */
      }
      busy = false;
    }
  }, everyMs);
  return () => {
    clearInterval(timer);
    return { maxLiveWorkers: max, samples, method: isLinux ? '/proc children of API pid' : 'pids seen via /stats + kill(pid,0)' };
  };
}
const tag = (api) => ({ apiPid: api.pid });

// ============================================================================================================
const scenarios = {
  async env() {
    let pkg = {};
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(E.SPIKE_DEPS_DIR, 'node_modules/@huggingface/transformers/package.json'), 'utf8'));
    } catch {
      /* ignore */
    }
    const ort = fs.existsSync(path.join(E.SPIKE_DEPS_DIR, 'node_modules/.pnpm')) ? fs.readdirSync(path.join(E.SPIKE_DEPS_DIR, 'node_modules/.pnpm')).filter((d) => /^(onnxruntime|sharp@)/.test(d)) : [];
    return {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      user: os.userInfo().username,
      cpusVisible: os.cpus().length,
      availableParallelism: os.availableParallelism(),
      totalMemMb: round(os.totalmem() / 1048576, 0),
      cgroup: cgroup(),
      transformers: pkg.version,
      pnpmPackages: ort,
      kernel: os.release(),
    };
  },

  async coldload() {
    const runs = [];
    for (let i = 0; i < 5; i++) {
      const api = await startApi({ ...baseEnv, ...LONG, BENCH_INTRA: E.BENCH_INTRA ?? '1' });
      const stopHealth = startHealthPoller(api.port);
      const s0 = await stats(api, true);
      const t0 = Date.now();
      const r1 = await tr(api, 'vi-en', makeText('vi', 100));
      const wpid = await workerPid(api);
      const ps1 = procStatus(wpid);
      const r2 = await tr(api, 'en-vi', makeText('en', 100));
      const ps2 = procStatus(wpid);
      const ev = (await api.get('/events')).events;
      const sp = ev.find((e) => e.type === 'spawn');
      const loads = ev.filter((e) => e.type === 'loaded');
      const s1 = await stats(api);
      const health = await stopHealth();
      runs.push({
        firstRequestViEnMs: round(r1.ms),
        firstRequestEnViMs: round(r2.ms),
        status: [r1.status, r2.status],
        workerLoadMs: { 'vi-en': loads[0]?.ms, 'en-vi': loads[1]?.ms },
        spawnToFirstLoadedMs: round(loads[0].t - sp.t),
        workerRssAfterViEnLoad: { procMb: ps1, ipcRssMb: r1.stats?.worker?.rssMb },
        workerRssAfterEnViLoad: { procMb: ps2, ipcRssMb: r2.stats?.worker?.rssMb },
        apiRssMb: { start: s0.rssMb, afterBoth: s1.rssMb },
        health,
        apiEld: s1.eld,
        totalMs: Date.now() - t0,
      });
      await api.stop();
    }
    const pick = (f) => runs.map(f);
    return {
      runs,
      summary: {
        spawnToFirstLoadedMs: summarize(pick((r) => r.spawnToFirstLoadedMs)),
        workerLoadViEnMs: summarize(pick((r) => r.workerLoadMs['vi-en'])),
        workerLoadEnViMs: summarize(pick((r) => r.workerLoadMs['en-vi'])),
        firstRequestViEnMs: summarize(pick((r) => r.firstRequestViEnMs)),
        healthP50: summarize(pick((r) => r.health.p50)),
        healthMaxOfMax: Math.max(...pick((r) => r.health.max)),
        healthP99MaxOfRuns: Math.max(...pick((r) => r.health.p99)),
        apiEldMaxMs: Math.max(...pick((r) => r.apiEld.max)),
        apiEldP99MaxMs: Math.max(...pick((r) => r.apiEld.p99)),
      },
    };
  },

  /** Same load against worker mode and the in-process baseline: /health at 20 Hz + API event-loop delay. */
  async healthcompare() {
    const out = {};
    const CLIENTS = 10;
    const PER = FAST ? 1 : 3;
    for (const mode of ['worker', 'inproc']) {
      const api = await startApi({ ...baseEnv, ...LONG, BENCH_MODE: mode, BENCH_QUEUE_MAX: '100', BENCH_INTRA: '1' });
      const s0 = await stats(api, true);
      const stopHealth = startHealthPoller(api.port);
      const t0 = Date.now();
      // phase 1: cold load of both directions
      const cold1 = await tr(api, 'vi-en', makeText('vi', 100));
      const cold2 = await tr(api, 'en-vi', makeText('en', 100));
      const coldMs = Date.now() - t0;
      const sCold = await stats(api);
      const healthCold = await stopHealth(); // (stop here: phases reported separately)
      // phase 2: saturation (10 parallel clients, distinct keys, ~400 chars each)
      await stats(api, true);
      const stopHealth2 = startHealthPoller(api.port);
      const t1 = Date.now();
      const rs = await pool(CLIENTS * PER, CLIENTS, (i) => tr(api, i % 2 ? 'en-vi' : 'vi-en', makeText(i % 2 ? 'en' : 'vi', 400)));
      const satMs = Date.now() - t1;
      const health2 = await stopHealth2();
      const s1 = await stats(api);
      const wp = s1.workers?.[0]?.pid;
      out[mode] = {
        cold: { ms: coldMs, statuses: [cold1.status, cold2.status], health: healthCold, apiEld: sCold.eld },
        saturation: { requests: rs.length, ms: satMs, statuses: rs.reduce((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {}), latencyMs: summarize(rs.map((r) => r.ms)), health: health2, apiEld: s1.eld },
        apiRssMb: { start: s0.rssMb, afterCold: sCold.rssMb, afterSaturation: s1.rssMb },
        workerRss: wp ? procStatus(wp) : null,
      };
      await api.stop();
    }
    return out;
  },

  async latency() {
    const concs = (E.BENCH_LAT_CONC ?? '1,2').split(',').map(Number);
    const dirs = (E.BENCH_LAT_DIRS ?? 'vi-en,en-vi').split(',');
    const sizes = [200, 1000, 4000];
    const nFor = FAST ? { 200: 4, 1000: 3, 4000: 2 } : { 200: 10, 1000: 8, 4000: 6 };
    const cells = [];
    for (const direction of dirs) {
      for (const conc of concs) {
        const api = await startApi({ ...baseEnv, ...LONG, BENCH_CONCURRENCY: String(conc), BENCH_QUEUE_MAX: '20', BENCH_INTRA: '1' });
        const lang = DIRS[direction][0];
        // warm: one request per worker (parallel) loads the direction everywhere
        await Promise.all(Array.from({ length: conc }, () => tr(api, direction, makeText(lang, 100))));
        for (const size of sizes) {
          const n = nFor[size];
          const rs = await pool(n, conc, () => tr(api, direction, makeText(lang, size)));
          const ok = rs.filter((r) => r.status === 'OK');
          const w = ok.map((r) => r.stats?.worker).filter(Boolean);
          cells.push({
            direction,
            concurrency: conc,
            chars: size,
            requests: n,
            ok: ok.length,
            segmentsPerRequest: w[0]?.segments,
            totalMs: summarize(ok.map((r) => r.ms), 0),
            workerRunMs: summarize(w.map((x) => x.runMs), 0),
            maxStepGapMs: summarize(w.map((x) => x.maxStepGapMs), 0),
            firstStepMs: summarize(w.map((x) => x.firstStepMs), 0),
            fitsIn10s: `${ok.filter((r) => r.ms < 10_000).length}/${n}`,
            p95Under10s: summarize(ok.map((r) => r.ms), 0).p95 !== null && summarize(ok.map((r) => r.ms), 0).p95 < 10_000,
          });
        }
        const s = await stats(api);
        cells.push({ direction, concurrency: conc, note: 'api', apiRssMb: s.rssMb, apiEldMaxMs: s.eld.max, workerRss: s.workers.map((x) => procStatus(x.pid)) });
        await api.stop();
      }
    }
    return { cells };
  },

  async saturation() {
    const api = await startApi({ ...baseEnv, BENCH_CONCURRENCY: '1', BENCH_COMPUTE_MAX_MS: '60000', BENCH_TIMEOUT_MS: '10000', BENCH_QUEUE_MAX: '4', BENCH_BREAKER_THRESHOLD: '1000000', BENCH_INTRA: '1' });
    const warm = await tr(api, 'vi-en', makeText('vi', 100), { timeoutMs: 60_000 });
    await api.post('/config', { computeMaxMs: 200 });
    await stats(api, true);
    const stopHealth = startHealthPoller(api.port);
    const stopLive = startLiveSampler(api);
    const results = [];
    const kills = [];
    let killsDone = false;
    let requests = 0;
    const client = async () => {
      while (!(killsDone && requests >= 50) && Date.now() - tStart < 180_000) {
        requests++;
        const r = await tr(api, 'vi-en', makeText('vi', 400));
        results.push({ status: r.status, reason: r.stats?.reason, ms: r.ms, overrunMs: r.stats?.worker?.overrunMs, runMs: r.stats?.runMs });
        if (r.status === 'BUSY') await sleep(100); // closed-loop clients with think time on BUSY
      }
    };
    const killer = async () => {
      for (let i = 0; i < 10; i++) {
        await sleep(300 + Math.round(Math.random() * 300));
        // kill a worker that is EXECUTING a job (not loading), polling fast: the run window is only ~200 ms
        let killed = false;
        while (!killed && Date.now() - tStart < 170_000) {
          const w = (await stats(api)).workers[0];
          if (w.pid && w.job?.phase === 'EXECUTING' && pidAlive(w.pid)) {
            kills.push({ pid: w.pid, phase: w.job.phase, wall: Date.now() });
            process.kill(w.pid, 'SIGKILL');
            killed = true;
          } else await sleep(8);
        }
        if (!killed) break;
      }
      killsDone = true;
    };
    const t0 = Date.now();
    const tStart = t0;
    await Promise.all([...Array.from({ length: 10 }, client), killer()]);
    const durationMs = Date.now() - t0;
    const health = await stopHealth();
    const live = stopLive();
    const s = await stats(api);
    const { events, failures } = await api.get('/events');
    const an = analyzeEvents(events, 1);
    // deadline hit never cached: same key twice
    const key = makeText('vi', 400, 987654);
    await api.post('/config', { computeMaxMs: 200 });
    const before = (await stats(api)).coordinator.cache.entries;
    await sleep(100);
    const a = await tr(api, 'vi-en', key);
    const mid = (await stats(api)).coordinator.cache.entries;
    const b = await tr(api, 'vi-en', key);
    const enq = (await api.get('/events')).events.filter((e) => e.type === 'enqueue').length;
    // supervisor-side overrun: deadline event -> done event of the same job
    const dl = new Map(events.filter((e) => e.type === 'deadline').map((e) => [e.jobId, e.t]));
    const supOverrun = events.filter((e) => e.type === 'done' && dl.has(e.jobId)).map((e) => e.t - dl.get(e.jobId));
    const byStatus = {};
    for (const r of results) byStatus[`${r.status}/${r.reason ?? ''}`] = (byStatus[`${r.status}/${r.reason ?? ''}`] ?? 0) + 1;
    const out = {
      warmStatus: warm.status,
      requests: results.length,
      durationMs,
      externalKills: kills.length,
      killPhases: kills.reduce((a, k) => ((a[k.phase] = (a[k.phase] ?? 0) + 1), a), {}),
      byStatus,
      latencyMs: summarize(results.map((r) => r.ms)),
      health,
      apiEld: s.eld,
      liveSampler: live,
      eventAnalysis: an,
      supervisorFailures: failures.reduce((a, f) => ((a[f.kind] = (a[f.kind] ?? 0) + 1), a), {}),
      deadlineToDoneMs_supervisorSide: summarize(supOverrun),
      workerReportedOverrunMs: summarize(results.map((r) => r.overrunMs)),
      deadlineNotCached: { statusFirst: a.status, reasonFirst: a.stats?.reason, cacheEntriesBefore: before, cacheEntriesAfterDeadlineHit: mid, secondCacheHit: b.cacheHit, secondStatus: b.status },
      inflightMaxObserved: s.coordinator.maxInflightObserved,
      inflightBound: 4 + 1,
      enqueueCountTotal: enq,
      apiRssMb: s.rssMb,
    };
    await api.stop();
    return out;
  },

  /** Deadline -> done overrun with the supervisor's own cancel disabled: the worker's stopping criterion is the only enforcer. */
  async overrun() {
    const api = await startApi({ ...baseEnv, BENCH_DEADLINE_CANCEL: '0', BENCH_COMPUTE_MAX_MS: '60000', BENCH_TIMEOUT_MS: '30000', BENCH_BREAKER_THRESHOLD: '1000000', BENCH_KILL_GRACE_MS: '3000', BENCH_INTRA: '1' });
    await tr(api, 'vi-en', makeText('vi', 100));
    await tr(api, 'en-vi', makeText('en', 100));
    await api.post('/config', { computeMaxMs: 300 });
    const N = FAST ? 10 : 40;
    const rs = [];
    for (let i = 0; i < N; i++) {
      const dir = i % 2 ? 'en-vi' : 'vi-en';
      const r = await tr(api, dir, makeText(i % 2 ? 'en' : 'vi', 600));
      rs.push({ dir, status: r.status, reason: r.stats?.reason, overrunMs: r.stats?.worker?.overrunMs, maxStepGapMs: r.stats?.worker?.maxStepGapMs, firstStepMs: r.stats?.worker?.firstStepMs, ms: r.ms });
    }
    const { events } = await api.get('/events');
    const dl = new Map(events.filter((e) => e.type === 'deadline').map((e) => [e.jobId, e.t]));
    const sup = events.filter((e) => e.type === 'done' && dl.has(e.jobId)).map((e) => e.t - dl.get(e.jobId));
    const hits = rs.filter((r) => r.reason === 'deadline');
    const out = {
      requests: N,
      deadlineHits: hits.length,
      cancelSent: events.filter((e) => e.type === 'cancelSent').length,
      killSent: events.filter((e) => e.type === 'killSent').length,
      workerReportedOverrunMs: summarize(hits.map((r) => r.overrunMs), 0),
      supervisorDeadlineToDoneMs: summarize(sup, 0),
      maxStepGapMs: summarize(rs.map((r) => r.maxStepGapMs), 0),
      firstStepMs: summarize(rs.map((r) => r.firstStepMs), 0),
      byDirection: { 'vi-en': summarize(hits.filter((r) => r.dir === 'vi-en').map((r) => r.overrunMs), 0), 'en-vi': summarize(hits.filter((r) => r.dir === 'en-vi').map((r) => r.overrunMs), 0) },
      killGraceMs: 3000,
    };
    await api.stop();
    return out;
  },

  /** Supervisor-initiated SIGKILL of a worker in the middle of a real native run: kill->exit latency, slot/respawn ordering. */
  async killexit() {
    const N = FAST ? 4 : 12;
    // kill grace 1 ms + no cooperative cancel at the deadline: the kill timer fires while the worker is inside generate()
    const api = await startApi({ ...baseEnv, BENCH_DEADLINE_CANCEL: '0', BENCH_COMPUTE_MAX_MS: '60000', BENCH_KILL_GRACE_MS: '1', BENCH_TIMEOUT_MS: '30000', BENCH_BREAKER_THRESHOLD: '1000000', BENCH_INTRA: '1' });
    await tr(api, 'vi-en', makeText('vi', 100));
    const rs = [];
    for (let i = 0; i < N; i++) {
      await api.post('/config', { computeMaxMs: 60_000 });
      await tr(api, 'vi-en', makeText('vi', 100)); // make sure a loaded worker exists after the previous kill
      await api.post('/config', { computeMaxMs: 250 });
      const r = await tr(api, 'vi-en', makeText('vi', 800));
      rs.push({ status: r.status, reason: r.stats?.reason });
    }
    const { events } = await api.get('/events');
    const an = analyzeEvents(events, 1);
    const kills = events.filter((e) => e.type === 'killSent');
    const lat = kills.map((k) => events.find((e) => e.type === 'exit' && e.t >= k.t && e.pid === k.pid)).map((x, i) => (x ? x.t - kills[i].t : null));
    const sp = events.filter((e) => e.type === 'spawn');
    const ex = events.filter((e) => e.type === 'exit');
    const out = { trials: N, statuses: rs.reduce((a, r) => ((a[`${r.status}/${r.reason}`] = (a[`${r.status}/${r.reason}`] ?? 0) + 1), a), {}), killsSent: kills.length, killReasons: [...new Set(kills.map((k) => k.reason))], killToExitMs: summarize(lat, 1), respawnAfterExitMs: summarize(ex.map((e, i) => (sp[i + 1] ? sp[i + 1].t - e.t : null)), 1), eventAnalysis: an };
    await api.stop();
    return out;
  },

  async extkill() {
    const phaseA = [];
    let api = await startApi({ ...baseEnv, BENCH_COMPUTE_MAX_MS: '120000', BENCH_TIMEOUT_MS: '120000', BENCH_BREAKER_THRESHOLD: '3', BENCH_INTRA: '1' });
    await tr(api, 'vi-en', makeText('vi', 100));
    for (let i = 0; i < 3; i++) {
      const p = tr(api, 'vi-en', makeText('vi', 1000));
      const pid = await waitExecuting(api);
      await sleep(150);
      const tKill = Date.now();
      process.kill(pid, 'SIGKILL');
      const r = await p;
      const s = await stats(api);
      phaseA.push({ settleAfterKillMs: r.wall - tKill, status: r.status, reason: r.stats?.reason, breaker: s.coordinator.breakers['vi-en'] });
    }
    const t0 = performance.now();
    const open = await tr(api, 'vi-en', makeText('vi', 100));
    const openMs = performance.now() - t0;
    await api.stop();

    // METHOD (documented, review finding 'extkill'): tKill = Date.now() in THIS (orchestrator) process immediately before
    // process.kill(workerPid,'SIGKILL'); tSettle = Date.now() in this process when the HTTP response of the waiter arrives
    // (so settle time = kill -> kernel exit notification -> libuv 'exit' -> supervisor -> coordinator -> HTTP server ->
    // HTTP client, all on one host clock). The API process records wall-clock stamps of its own 'exit' and 'settled'
    // events, which split the interval: kill->exit event (OS + event loop of the API), exit event->settled (supervisor and
    // coordinator), settled->client (HTTP). Per trial we also keep the cgroup cpu.stat delta (CFS throttling), loadavg and
    // the API event-loop-delay max for the trial window. Raw values for every trial are kept in `rawTrials`.
    const phaseB = [];
    const rawTrials = [];
    api = await startApi({ ...baseEnv, ...LONG, BENCH_INTRA: '1' });
    await tr(api, 'vi-en', makeText('vi', 100));
    for (let i = 0; i < 10; i++) {
      const p = tr(api, 'vi-en', makeText('vi', 1000));
      const pid = await waitExecuting(api);
      await sleep(100 + Math.round(Math.random() * 300));
      await stats(api, true); // reset the API event-loop-delay histogram: the window is this trial
      const cg0 = cgroup().cpuStat;
      const tKill = Date.now();
      process.kill(pid, 'SIGKILL');
      const r = await p;
      const tSettle = r.wall;
      const cg1 = cgroup().cpuStat;
      const st = await stats(api);
      phaseB.push({ settleAfterKillMs: tSettle - tKill, status: r.status, reason: r.stats?.reason });
      rawTrials.push({ trial: i + 1, workerPid: pid, tKillEpochMs: tKill, tSettleEpochMs: tSettle, settleAfterKillMs: tSettle - tKill, status: r.status, reason: r.stats?.reason, clientMsOfRequest: round(r.ms, 1), cpuStatBefore: cg0, cpuStatAfter: cg1, nrThrottledDelta: cg0 && cg1 ? cg1.nrThrottled - cg0.nrThrottled : null, throttledMsDelta: cg0 && cg1 ? cg1.throttledMs - cg0.throttledMs : null, loadavg: os.loadavg().map((x) => +x.toFixed(2)), apiEldMaxMsDuringTrial: st.eld.max, apiEldP99MsDuringTrial: st.eld.p99 });
    }
    await tr(api, 'vi-en', makeText('vi', 100)); // respawn proof
    const { events, failures } = await api.get('/events');
    for (const t of rawTrials) {
      const exit = events.find((e) => e.type === 'exit' && e.pid === t.workerPid);
      const settled = exit ? events.find((e) => e.type === 'settled' && e.t >= exit.t) : null;
      t.apiExitEventEpochMs = exit?.wall ?? null;
      t.apiSettledEventEpochMs = settled?.wall ?? null;
      t.killToApiExitEventMs = exit ? exit.wall - t.tKillEpochMs : null;
      t.exitEventToSettledMs = exit && settled ? settled.wall - exit.wall : null;
      t.settledToClientMs = settled ? t.tSettleEpochMs - settled.wall : null;
    }
    const an = analyzeEvents(events, 1);
    const sp = events.filter((e) => e.type === 'spawn');
    const ex = events.filter((e) => e.type === 'exit');
    const respawnAfterExitMs = ex.map((e, i) => (sp[i + 1] ? round(sp[i + 1].t - e.t, 1) : null)).filter((x) => x !== null);
    const out = {
      phaseA_breaker: { trials: phaseA, afterOpen: { status: open.status, reason: open.stats?.reason, ms: round(openMs, 1) } },
      method: 'tKill/tSettle stamped in the orchestrator process (Date.now) around process.kill and the waiter HTTP response; API-side exit/settled event wall stamps split the interval; cgroup cpu.stat delta per trial; see rawTrials',
      rawTrials,
      cgroupAfterPhaseB: cgroup(),
      phaseB_settle: { trials: phaseB.length, settleAfterKillMs: summarize(phaseB.map((x) => x.settleAfterKillMs)), allUnavailableCrash: phaseB.every((x) => x.status === 'UNAVAILABLE' && x.reason === 'crash'), under100ms: phaseB.filter((x) => x.settleAfterKillMs < 100).length },
      respawnAfterExitMs: summarize(respawnAfterExitMs),
      killToApiExitEventMs: summarize(rawTrials.map((t) => t.killToApiExitEventMs)),
      exitEventToSettledMs: summarize(rawTrials.map((t) => t.exitEventToSettledMs)),
      settledToClientMs: summarize(rawTrials.map((t) => t.settledToClientMs)),
      eventAnalysis: an,
      failuresByKind: failures.reduce((a, f) => ((a[f.kind] = (a[f.kind] ?? 0) + 1), a), {}),
    };
    await api.stop();
    return out;
  },

  async killcycles() {
    const N = FAST ? 5 : 20;
    const api = await startApi({ ...baseEnv, ...LONG, BENCH_INTRA: '1' });
    const s0 = await stats(api);
    const series = [];
    let workerHwm = [];
    for (let i = 0; i < N; i++) {
      const r = await tr(api, 'vi-en', makeText('vi', 100)); // (re)loads the model in a fresh worker
      const pid = await workerPid(api);
      workerHwm.push(procStatus(pid)?.vmHwmMb ?? r.stats?.worker?.rssMb);
      series.push({ cycle: i + 1, status: r.status, apiRssMb: (await stats(api)).rssMb, childrenAlive: isLinux ? childrenOf(api.pid).length : null });
      process.kill(pid, 'SIGKILL');
      await sleep(150);
    }
    const s1 = await stats(api);
    const { events } = await api.get('/events');
    const an = analyzeEvents(events, 1);
    const out = { cycles: N, apiRssStartMb: s0.rssMb, apiRssEndMb: s1.rssMb, apiRssDeltaMb: round(s1.rssMb - s0.rssMb), apiRssSeriesMb: series.map((x) => x.apiRssMb), workerHwmMbPerCycle: workerHwm, allOk: series.every((x) => x.status === 'OK'), maxChildrenAlive: Math.max(...series.map((x) => x.childrenAlive ?? 0)), eventAnalysis: an, spawns: events.filter((e) => e.type === 'spawn').length };
    await api.stop();
    return out;
  },

  async longrun() {
    const N = Number(E.BENCH_JOBS ?? 200);
    const api = await startApi({ ...baseEnv, ...LONG, BENCH_INTRA: '1' });
    const s0 = await stats(api);
    const series = [];
    const lat = [];
    let pid = null;
    for (let i = 0; i < N; i++) {
      const dir = i % 2 ? 'en-vi' : 'vi-en';
      const r = await tr(api, dir, makeText(i % 2 ? 'en' : 'vi', 90));
      lat.push(r.ms);
      if (r.status !== 'OK') throw new Error('non-OK ' + r.status);
      pid ??= await workerPid(api);
      if (i === 5 || (i + 1) % Math.max(10, Math.floor(N / 10)) === 0) series.push({ job: i + 1, worker: procStatus(pid) ?? { vmRssMb: r.stats?.worker?.rssMb }, apiRssMb: (await stats(api)).rssMb });
    }
    const s1 = await stats(api);
    const w = series.map((x) => x.worker.vmRssMb);
    const out = { jobs: N, latencyMs: summarize(lat), series, workerRssGrowthMbFromJob6: round(w[w.length - 1] - w[0]), apiRssStartMb: s0.rssMb, apiRssEndMb: s1.rssMb, cgroup: cgroup() };
    await api.stop();
    return out;
  },

  async threads() {
    const out = [];
    for (const intra of [1, 2]) {
      const api = await startApi({ ...baseEnv, ...LONG, BENCH_INTRA: String(intra) });
      await tr(api, 'vi-en', makeText('vi', 100));
      const pid = await workerPid(api);
      const idle = procStatus(pid);
      let max = idle?.threads ?? 0;
      const timer = setInterval(() => (max = Math.max(max, procStatus(pid)?.threads ?? 0)), 20);
      const lat = [];
      for (let i = 0; i < 4; i++) lat.push((await tr(api, 'vi-en', makeText('vi', 1000))).ms);
      clearInterval(timer);
      out.push({ intraOpNumThreads: intra, threadsIdleAfterLoad: idle?.threads ?? null, threadsMaxDuringRuns: isLinux ? max : null, latency1000charsMs: summarize(lat, 0), procStatus: procStatus(pid) });
      await api.stop();
    }
    return { runs: out, cpusVisible: os.availableParallelism() };
  },

  /** V-4 on real models: the compute clock starts when run is SENT to a READY worker (not at dispatch), and the waiter's response deadline still bounds a long load. */
  async clock() {
    const trials = [];
    for (let i = 0; i < (FAST ? 2 : 5); i++) {
      // cold worker every trial; computeMaxMs deliberately SHORTER than spawn + model load (~1.3 to 2.2 s measured earlier)
      const api = await startApi({ ...baseEnv, BENCH_COMPUTE_MAX_MS: E.BENCH_CLOCK_COMPUTE_MS || '1500', BENCH_TIMEOUT_MS: '30000', BENCH_KILL_GRACE_MS: '3000', BENCH_BREAKER_THRESHOLD: '1000000', BENCH_INTRA: '1' });
      const r = await tr(api, 'vi-en', 'Giấy phép phần mềm sẽ hết hạn vào cuối tháng này.');
      const { events } = await api.get('/events');
      const d = events.find((e) => e.type === 'dispatch');
      const ld = events.find((e) => e.type === 'loaded');
      const rs = events.find((e) => e.type === 'runSent');
      trials.push({
        status: r.status,
        reason: r.stats?.reason,
        dispatchToLoadedMs: ld && d ? round(ld.t - d.t, 1) : null,
        workerLoadMs: ld?.ms ?? null,
        workerLockMs: ld?.lockMs ?? null,
        dispatchToRunSentMs: rs && d ? round(rs.t - d.t, 1) : null,
        computeWindowMs: rs ? rs.computeDeadlineEpochMs - rs.wall : null,
        runMs: r.stats?.runMs,
        totalMs: round(r.ms, 1),
        killSent: events.filter((e) => e.type === 'killSent').length,
        deadlineEvents: events.filter((e) => e.type === 'deadline').length,
      });
      await api.stop();
    }
    // response deadline during a cold load: waiter budget 700 ms < spawn+load; job abandoned during load, model kept
    const api = await startApi({ ...baseEnv, BENCH_COMPUTE_MAX_MS: '10000', BENCH_TIMEOUT_MS: '700', BENCH_BREAKER_THRESHOLD: '1000000', BENCH_INTRA: '1' });
    const t0 = Date.now();
    const early = await tr(api, 'vi-en', 'Giấy phép phần mềm sẽ hết hạn vào cuối tháng này.');
    const earlyMs = Date.now() - t0;
    await sleep(4000); // let the blocking load finish; the cancelled job must release without running
    await api.post('/config', { timeoutMs: 30000 });
    const later = await tr(api, 'vi-en', 'Giấy phép phần mềm sẽ hết hạn vào cuối tháng này.');
    const ev = (await api.get('/events')).events;
    const out = {
      coldTrials: trials,
      allColdOk: trials.every((t) => t.status === 'OK'),
      allKillFree: trials.every((t) => t.killSent === 0 && t.deadlineEvents === 0),
      computeMaxMsUsed: Number(E.BENCH_CLOCK_COMPUTE_MS || 1500),
      loadLongerThanComputeWindow: trials.filter((t) => t.dispatchToRunSentMs > Number(E.BENCH_CLOCK_COMPUTE_MS || 1500)).length,
      responseDeadlineDuringLoad: { firstStatus: early.status, firstReason: early.stats?.reason, firstMs: earlyMs, laterStatus: later.status, runSentCount: ev.filter((e) => e.type === 'runSent').length, loadStartCount: ev.filter((e) => e.type === 'loadStart').length, releaseBy: ev.filter((e) => e.type === 'release').map((e) => e.by), spawnCount: ev.filter((e) => e.type === 'spawn').length },
    };
    await api.stop();
    return out;
  },

  /** V-3 on a real process tree: spawn failures (missing exec path / missing cwd -> async 'error' with pid undefined) and a worker script that does not exist (node starts, exits 1). Needs no model load. */
  async spawnfail() {
    const cases = {
      missingExecPath: { BENCH_EXEC_PATH: '/nonexistent/node-binary' },
      missingCwd: { BENCH_SPAWN_CWD: '/nonexistent/cwd' },
      missingWorkerScript: { BENCH_WORKER_PATH: '/nonexistent/worker.mjs' },
    };
    const out = {};
    for (const [name, extra] of Object.entries(cases)) {
      const api = await startApi({ ...baseEnv, ...LONG, BENCH_COMPUTE_MAX_MS: '5000', BENCH_TIMEOUT_MS: '8000', BENCH_BREAKER_THRESHOLD: '3', BENCH_SHUTDOWN_GRACE_MS: '2000', BENCH_INTRA: '1', ...extra });
      const results = [];
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        const r = await tr(api, 'vi-en', makeText('vi', 60, i + 1), { timeoutMs: 8000 });
        const s = await stats(api);
        results.push({ status: r.status, reason: r.stats?.reason, ms: round(performance.now() - t0, 1), liveWorkerPids: s.workers.map((w) => w.pid).filter(Boolean).length, breaker: s.coordinator.breakers['vi-en']?.state });
      }
      const { events, failures } = await api.get('/events');
      const an = analyzeEvents(events, 1);
      const tStop = Date.now();
      const exit = await api.stop();
      out[name] = {
        results,
        spawnFailedEvents: events.filter((e) => e.type === 'spawnFailed').map((e) => ({ phase: e.phase, code: e.code })),
        failuresByKind: failures.reduce((a, f) => ((a[f.kind] = (a[f.kind] ?? 0) + 1), a), {}),
        eventAnalysis: an,
        apiShutdownMs: Date.now() - tStop,
        apiExit: { code: exit.code, signal: exit.signal },
        shutdownSummary: api.shutdownEvents,
        neverHung: results.every((r) => r.ms < 8000),
      };
    }
    return out;
  },

  async sigterm() {
    const trials = [];
    for (let i = 0; i < 4; i++) {
      const duringLoad = i === 3;
      const api = await startApi({ ...baseEnv, ...LONG, BENCH_SHUTDOWN_GRACE_MS: '5000', BENCH_INTRA: '1' });
      if (!duringLoad) await tr(api, 'vi-en', makeText('vi', 100));
      const p = tr(api, 'vi-en', makeText('vi', 4000));
      if (!duringLoad) await waitExecuting(api);
      else await sleep(300);
      await sleep(200);
      const wpid = await workerPid(api);
      const pids = [api.pid, wpid];
      const tTerm = Date.now();
      api.child.kill('SIGTERM');
      const exit = await api.exited;
      const apiExitMs = exit.at - tTerm;
      let workerGoneMs = null;
      while (workerGoneMs === null && Date.now() - tTerm < 15_000) {
        if (!pidAlive(wpid)) workerGoneMs = Date.now() - tTerm;
        else await sleep(10);
      }
      const r = await p.catch(() => ({ status: 'CLIENT_ERROR' }));
      trials.push({ phase: duringLoad ? 'during-cold-load' : 'during-run', apiExit: { code: exit.code, signal: exit.signal }, apiExitMs, workerGoneMs, orphanAfter: pids.filter(pidAlive), clientStatus: r.status, summary: api.shutdownEvents });
    }
    return { trials, graceMs: 5000, allWithinGracePlus1s: trials.every((t) => t.apiExitMs <= 6000 && (t.workerGoneMs ?? 1e9) <= 6000), allCodeZero: trials.every((t) => t.apiExit.code === 0) };
  },
};

const names = process.argv.slice(2);
for (const name of names) {
  if (!scenarios[name]) {
    console.error('unknown scenario', name);
    process.exit(2);
  }
  const t0 = Date.now();
  console.error(`== ${name} ...`);
  let result;
  try {
    result = await scenarios[name]();
  } catch (e) {
    result = { error: String(e?.stack ?? e).split('\n').slice(0, 6).join(' | ') };
  }
  const doc = { scenario: name, profile: PROFILE, node: process.version, platform: `${process.platform}-${process.arch}`, transformersPath: 'direct-generate', seconds: Math.round((Date.now() - t0) / 1000), cgroupAfter: cgroup(), result };
  fs.writeFileSync(path.join(OUT, `${PROFILE}-${name}${SUFFIX}.json`), JSON.stringify(doc, null, 2) + '\n');
  console.error(`== ${name} done in ${doc.seconds}s${result.error ? ' ERROR ' + result.error : ''}`);
}
process.exit(0);
