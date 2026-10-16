import { fork } from 'node:child_process';
import { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Supervisor } from '../supervisor.mjs';

export const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fake-worker.mjs');

// Safety net: a failing assertion must never leave a forked worker keeping the test process alive.
const allChildren = new Set();
after(() => {
  for (const c of allChildren) c.kill('SIGKILL');
});

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(cond, timeoutMs = 3000, what = 'condition') {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting for ${what}`);
    await sleep(5);
  }
}

export const pidAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Supervisor wired to fake-worker processes; records every spawned pid and every supervisor event. */
export function makeSup(opts = {}, envForSpawn = () => ({})) {
  const spawned = [];
  const events = [];
  const sup = new Supervisor({
    concurrency: 1,
    computeMaxMs: 3000, // cold start (fork + load) is part of the compute window; tests that need a short deadline warm up first
    killGraceMs: 200,
    loadTimeoutMs: 1500,
    loadBackoffMinMs: 100,
    loadBackoffMaxMs: 800,
    shutdownGraceMs: 1000,
    spawn: ({ spawnIndex }) => {
      const child = fork(FAKE, [], {
        env: { ...envForSpawn(spawnIndex) },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        execArgv: [],
      });
      spawned.push(child.pid);
      allChildren.add(child);
      return child;
    },
    ...opts,
  });
  sup.on('event', (e) => events.push(e));
  const ofType = (type, pred = () => true) => events.filter((e) => e.type === type && pred(e));
  const livePids = () => spawned.filter(pidAlive);
  return { sup, spawned, events, ofType, livePids };
}

/** Samples OS-level liveness of every pid ever spawned; returns a stop() that yields the max simultaneously alive. */
export function sampleLive(h, everyMs = 5) {
  let max = 0;
  const timer = setInterval(() => {
    max = Math.max(max, h.livePids().length);
  }, everyMs);
  return () => {
    clearInterval(timer);
    return max;
  };
}

/** Run one quick job so the worker process is spawned and the direction is loaded. */
export async function warm(h, direction = 'vi-en') {
  const o = await h.sup.enqueue({ direction, segments: ['n=1 step=1 warm'] }).settled;
  if (o.state !== 'DONE') throw new Error('warm-up job failed: ' + JSON.stringify(o));
}
