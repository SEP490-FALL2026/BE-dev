// Prints a markdown results table from evidence/*.json. Usage: node summarize.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ev = path.join(path.dirname(fileURLToPath(import.meta.url)), 'evidence');
const read = (f) => (fs.existsSync(path.join(ev, f)) ? JSON.parse(fs.readFileSync(path.join(ev, f), 'utf8')) : null);
const sev = (v) => (v ? `${v.high}H/${v.moderate}M/${v.critical}C/${v.low}L` : 'n/a');
const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 'n/a');
function smokeCells(s) {
  if (!s) return ['n/a', 'n/a', 'n/a', 'n/a'];
  if (!s.models)
    return [
      String(s.ok),
      'n/a',
      'n/a',
      `${s.peakRssSampledMb ?? '?'} (error: ${(s.error || '').split('\n')[0].slice(0, 60)})`,
    ];
  const loads = Object.values(s.models)
    .map((m) => m.loadMs)
    .join('/');
  const ms = Object.values(s.models).flatMap((m) => (m.sentences || []).map((x) => x.secondMs));
  return [String(s.ok), loads, avg(ms), String(s.vmHwmMb ?? s.peakRssSampledMb)];
}
const rows = [
  ['t381', '3.8.1 (baseline)'],
  ['t431', '4.3.1 (A0)'],
  ['t431-a1', '4.3.1 + drop onnxruntime-web (A1)'],
  ['t381-no-optional', '3.8.1 --no-optional (experiment)'],
  ['t431-no-optional', '4.3.1 --no-optional (experiment)'],
];
const out = [];
out.push(
  '| candidate | sharp | ort-node | ort-web | audit H/M/C/L | audit-high gate exit | CJS require / ESM import | Win smoke ok | load ms (vi-en/en-vi) | warm ms/sentence | peak RSS MB (Win) |',
);
out.push('|---|---|---|---|---|---|---|---|---|---|---|');
for (const [l, name] of rows) {
  const e = read(`${l}.json`);
  const s = read(`${l}-smoke-win32.json`);
  if (!e) continue;
  const c = smokeCells(s);
  out.push(
    `| ${name} | ${e.resolved.sharp[0]} | ${e.resolved['onnxruntime-node'][0]} | ${e.resolved['onnxruntime-web'][0] ?? 'absent'} | ${sev(e.audit.vulnerabilities)} | ${e.auditHighGateExitCode} | ${e.loadChecks.cjsRequire.exitCode === 0 ? 'ok' : 'FAIL'} / ${e.loadChecks.esmStaticImport.exitCode === 0 ? 'ok' : 'FAIL'} | ${c[0]} | ${c[1]} | ${c[2]} | ${c[3]} |`,
  );
}
out.push('');
out.push(
  '| Linux container (node:24-bookworm-slim, user node, --network none) | install | smoke ok | load ms | warm ms/sentence | VmHWM MB | fetch attempts | node |',
);
out.push('|---|---|---|---|---|---|---|---|');
for (const [l, name] of [
  ['product-wt', 'product working-tree lock (3.8.1, full prod tree)'],
  ['t381', '3.8.1 minimal'],
  ['t431', '4.3.1 minimal (A0)'],
  ['t431-a1', '4.3.1 minimal + drop ort-web (A1)'],
  ['product-431', 'product lock with 4.3.1 (scratch copy)'],
  ['product-431-a1', 'product lock with 4.3.1 + drop ort-web (scratch copy)'],
]) {
  for (const suffix of ['', '-mem768m']) {
    const s = read(`${l}-smoke-linux${suffix}.json`);
    if (!s) continue;
    const c = smokeCells(s);
    out.push(
      `| ${name}${suffix ? ' [--memory 768m]' : ''} | ok | ${c[0]} | ${c[1]} | ${c[2]} | ${s.vmHwmMb} | ${s.fetchCalls?.count} (+${s.fetchCalls?.envFetchLocalCalls ?? 0} local env.fetch) | ${s.node} |`,
    );
  }
}
console.log(out.join('\n'));
