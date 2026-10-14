// What would the REAL product dependency tree look like with another transformers version?
// Works only on a scratch copy of the product package files (never on the product tree).
//
// Usage: node product-variant.mjs <label> <version> <baseline-dir> [--drop-onnxruntime-web]
//   <baseline-dir>: a scratch directory holding copies of the product package.json, pnpm-lock.yaml, pnpm-workspace.yaml
//   (e.g. the T-1 clone). Result: evidence/<label>.json + the variant dir <SPIKE_SCRATCH>/<label> (use it with run-linux.sh).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [label, version, baseDir, ...flags] = process.argv.slice(2);
const dropOrtWeb = flags.includes('--drop-onnxruntime-web');
const scratch = process.env.SPIKE_SCRATCH || path.join(os.tmpdir(), 'translation-spike-deps');
const proj = path.join(scratch, label);
fs.mkdirSync(proj, { recursive: true });
for (const f of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) fs.copyFileSync(path.join(baseDir, f), path.join(proj, f));

const pkgPath = path.join(proj, 'package.json');
const pkgText = fs.readFileSync(pkgPath, 'utf8');
const nl = pkgText.includes('\r\n') ? '\r\n' : '\n';
const pkg = JSON.parse(pkgText);
const before = pkg.dependencies['@huggingface/transformers'];
pkg.dependencies['@huggingface/transformers'] = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2).replace(/\n/g, nl) + nl);
if (dropOrtWeb) {
  const wsPath = path.join(proj, 'pnpm-workspace.yaml');
  let ws = fs.readFileSync(wsPath, 'utf8');
  ws = ws.replace(/(overrides:\r?\n)/, `$1  '@huggingface/transformers>onnxruntime-web': '-'${nl}`);
  fs.writeFileSync(wsPath, ws);
}

const run = (args) => {
  const t = Date.now();
  const r = spawnSync('pnpm', args, { cwd: proj, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { args: `pnpm ${args.join(' ')}`, exitCode: r.status, seconds: +((Date.now() - t) / 1000).toFixed(1), stdout: r.stdout || '', stderr: r.stderr || '' };
};
const pkgSet = (lockFile) => {
  const set = new Set();
  for (const m of fs.readFileSync(lockFile, 'utf8').matchAll(/^  '?((?:@[^@/'\s]+\/)?[^@'\s]+)@([^':\s(]+)[^:]*'?:\s*(?:\{\})?$/gm)) set.add(`${m[1]}@${m[2]}`);
  return set;
};
const baseSet = pkgSet(path.join(baseDir, 'pnpm-lock.yaml'));

const steps = [];
const update = run(['install', '--lockfile-only', '--ignore-scripts']);
steps.push({ ...update, stdout: undefined, stderr: update.exitCode ? update.stderr.slice(-600) : undefined });
const install = run(['install', '--prod', '--frozen-lockfile', '--ignore-scripts']);
steps.push({ ...install, stdout: undefined, stderr: install.exitCode ? install.stderr.slice(-600) : undefined });
const auditJson = run(['audit', '--prod', '--json']);
const auditGate = run(['audit', '--prod', '--audit-level', 'high']);
steps.push({ ...auditGate, stdout: undefined, stderr: undefined });
let audit = null;
try {
  audit = JSON.parse(auditJson.stdout);
} catch {
  /* keep null */
}
const newSet = pkgSet(path.join(proj, 'pnpm-lock.yaml'));
const added = [...newSet].filter((x) => !baseSet.has(x)).sort();
const removed = [...baseSet].filter((x) => !newSet.has(x)).sort();
const lock = fs.readFileSync(path.join(proj, 'pnpm-lock.yaml'));
const why = run(['why', 'sharp', '--prod']);
const evidence = {
  label,
  transformersFrom: before,
  transformersTo: version,
  dropOnnxruntimeWeb: dropOrtWeb,
  steps: steps.map((s) => ({ command: s.args, exitCode: s.exitCode, seconds: s.seconds, stderr: s.stderr })),
  auditHighGateExitCode: auditGate.exitCode,
  audit: audit?.metadata
    ? {
        exitCode: auditJson.exitCode,
        vulnerabilities: audit.metadata.vulnerabilities,
        advisories: Object.values(audit.advisories || {}).map((a) => ({ ghsa: a.github_advisory_id, module: a.module_name, severity: a.severity, paths: a.findings.flatMap((f) => f.paths.slice(0, 2)) })),
      }
    : null,
  lockfile: { sha256: createHash('sha256').update(lock).digest('hex'), bytes: lock.length },
  lockPackagesAddedVsBaseline: added,
  lockPackagesRemovedVsBaseline: removed,
  pnpmWhySharp: why.stdout.split(/\r?\n/).filter(Boolean).slice(0, 8),
};
fs.mkdirSync(path.join(here, 'evidence'), { recursive: true });
fs.writeFileSync(path.join(here, 'evidence', `${label}.json`), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ label, gate: evidence.auditHighGateExitCode, vuln: evidence.audit?.vulnerabilities, added: added.length, removed: removed.length, why: evidence.pnpmWhySharp }));
