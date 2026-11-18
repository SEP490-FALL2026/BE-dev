// Model lock probe: proves the models directory is EXACTLY what model-lock.json says before any inference code runs.
// Spike code, not product code. No dependencies besides Node built-ins; the worker runs it BEFORE importing
// transformers / onnxruntime, so a tampered file is never parsed by a native library.
//
//   verifyLock({ root, lock, models? }) -> { ok:true, files, bytes, ms, models } | { ok:false, reason, detail }
//   reasons: bad-lock | bad-root | symlink | missing | extra | size | hash | escape | io
//   CLI: node verify-lock.mjs <modelsRoot> [lockFile] [--models id,id]   (exit 0 ok / 1 mismatch, JSON on stdout)
//
// Rules (all fail closed):
//  * lock ids and paths must match ^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$ ; no "." / ".." segments, no segment ending in
//    "." (Windows strips it), no Windows device names, no backslash/NUL/colon/space/non-ASCII (the regex excludes them);
//    case-insensitive duplicates (aliases on Windows/macOS) and prefix collisions are rejected.
//  * the root is realpath'd once; every path COMPONENT below it is lstat'ed: a symlink/junction anywhere is rejected,
//    the final entry must be a regular file, and the resolved path must stay under the real root.
//  * size is compared before any hashing; then the SHA-256 is streamed from a file handle (fstat re-checks size/type).
//  * every file under the verified model directories (the whole root when no model filter is given) must be listed in the
//    lock (the root level may also hold files named in `allowExtra`, e.g. manifest.json). Extra file, extra symlink, or
//    a special file => rejected.
//  Limit: verification and the library's later open are separate steps (TOCTOU). The defence for that gap is a read-only
//  mount / a directory the service user cannot write; this probe is an integrity check, not a sandbox.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const MODEL_LOCK_CODE = 'MODEL_LOCK_MISMATCH';

const PATH_RE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
const WIN_DEVICE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;

const fail = (reason, detail) => ({ ok: false, reason, detail: clip(detail) });
const clip = (s) =>
  String(s)
    .replace(/[^\x20-\x7e]/g, '?')
    .slice(0, 240);

/** Is `p` a safe lock-relative path (or model id)? */
export function isSafeRel(p) {
  if (typeof p !== 'string' || p.length === 0 || p.length > 240 || !PATH_RE.test(p)) return false;
  return p
    .split('/')
    .every((seg) => seg !== '.' && seg !== '..' && !seg.endsWith('.') && !/^\.+$/.test(seg) && !WIN_DEVICE.test(seg));
}

export function validateLockShape(lock) {
  const bad = (d) => fail('bad-lock', d);
  if (!lock || typeof lock !== 'object' || Array.isArray(lock)) return bad('lock is not an object');
  if (lock.schema !== 1) return bad('unsupported schema');
  if (!lock.models || typeof lock.models !== 'object' || Array.isArray(lock.models)) return bad('models missing');
  const ids = Object.keys(lock.models);
  if (ids.length === 0) return bad('no models');
  const seenIds = new Set();
  for (const id of ids) {
    if (!isSafeRel(id)) return bad(`unsafe model id ${JSON.stringify(id)}`);
    const lc = id.toLowerCase();
    if (seenIds.has(lc)) return bad(`case-insensitive duplicate model id ${id}`);
    seenIds.add(lc);
  }
  for (const a of seenIds)
    for (const b of seenIds) if (a !== b && b.startsWith(a + '/')) return bad('model ids nest inside each other');
  for (const id of ids) {
    const m = lock.models[id];
    if (!m || typeof m !== 'object') return bad(`model ${id} is not an object`);
    if (typeof m.revision !== 'string' || !HEX40.test(m.revision))
      return bad(`model ${id}: revision must be a 40-hex commit`);
    if (!m.files || typeof m.files !== 'object' || Array.isArray(m.files)) return bad(`model ${id}: files missing`);
    const rels = Object.keys(m.files);
    if (rels.length === 0) return bad(`model ${id}: no files`);
    const seen = new Set();
    for (const rel of rels) {
      if (!isSafeRel(rel)) return bad(`model ${id}: unsafe path ${JSON.stringify(rel)}`);
      const lc = rel.toLowerCase();
      if (seen.has(lc)) return bad(`model ${id}: case-insensitive duplicate ${rel}`);
      seen.add(lc);
      const e = m.files[rel];
      if (!e || typeof e !== 'object') return bad(`model ${id}: ${rel} entry invalid`);
      if (!Number.isSafeInteger(e.bytes) || e.bytes < 0) return bad(`model ${id}: ${rel} bytes invalid`);
      if (typeof e.sha256 !== 'string' || !HEX64.test(e.sha256))
        return bad(`model ${id}: ${rel} sha256 must be 64 lower-case hex`);
    }
    for (const a of seen)
      for (const b of seen)
        if (a !== b && b.startsWith(a + '/')) return bad(`model ${id}: ${a} is both a file and a directory`);
  }
  if (lock.allowExtra !== undefined) {
    if (!Array.isArray(lock.allowExtra) || !lock.allowExtra.every((x) => isSafeRel(x) && !x.includes('/')))
      return bad('allowExtra must be a list of top-level file names');
  }
  return { ok: true };
}

const sameOrUnder = (root, p) => {
  const a = process.platform === 'win32' ? root.toLowerCase() : root;
  const b = process.platform === 'win32' ? p.toLowerCase() : p;
  return b === a || b.startsWith(a.endsWith(path.sep) ? a : a + path.sep);
};

async function walk(dirAbs, relPrefix, out) {
  let entries;
  try {
    entries = await fs.promises.readdir(dirAbs, { withFileTypes: true });
  } catch (e) {
    return e.code === 'ENOENT' ? null : fail('io', `readdir ${relPrefix || '.'}: ${e.code}`);
  }
  for (const d of entries) {
    const rel = relPrefix ? `${relPrefix}/${d.name}` : d.name;
    if (d.isSymbolicLink()) return fail('symlink', rel);
    if (d.isDirectory()) {
      const r = await walk(path.join(dirAbs, d.name), rel, out);
      if (r) return r;
    } else if (d.isFile()) out.push(rel);
    else return fail('extra', `${rel} (not a regular file)`);
  }
  return null;
}

async function hashFile(abs, expectedBytes) {
  const fh = await fs.promises.open(abs, 'r');
  try {
    const st = await fh.stat();
    if (!st.isFile() || st.size !== expectedBytes) return { size: false };
    const h = createHash('sha256');
    for await (const chunk of fh.createReadStream({ autoClose: false })) h.update(chunk);
    return { digest: h.digest('hex') };
  } finally {
    await fh.close();
  }
}

export async function verifyLock({ root, lock, models = null }) {
  const t0 = performance.now();
  const shape = validateLockShape(lock);
  if (!shape.ok) return shape;
  const allIds = Object.keys(lock.models);
  const selected = models === null ? allIds : models;
  for (const id of selected)
    if (!Object.hasOwn(lock.models, id)) return fail('bad-lock', `model ${id} is not in the lock`);

  let realRoot;
  try {
    realRoot = await fs.promises.realpath(root);
    if (!(await fs.promises.stat(realRoot)).isDirectory()) return fail('bad-root', 'root is not a directory');
  } catch (e) {
    return fail('bad-root', `root: ${e.code ?? e.name}`);
  }

  // locked relative paths (root-relative, forward slashes)
  const locked = new Map(); // relFromRoot -> { id, rel, bytes, sha256 }
  for (const id of selected)
    for (const [rel, e] of Object.entries(lock.models[id].files)) locked.set(`${id}/${rel}`, { id, rel, ...e });

  // pass 0: no extra files / symlinks / special entries
  if (models === null) {
    const found = [];
    const r = await walk(realRoot, '', found);
    if (r) return r;
    const allowed = new Set(lock.allowExtra ?? []);
    for (const f of found) if (!locked.has(f) && !allowed.has(f)) return fail('extra', f);
  } else {
    for (const id of selected) {
      const found = [];
      const r = await walk(path.join(realRoot, ...id.split('/')), id, found);
      if (r) return r;
      for (const f of found) if (!locked.has(f)) return fail('extra', f);
    }
  }

  // pass 1: components, type, size (cheap) for every file before any hashing
  const resolved = [];
  for (const [relRoot, e] of locked) {
    const parts = relRoot.split('/');
    let cur = realRoot;
    for (let i = 0; i < parts.length; i++) {
      cur = path.join(cur, parts[i]);
      let st;
      try {
        st = await fs.promises.lstat(cur);
      } catch (err) {
        return fail(
          err.code === 'ENOENT' || err.code === 'ENOTDIR' ? 'missing' : 'io',
          `${relRoot}: ${err.code ?? err.name}`,
        );
      }
      if (st.isSymbolicLink()) return fail('symlink', relRoot);
      const last = i === parts.length - 1;
      if (last ? !st.isFile() : !st.isDirectory())
        return fail('missing', `${relRoot} (not a ${last ? 'regular file' : 'directory'})`);
      if (last && st.size !== e.bytes) return fail('size', `${relRoot}: ${st.size} != ${e.bytes}`);
    }
    let real;
    try {
      real = await fs.promises.realpath(cur);
    } catch (err) {
      return fail('io', `${relRoot}: ${err.code ?? err.name}`);
    }
    if (!sameOrUnder(realRoot, path.resolve(real)) || !sameOrUnder(realRoot, path.resolve(cur)))
      return fail('escape', relRoot);
    resolved.push([relRoot, cur, e]);
  }

  // pass 2: streamed SHA-256
  let bytes = 0;
  for (const [relRoot, abs, e] of resolved) {
    let h;
    try {
      h = await hashFile(abs, e.bytes);
    } catch (err) {
      return fail('io', `${relRoot}: ${err.code ?? err.name}`);
    }
    if (h.size === false) return fail('size', `${relRoot}: changed while verifying`);
    if (h.digest !== e.sha256) return fail('hash', relRoot);
    bytes += e.bytes;
  }
  return { ok: true, files: resolved.length, bytes, ms: +(performance.now() - t0).toFixed(1), models: selected };
}

export async function loadLock(file) {
  return JSON.parse(await fs.promises.readFile(file, 'utf8'));
}

// CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const mi = args.indexOf('--models');
  const models = mi >= 0 ? args.splice(mi, 2)[1].split(',') : null;
  const [root, lockFile = new URL('./model-lock.json', import.meta.url)] = args;
  if (!root) {
    process.stderr.write('usage: node verify-lock.mjs <modelsRoot> [lockFile] [--models id,id]\n');
    process.exit(2);
  }
  const lock = await loadLock(lockFile);
  const r = await verifyLock({ root, lock, models });
  process.stdout.write(JSON.stringify(r) + '\n');
  process.exit(r.ok ? 0 : 1);
}
