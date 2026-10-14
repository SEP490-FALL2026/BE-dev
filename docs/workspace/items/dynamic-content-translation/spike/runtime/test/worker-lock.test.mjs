// The REAL worker process (worker/main.mjs) with NO model and NO library installed: proves the load order
// (lock first, library second) without any inference. Dummy model tree + dummy locks in a temp dir.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const MAIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'worker', 'main.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-wlock-'));
const kids = new Set();
after(() => {
  for (const k of kids) k.kill('SIGKILL');
  fs.rmSync(tmp, { recursive: true, force: true });
});

const sha = (b) => createHash('sha256').update(b).digest('hex');
function tree(id, files) {
  const lockFiles = {};
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(tmp, ...id.split('/'), ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    lockFiles[rel] = { bytes: Buffer.byteLength(content), sha256: sha(content) };
  }
  return lockFiles;
}
const ID = 'Xenova/opus-mt-vi-en';
const goodFiles = tree(ID, { 'config.json': '{"x":1}', 'onnx/m.onnx': 'weights' });
const mkLock = (files) => ({ schema: 1, models: { [ID]: { revision: 'c'.repeat(40), files } } });
const lockFile = (name, lock) => {
  const f = path.join(tmp, name);
  fs.writeFileSync(f, JSON.stringify(lock));
  return f;
};

function loadVia(lockPath, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = fork(MAIN, [], {
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SPIKE_MODELS_DIR: tmp, SPIKE_MODEL_LOCK: lockPath, SPIKE_DEPS_DIR: path.join(tmp, 'no-deps-here'), ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      execArgv: [],
    });
    kids.add(child);
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    child.stdout.resume();
    const timer = setTimeout(() => reject(new Error('worker did not answer')), 15000);
    child.on('message', (m) => {
      if (m.type === 'loadFailed' || m.type === 'loaded') {
        clearTimeout(timer);
        child.kill('SIGKILL');
        resolve({ msg: m, stderr });
      }
    });
    child.on('error', reject);
    child.send({ type: 'load', direction: 'vi-en' });
  });
}

test('lock mismatch (wrong hash): loadFailed permanent MODEL_LOCK_MISMATCH, the library is never imported (no import error in stderr)', async () => {
  const wrong = { ...goodFiles, 'config.json': { ...goodFiles['config.json'], sha256: 'f'.repeat(64) } };
  const { msg, stderr } = await loadVia(lockFile('lock-bad.json', mkLock(wrong)));
  assert.equal(msg.type, 'loadFailed');
  assert.equal(msg.permanent, true);
  assert.equal(msg.code, 'MODEL_LOCK_MISMATCH');
  assert.match(stderr, /lockMismatch vi-en reason=hash/);
  assert.ok(!/loadFailed vi-en/.test(stderr), 'the library/adapter path was not reached');
});

test('lock mismatch (extra file in the model dir): permanent MODEL_LOCK_MISMATCH', async () => {
  fs.writeFileSync(path.join(tmp, 'Xenova', 'opus-mt-vi-en', 'onnx', 'extra.onnx'), 'x');
  const { msg, stderr } = await loadVia(lockFile('lock-good.json', mkLock(goodFiles)));
  assert.equal(msg.code, 'MODEL_LOCK_MISMATCH');
  assert.match(stderr, /reason=extra/);
  fs.rmSync(path.join(tmp, 'Xenova', 'opus-mt-vi-en', 'onnx', 'extra.onnx'));
});

test('unreadable / missing lock file fails closed as MODEL_LOCK_MISMATCH', async () => {
  const { msg } = await loadVia(path.join(tmp, 'does-not-exist.json'));
  assert.equal(msg.code, 'MODEL_LOCK_MISMATCH');
  assert.equal(msg.permanent, true);
});

test('lock passes -> only then the library is imported: with no library installed the failure comes from the library import (ENOENT, existing rule: permanent) and carries NO lock code', async () => {
  const { msg, stderr } = await loadVia(lockFile('lock-good2.json', mkLock(goodFiles)));
  assert.equal(msg.type, 'loadFailed');
  assert.equal(msg.code, undefined);
  assert.match(stderr, /loadFailed vi-en permanent=(true|false) name=Error code=ENOENT/);
  assert.ok(!/lockMismatch/.test(stderr));
});
