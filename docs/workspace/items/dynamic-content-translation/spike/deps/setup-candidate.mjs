// Creates an isolated scratch project for one @huggingface/transformers version,
// installs it with dependency scripts disabled (like the product Dockerfile),
// audits it, checks CJS/ESM loadability and writes small filtered evidence JSON.
//
// Flags: --no-optional (experiment), --drop-onnxruntime-web (A1 override), --smoke
// Usage:
//   node setup-candidate.mjs <label> <version> [--no-optional] [--smoke]
//
// Env:
//   SPIKE_SCRATCH   scratch root (default: <os tmpdir>/translation-spike-deps)
//   SPIKE_MODELS_DIR  directory that contains Xenova/opus-mt-* (needed for --smoke)
//   SPIKE_PNPM      pnpm command (default: pnpm). Must report 11.1.3.
//
// Nothing here touches the product repository.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [label, version, ...flags] = process.argv.slice(2);
if (!label || !version) {
  console.error('usage: node setup-candidate.mjs <label> <version> [--no-optional] [--smoke]');
  process.exit(2);
}
const noOptional = flags.includes('--no-optional');
const doSmoke = flags.includes('--smoke');
// A1 variant: remove onnxruntime-web from the transformers dependency list via a pnpm override ('-' = remove).
const dropOrtWeb = flags.includes('--drop-onnxruntime-web');
const scratchRoot = process.env.SPIKE_SCRATCH || path.join(os.tmpdir(), 'translation-spike-deps');
const pnpm = process.env.SPIKE_PNPM || 'pnpm';
const proj = path.join(scratchRoot, label);
const evidenceDir = path.join(here, 'evidence');
const home = os.homedir();

const scrub = (s) => String(s).split(home).join('<home>').split(home.replace(/\\/g, '/')).join('<home>');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: proj, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

fs.mkdirSync(proj, { recursive: true });
const pnpmVersion = run(pnpm, ['--version']).stdout.trim();
if (pnpmVersion !== '11.1.3') {
  console.error(`pnpm must be 11.1.3, got "${pnpmVersion}"`);
  process.exit(3);
}

// Same install policy as the product pnpm-workspace.yaml (scripts of sharp / onnxruntime-node / protobufjs off).
fs.writeFileSync(
  path.join(proj, 'package.json'),
  JSON.stringify(
    {
      name: `spike-${label}`,
      version: '0.0.0',
      private: true,
      packageManager: 'pnpm@11.1.3',
      engines: { node: '>=22 <25' },
      dependencies: { '@huggingface/transformers': version },
    },
    null,
    2,
  ) + '\n',
);
fs.writeFileSync(
  path.join(proj, 'pnpm-workspace.yaml'),
  [
    'allowBuilds:',
    '  # CPU binaries are bundled. Do not download optional CUDA binaries during install.',
    '  onnxruntime-node: false',
    '  protobufjs: false',
    '  sharp: false',
    ...(dropOrtWeb ? ['overrides:', "  '@huggingface/transformers>onnxruntime-web': '-'"] : []),
    '',
  ].join('\n'),
);
fs.copyFileSync(path.join(here, 'smoke.mjs'), path.join(proj, 'smoke.mjs'));
fs.copyFileSync(path.join(here, 'probe-quality.mjs'), path.join(proj, 'probe-quality.mjs'));

const steps = [];
function step(name, args) {
  const t = Date.now();
  const r = run(pnpm, args);
  steps.push({ step: name, command: `${pnpm} ${args.join(' ')}`, exitCode: r.code, seconds: +((Date.now() - t) / 1000).toFixed(1) });
  if (r.code !== 0 && !name.startsWith('audit')) {
    console.error(scrub(r.stdout + r.stderr));
    throw new Error(`step ${name} failed`);
  }
  return r;
}

step('lockfile-only', ['install', '--lockfile-only', '--ignore-scripts']);
const installArgs = ['install', '--prod', '--frozen-lockfile', '--ignore-scripts'];
if (noOptional) installArgs.push('--no-optional');
step('install', installArgs);
const auditRun = step('audit', ['audit', '--prod', '--json']);
const auditHigh = step('audit-high-gate', ['audit', '--prod', '--audit-level', 'high']);
const whySharp = run(pnpm, ['why', 'sharp', '--prod']);
const effectiveMinReleaseAge = run(pnpm, ['config', 'get', 'minimumReleaseAge']).stdout.trim();

// ---- audit summary
let audit = null;
try {
  audit = JSON.parse(auditRun.stdout);
} catch {
  audit = { parseError: true, raw: auditRun.stdout.slice(0, 500) };
}
const auditSummary = audit.metadata
  ? {
      exitCode: auditRun.code,
      vulnerabilities: audit.metadata.vulnerabilities,
      totalDependencies: audit.metadata.totalDependencies,
      advisories: Object.values(audit.advisories || {}).map((a) => ({
        id: a.id,
        ghsa: a.github_advisory_id,
        module: a.module_name,
        severity: a.severity,
        vulnerable: a.vulnerable_versions,
        patched: a.patched_versions,
        findings: a.findings.map((f) => ({ version: f.version, paths: f.paths })),
      })),
    }
  : audit;

// ---- lockfile facts
const lockPath = path.join(proj, 'pnpm-lock.yaml');
const lockBuf = fs.readFileSync(lockPath);
const lockText = lockBuf.toString('utf8');
const resolved = {};
for (const name of ['@huggingface/transformers', '@huggingface/jinja', '@huggingface/tokenizers', 'sharp', 'onnxruntime-node', 'onnxruntime-web', 'onnxruntime-common', 'protobufjs', 'sprintf-js']) {
  const esc = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const re = new RegExp(`^  '?${esc}@([^':\\s]+)'?:`, 'gm');
  resolved[name] = [...lockText.matchAll(re)].map((m) => m[1]);
}
const imgPlatforms = [...lockText.matchAll(/^  '?(@img\/sharp-[^@']+)@([^':\s]+)'?:/gm)].map((m) => `${m[1]}@${m[2]}`);

// ---- CJS / ESM loadability (clean process each, cwd = scratch project)
function nodeEval(code) {
  const r = run('node', ['-e', JSON.stringify(code)]);
  return { exitCode: r.code, stdout: scrub(r.stdout).trim().slice(0, 300), stderr: scrub(r.stderr).trim().split('\n').slice(0, 6).join('\n').slice(0, 800) };
}
const loadChecks = {
  node: process.version,
  cjsRequire: nodeEval("const m=require('@huggingface/transformers');console.log(typeof m.pipeline,typeof m.env)"),
  esmDynamicImportFromCjs: nodeEval("import('@huggingface/transformers').then(m=>console.log(typeof m.pipeline,typeof m.env))"),
  esmStaticImport: (() => {
    fs.writeFileSync(path.join(proj, 'esm-check.mjs'), "import * as m from '@huggingface/transformers';console.log(typeof m.pipeline,typeof m.env);\n");
    const r = run('node', ['esm-check.mjs']);
    return { exitCode: r.code, stdout: r.stdout.trim().slice(0, 300), stderr: scrub(r.stderr).trim().split('\n').slice(0, 6).join('\n').slice(0, 800) };
  })(),
};

const evidence = {
  label,
  requestedVersion: version,
  noOptional,
  generatedAt: new Date().toISOString(),
  platform: `${process.platform}-${process.arch}`,
  node: process.version,
  pnpm: pnpmVersion,
  steps,
  lockfile: { sha256: createHash('sha256').update(lockBuf).digest('hex'), bytes: lockBuf.length },
  resolved,
  sharpPlatformPackagesInLockfile: imgPlatforms.length,
  audit: auditSummary,
  auditHighGateExitCode: auditHigh.code,
  pnpmWhySharp: scrub(whySharp.stdout).trim().split('\n').slice(0, 12),
  minimumReleaseAgeEffective: effectiveMinReleaseAge,
  dropOnnxruntimeWeb: dropOrtWeb,
  loadChecks,
};
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(path.join(evidenceDir, `${label}.json`), JSON.stringify(evidence, null, 2) + '\n');
console.log(`evidence/${label}.json written; audit exit=${auditRun.code}`);

if (doSmoke) {
  if (!process.env.SPIKE_MODELS_DIR) throw new Error('SPIKE_MODELS_DIR required for --smoke');
  const out = path.join(evidenceDir, `${label}-smoke-${process.platform}.json`);
  const r = run('node', ['smoke.mjs'], { env: { ...process.env, SPIKE_OUT: out, SPIKE_LABEL: label } });
  console.log(scrub(r.stdout).split('\n').slice(-3).join('\n'));
  if (r.code !== 0) console.error(scrub(r.stderr).slice(0, 1500));
  console.log(`smoke exit=${r.code}`);
}
