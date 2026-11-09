// Offline checker for a supervisor event log. Proves (from the log, not from reasoning) that:
//  - live workers <= concurrency at all times (spawn/exit pairing),
//  - a slot is dispatched only when idle (previous job released),
//  - a release `by:'exit'` is preceded by that slot's exit event,
//  - a killSent is followed by exit before the slot is released / reused / respawned,
//  - a spawn into a slot happens only after the previous process of that slot exited,
//  - run intervals (started..done/error/exit) of the same slot never overlap.
export function analyzeEvents(events, concurrency) {
  const violations = [];
  const slots = new Map(); // slot -> { alive:boolean, busyJob:number|null, killPending:boolean, exitSinceDispatch:boolean, running:number|null }
  const S = (id) => {
    if (!slots.has(id))
      slots.set(id, { alive: false, busyJob: null, killPending: false, exited: false, running: null });
    return slots.get(id);
  };
  let live = 0;
  let maxLive = 0;
  let dispatches = 0;
  let releasesByExit = 0;
  let kills = 0;
  let concurrentRuns = 0;
  let maxConcurrentRuns = 0;
  for (const e of events) {
    const s = e.slot === undefined ? null : S(e.slot);
    switch (e.type) {
      case 'spawn':
        if (s.alive) violations.push(`t=${e.t} spawn into slot ${e.slot} but previous process not exited`);
        s.alive = true;
        s.killPending = false;
        live++;
        maxLive = Math.max(maxLive, live);
        if (live > concurrency) violations.push(`t=${e.t} live workers ${live} > concurrency ${concurrency}`);
        break;
      case 'dispatch':
        dispatches++;
        if (s.busyJob !== null)
          violations.push(`t=${e.t} dispatch job ${e.jobId} into busy slot ${e.slot} (job ${s.busyJob} not released)`);
        if (s.killPending) violations.push(`t=${e.t} dispatch into slot ${e.slot} while kill pending (no exit yet)`);
        s.busyJob = e.jobId;
        s.exited = false;
        break;
      case 'started':
        if (s.running !== null && s.running !== e.jobId)
          violations.push(
            `t=${e.t} run intervals overlap in slot ${e.slot}: job ${e.jobId} started while ${s.running} running`,
          );
        s.running = e.jobId;
        concurrentRuns++;
        maxConcurrentRuns = Math.max(maxConcurrentRuns, concurrentRuns);
        break;
      case 'done':
      case 'error':
        if (s.running === e.jobId) {
          s.running = null;
          concurrentRuns--;
        }
        break;
      case 'killSent':
        kills++;
        s.killPending = true;
        break;
      case 'exit':
        if (!s.alive) violations.push(`t=${e.t} exit for slot ${e.slot} with no live process`);
        s.alive = false;
        s.killPending = false;
        s.exited = true;
        live--;
        if (s.running !== null) {
          s.running = null;
          concurrentRuns--;
        }
        break;
      case 'spawnFailed':
        // phase 'sync': spawnFn threw, no 'spawn' event was emitted, nothing to close.
        // phase 'async': a 'spawn' event was emitted for a child that never became a process ('error', pid undefined):
        // it closes the slot exactly like an exit (there is no process, so no exit event will ever follow).
        if (e.phase === 'async') {
          if (!s.alive) violations.push(`t=${e.t} async spawnFailed for slot ${e.slot} with no spawned child`);
          s.alive = false;
          s.killPending = false;
          s.exited = true;
          live--;
        }
        break;
      case 'release':
        if (e.by === 'exit') {
          releasesByExit++;
          if (!s.exited) violations.push(`t=${e.t} release by exit in slot ${e.slot} without a preceding exit event`);
        }
        if (s.killPending) violations.push(`t=${e.t} slot ${e.slot} released while a kill was pending (no exit yet)`);
        s.busyJob = null;
        break;
      default:
        break;
    }
  }
  return { violations, maxLive, maxConcurrentRuns, dispatches, kills, releasesByExit, events: events.length };
}
