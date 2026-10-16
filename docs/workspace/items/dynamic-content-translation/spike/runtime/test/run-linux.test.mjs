// Runner ownership (review finding 7): run-linux.sh against a FAKE docker (no Docker needed). The runner must never
// remove a volume it did not create, never touch spike-runtime-deps, label everything with the run id and remove only
// the containers that carry that label.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(HERE, '..', 'run-linux.sh');
const FAKE = path.join(HERE, 'fake-docker.sh');
const bash = spawnSync('bash', ['--version'], { encoding: 'utf8' });
const skip = bash.status === 0 ? false : 'bash not available';
const toPosix = (p) => p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`);

const dirs = [];
after(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

function setup(volumes = {}) {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-docker-'));
  dirs.push(state);
  fs.mkdirSync(path.join(state, 'volumes'), { recursive: true });
  for (const [name, labels] of Object.entries(volumes)) fs.writeFileSync(path.join(state, 'volumes', name), labels.join('\n') + (labels.length ? '\n' : ''));
  const fakeBin = path.join(state, 'docker');
  fs.copyFileSync(FAKE, fakeBin);
  const run = (args, env = {}) => {
    const r = spawnSync('bash', [toPosix(RUNNER), ...args], {
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, DOCKER: toPosix(fakeBin), FAKE_DOCKER_STATE: toPosix(state), SPIKE_MODELS: toPosix(path.join(HERE, '..')), SPIKE_TIMEOUT_S: '30', ...env },
    });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  const log = () => (fs.existsSync(path.join(state, 'log')) ? fs.readFileSync(path.join(state, 'log'), 'utf8').split('\n').filter(Boolean) : []);
  const volumesNow = () => fs.readdirSync(path.join(state, 'volumes'));
  const containersNow = () => (fs.existsSync(path.join(state, 'containers')) ? fs.readdirSync(path.join(state, 'containers')) : []);
  return { run, log, volumesNow, containersNow, state };
}

const OWNER = 'spike.owner=translation-runtime';

test('install: fresh run creates a NEW volume named after the run id, labelled owner+run; never calls volume rm', { skip }, () => {
  const d = setup();
  const r = d.run(['install'], { RUN_ID: 'r1' });
  assert.equal(r.code, 0, r.out);
  const vols = d.volumesNow();
  assert.deepEqual(vols, ['spike-rt-deps-r1']);
  const labels = fs.readFileSync(path.join(d.state, 'volumes', vols[0]), 'utf8');
  assert.match(labels, /spike\.owner=translation-runtime/);
  assert.match(labels, /spike\.run=r1/);
  assert.ok(!d.log().some((l) => /^volume rm/.test(l)));
  assert.match(r.out, /SPIKE_DEPS_VOLUME=spike-rt-deps-r1/);
  assert.match(r.out, /VERSION=4\.3\.1/);
});

test('install refuses to overwrite an existing volume (labelled or not) unless told explicitly; nothing is removed or created', { skip }, () => {
  for (const labels of [[], [OWNER]]) {
    const d = setup({ mine: labels });
    const r = d.run(['install'], { RUN_ID: 'r2', SPIKE_DEPS_VOLUME: 'mine' });
    assert.notEqual(r.code, 0, r.out);
    assert.match(r.out, /already exists/i);
    assert.ok(!d.log().some((l) => /^volume (rm|create)/.test(l)), d.log().join('\n'));
    assert.ok(!d.log().some((l) => /^run/.test(l)), 'no container ran');
    assert.deepEqual(d.volumesNow(), ['mine']);
  }
});

test('--force-own: refused for an UNLABELLED volume and for the protected spike-runtime-deps (even if someone labelled it)', { skip }, () => {
  const d = setup({ foreign: [], 'spike-runtime-deps': [OWNER] });
  const a = d.run(['install', '--force-own', 'foreign'], { RUN_ID: 'r3' });
  assert.notEqual(a.code, 0);
  assert.match(a.out, /not labelled/i);
  const b = d.run(['install', '--force-own', 'spike-runtime-deps'], { RUN_ID: 'r3' });
  assert.notEqual(b.code, 0);
  assert.match(b.out, /protected/i);
  assert.ok(!d.log().some((l) => /^volume rm/.test(l)));
  assert.deepEqual(d.volumesNow().sort(), ['foreign', 'spike-runtime-deps']);
});

test('--force-own on a volume labelled with the spike owner label: removed and re-created with the labels', { skip }, () => {
  const d = setup({ 'spike-rt-deps-old': [OWNER, 'spike.run=old'] });
  const r = d.run(['install', '--force-own', 'spike-rt-deps-old'], { RUN_ID: 'r4' });
  assert.equal(r.code, 0, r.out);
  const log = d.log();
  assert.equal(log.filter((l) => /^volume rm/.test(l)).length, 1);
  assert.ok(log.find((l) => /^volume rm .*spike-rt-deps-old$/.test(l)));
  assert.match(fs.readFileSync(path.join(d.state, 'volumes', 'spike-rt-deps-old'), 'utf8'), /spike\.run=r4/);
});

test('--reuse spike-runtime-deps: read-only mount, prints version and lockfile hash, creates/removes nothing', { skip }, () => {
  const d = setup({ 'spike-runtime-deps': [] });
  const r = d.run(['install', '--reuse', 'spike-runtime-deps'], { RUN_ID: 'r5' });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /VERSION=4\.3\.1/);
  assert.match(r.out, /LOCKSHA=0123abcd/);
  assert.match(r.out, /SPIKE_DEPS_VOLUME=spike-runtime-deps/);
  const runs = d.log().filter((l) => /^run/.test(l));
  assert.equal(runs.length, 1);
  assert.match(runs[0], /-v spike-runtime-deps:\/app:ro/);
  assert.ok(!d.log().some((l) => /^volume (rm|create)/.test(l)));
  assert.deepEqual(d.volumesNow(), ['spike-runtime-deps']);
});

test('--reuse refuses a volume that is missing or holds another transformers version', { skip }, () => {
  const d = setup({ other: [] });
  const missing = d.run(['install', '--reuse', 'nope'], { RUN_ID: 'r6' });
  assert.notEqual(missing.code, 0);
  const wrong = d.run(['install', '--reuse', 'other'], { RUN_ID: 'r6', FAKE_TF_VERSION: '3.8.1' });
  assert.notEqual(wrong.code, 0);
  assert.match(wrong.out, /4\.3\.1/);
});

test('bench: every container is named + labelled with the run id, deps volume read-only, --network none, resources recorded; removed afterwards only if labelled', { skip }, () => {
  const d = setup({ deps: [] });
  const r = d.run(['bench', 'overrun', 'coldload'], { RUN_ID: 'r7', SPIKE_DEPS_VOLUME: 'deps' });
  assert.equal(r.code, 0, r.out);
  const runs = d.log().filter((l) => /^run/.test(l) && /spike\.run=r7/.test(l) && /BENCH|node \/spike/.test(l));
  assert.equal(runs.length, 2);
  for (const l of runs) {
    assert.match(l, /--label spike\.run=r7/);
    assert.match(l, /--name spike-r7-/);
    assert.match(l, /-v deps:\/app:ro/);
    assert.match(l, /--network none/);
    assert.match(l, /--cpus=2/);
    assert.match(l, /--memory=2g/);
    assert.match(l, /--user node/);
    assert.match(l, /:\/models:ro/);
  }
  assert.match(r.out, /cpus=2 memory=2g/);
  assert.ok(d.log().some((l) => /^rm -f spike-r7-/.test(l)), 'cleanup removed our labelled containers');
  assert.deepEqual(d.containersNow(), []);
});

test('cleanup trap does NOT remove a container whose label is not this run id', { skip }, () => {
  const d = setup({ deps: [] });
  const r = d.run(['bench', 'overrun'], { RUN_ID: 'r8', SPIKE_DEPS_VOLUME: 'deps', FAKE_LABEL_MISMATCH: '1' });
  assert.equal(r.code, 0, r.out);
  assert.ok(!d.log().some((l) => /^rm -f/.test(l)), d.log().join('\n'));
});

test('test/bench without SPIKE_DEPS_VOLUME fail (no implicit default volume); a missing volume fails; a failing container propagates its exit code and is still cleaned', { skip }, () => {
  const d = setup({ deps: [] });
  assert.notEqual(d.run(['bench', 'overrun'], { RUN_ID: 'r9' }).code, 0);
  assert.notEqual(d.run(['test'], { RUN_ID: 'r9', SPIKE_DEPS_VOLUME: 'ghost' }).code, 0);
  const f = d.run(['test'], { RUN_ID: 'r9', SPIKE_DEPS_VOLUME: 'deps', FAKE_RUN_EXIT: '7' });
  assert.notEqual(f.code, 0);
  assert.ok(d.log().some((l) => /^rm -f spike-r9-/.test(l)));
});

test('rm-volume: only owner-labelled, non-protected volumes; list shows only our labels', { skip }, () => {
  const d = setup({ mine: [OWNER], foreign: [], 'spike-runtime-deps': [OWNER] });
  assert.notEqual(d.run(['rm-volume', 'foreign'], { RUN_ID: 'x' }).code, 0);
  assert.notEqual(d.run(['rm-volume', 'spike-runtime-deps'], { RUN_ID: 'x' }).code, 0);
  assert.equal(d.run(['rm-volume', 'mine'], { RUN_ID: 'x' }).code, 0);
  assert.deepEqual(d.volumesNow().sort(), ['foreign', 'spike-runtime-deps']);
});
