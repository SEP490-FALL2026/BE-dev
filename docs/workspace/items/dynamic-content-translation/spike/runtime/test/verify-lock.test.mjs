// Model lock probe (review finding 6). Unit tests on a temp dir of small dummy files and a matching dummy lock.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyLock, validateLockShape, MODEL_LOCK_CODE } from '../verify-lock.mjs';

const tmpRoots = [];
after(() => {
  for (const d of tmpRoots) fs.rmSync(d, { recursive: true, force: true });
});

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

/** Creates root/<model>/<file> for two dummy models and returns { root, lock }. */
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-lock-'));
  tmpRoots.push(root);
  const files = {
    'Xenova/m-a': { 'config.json': '{"a":1}', 'onnx/enc.onnx': Buffer.alloc(3 * 1024 * 1024 + 17, 7), 'README.md': 'readme a' },
    'Xenova/m-b': { 'config.json': '{"b":2}', 'onnx/dec.onnx': Buffer.alloc(1000, 9) },
  };
  const lock = { schema: 1, models: {}, allowExtra: ['manifest.json'] };
  for (const [id, fs_] of Object.entries(files)) {
    lock.models[id] = { revision: 'a'.repeat(40), files: {} };
    for (const [rel, content] of Object.entries(fs_)) {
      const buf = Buffer.from(content);
      const abs = path.join(root, ...id.split('/'), ...rel.split('/'));
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, buf);
      lock.models[id].files[rel] = { bytes: buf.length, sha256: sha(buf) };
    }
  }
  return { root, lock, abs: (id, rel) => path.join(root, ...id.split('/'), ...rel.split('/')) };
}

const clone = (o) => JSON.parse(JSON.stringify(o));

test('matching tree: ok, counts files and bytes, error code constant is MODEL_LOCK_MISMATCH', async () => {
  const f = fixture();
  const r = await verifyLock({ root: f.root, lock: f.lock });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.files, 5);
  assert.ok(r.bytes > 3 * 1024 * 1024);
  assert.equal(MODEL_LOCK_CODE, 'MODEL_LOCK_MISMATCH');
});

test('wrong hash with the SAME size: reason hash', async () => {
  const f = fixture();
  const p = f.abs('Xenova/m-b', 'config.json');
  fs.writeFileSync(p, '{"b":3}'); // same length as {"b":2}
  const r = await verifyLock({ root: f.root, lock: f.lock });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'hash');
  assert.match(r.detail, /Xenova\/m-b.*config\.json/);
});

test('wrong size is rejected BEFORE hashing (reason size)', async () => {
  const f = fixture();
  fs.appendFileSync(f.abs('Xenova/m-a', 'onnx/enc.onnx'), 'x');
  const r = await verifyLock({ root: f.root, lock: f.lock });
  assert.equal(r.reason, 'size');
});

test('missing file: reason missing; a directory where a file is expected: reason missing', async () => {
  const f = fixture();
  fs.rmSync(f.abs('Xenova/m-a', 'README.md'));
  assert.equal((await verifyLock({ root: f.root, lock: f.lock })).reason, 'missing');
  const g = fixture();
  fs.rmSync(g.abs('Xenova/m-a', 'README.md'));
  fs.mkdirSync(g.abs('Xenova/m-a', 'README.md'));
  assert.equal((await verifyLock({ root: g.root, lock: g.lock })).reason, 'missing');
});

test('unexpected extra file is rejected (also nested, also at the root); manifest.json passes only when allowExtra lists it', async () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.root, 'manifest.json'), '[]');
  assert.equal((await verifyLock({ root: f.root, lock: f.lock })).ok, true, 'listed extra is allowed');
  fs.writeFileSync(f.abs('Xenova/m-a', 'onnx/evil.onnx'), 'x');
  const r = await verifyLock({ root: f.root, lock: f.lock });
  assert.equal(r.reason, 'extra');
  assert.match(r.detail, /evil\.onnx/);
  const g = fixture();
  fs.writeFileSync(path.join(g.root, 'stray.txt'), 'x');
  assert.equal((await verifyLock({ root: g.root, lock: g.lock })).reason, 'extra');
  const h = fixture();
  const lock2 = clone(h.lock);
  delete lock2.allowExtra;
  fs.writeFileSync(path.join(h.root, 'manifest.json'), '[]');
  assert.equal((await verifyLock({ root: h.root, lock: lock2 })).reason, 'extra', 'not listed: rejected');
});

test('an extra file that differs only by case is an extra file (not silently the locked one)', async () => {
  const f = fixture();
  // On a case-insensitive FS this would just overwrite config.json; use a different name that case-folds to nothing locked.
  fs.writeFileSync(f.abs('Xenova/m-a', 'Config.json.bak'), 'x');
  assert.equal((await verifyLock({ root: f.root, lock: f.lock })).reason, 'extra');
});

test('models filter: verifies only the selected model (corruption/extras elsewhere are ignored), but still strict inside it', async () => {
  const f = fixture();
  fs.writeFileSync(f.abs('Xenova/m-b', 'config.json'), '{"b":9}');
  fs.writeFileSync(f.abs('Xenova/m-b', 'extra.bin'), 'x');
  const a = await verifyLock({ root: f.root, lock: f.lock, models: ['Xenova/m-a'] });
  assert.equal(a.ok, true);
  assert.equal(a.files, 3);
  const b = await verifyLock({ root: f.root, lock: f.lock, models: ['Xenova/m-b'] });
  assert.equal(b.ok, false);
  const unknown = await verifyLock({ root: f.root, lock: f.lock, models: ['Xenova/nope'] });
  assert.equal(unknown.reason, 'bad-lock');
});

test('symlinked file is rejected (lstat); skipped with a reason where the OS forbids creating symlinks', async (t) => {
  const f = fixture();
  const target = path.join(f.root, 'outside-copy.bin');
  fs.copyFileSync(f.abs('Xenova/m-b', 'onnx/dec.onnx'), target);
  fs.rmSync(f.abs('Xenova/m-b', 'onnx/dec.onnx'));
  try {
    fs.symlinkSync(target, f.abs('Xenova/m-b', 'onnx/dec.onnx'), 'file');
  } catch (e) {
    t.skip(`cannot create file symlinks here (${e.code}); junction/dir test below still covers path components`);
    return;
  }
  const r = await verifyLock({ root: f.root, lock: f.lock });
  assert.equal(r.ok, false);
  assert.ok(r.reason === 'symlink' || r.reason === 'extra', r.reason); // identical content, but a link must never pass
  const only = await verifyLock({ root: f.root, lock: f.lock, models: ['Xenova/m-b'] });
  assert.equal(only.reason, 'symlink');
});

test('a symlinked / junction DIRECTORY inside the tree is rejected and cannot lead outside the root', async () => {
  const f = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-lock-outside-'));
  tmpRoots.push(outside);
  fs.writeFileSync(path.join(outside, 'dec.onnx'), Buffer.alloc(1000, 9));
  fs.rmSync(path.join(f.root, 'Xenova', 'm-b', 'onnx'), { recursive: true });
  fs.symlinkSync(outside, path.join(f.root, 'Xenova', 'm-b', 'onnx'), 'junction'); // junctions need no privilege on Windows
  const r = await verifyLock({ root: f.root, lock: f.lock });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'symlink');
});

test('hostile lock paths are rejected before touching the filesystem (reason bad-lock)', async () => {
  const f = fixture();
  const bad = [
    '../escape.json',
    'a/../b.json',
    '/abs.json',
    'C:/abs.json',
    'a\\b.json',
    'a\u0000b.json',
    'a//b.json',
    './a.json',
    'a/./b.json',
    'trailing/',
    '',
    '..',
    '.',
    'sp ace.json',
    'ünï.json',
    'a:b.json',
  ];
  for (const rel of bad) {
    const lock = clone(f.lock);
    lock.models['Xenova/m-a'].files[rel] = { bytes: 1, sha256: 'b'.repeat(64) };
    const r = await verifyLock({ root: f.root, lock });
    assert.equal(r.ok, false, JSON.stringify(rel));
    assert.equal(r.reason, 'bad-lock', JSON.stringify(rel) + ' -> ' + r.reason);
  }
  for (const id of ['../m', '/m', 'a\\b', 'x/../y', '', 'a b']) {
    const lock = clone(f.lock);
    lock.models[id] = { revision: 'a'.repeat(40), files: { 'config.json': { bytes: 1, sha256: 'b'.repeat(64) } } };
    const r = await verifyLock({ root: f.root, lock });
    assert.equal(r.reason, 'bad-lock', JSON.stringify(id));
  }
});

test('case-insensitive duplicates in the lock are rejected (they would alias on Windows/macOS)', async () => {
  const f = fixture();
  const lock = clone(f.lock);
  lock.models['Xenova/m-a'].files['CONFIG.json'] = { ...lock.models['Xenova/m-a'].files['config.json'] };
  assert.equal((await verifyLock({ root: f.root, lock })).reason, 'bad-lock');
  const lock2 = clone(f.lock);
  lock2.models['xenova/M-A'] = clone(lock2.models['Xenova/m-a']);
  assert.equal((await verifyLock({ root: f.root, lock: lock2 })).reason, 'bad-lock');
});

test('malformed lock entries: bad sha256, bad bytes, bad revision, no files, wrong schema, not an object', () => {
  const f = fixture();
  const mutate = (fn) => {
    const l = clone(f.lock);
    fn(l);
    return validateLockShape(l);
  };
  assert.equal(validateLockShape(f.lock).ok, true);
  assert.equal(mutate((l) => (l.models['Xenova/m-a'].files['config.json'].sha256 = 'ABC')).ok, false);
  assert.equal(mutate((l) => (l.models['Xenova/m-a'].files['config.json'].sha256 = 'A'.repeat(64))).ok, false, 'upper case hex rejected');
  assert.equal(mutate((l) => (l.models['Xenova/m-a'].files['config.json'].bytes = -1)).ok, false);
  assert.equal(mutate((l) => (l.models['Xenova/m-a'].files['config.json'].bytes = 1.5)).ok, false);
  assert.equal(mutate((l) => (l.models['Xenova/m-a'].revision = 'main')).ok, false);
  assert.equal(mutate((l) => (l.models['Xenova/m-a'].files = {})).ok, false);
  assert.equal(mutate((l) => (l.schema = 2)).ok, false);
  assert.equal(mutate((l) => (l.allowExtra = ['../x'])).ok, false);
  assert.equal(validateLockShape(null).ok, false);
  assert.equal(validateLockShape([]).ok, false);
});

test('root problems: missing root, root is a file', async () => {
  const f = fixture();
  assert.equal((await verifyLock({ root: path.join(f.root, 'nope'), lock: f.lock })).reason, 'bad-root');
  assert.equal((await verifyLock({ root: f.abs('Xenova/m-b', 'config.json'), lock: f.lock })).reason, 'bad-root');
});

test('the verification result never contains file contents', async () => {
  const f = fixture();
  fs.writeFileSync(f.abs('Xenova/m-b', 'config.json'), '{"b":3}');
  const r = await verifyLock({ root: f.root, lock: f.lock });
  assert.ok(!JSON.stringify(r).includes('"b":3'));
});
