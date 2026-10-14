// R-09 measurement: cost of POST /auth/invitations/redeem with a bogus token (Argon2id runs before the
// token lookup). Usage: node r09-redeem-cost.mjs <repoRoot> <workDir>. Starts dist/main.js on the live DB.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const [repoRoot, workDir] = process.argv.slice(2);
const env = (f) => Object.fromEntries(readFileSync(join(workDir, f), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const live = env('live.env');
const s = env('secrets.env');
const PORT = 53204;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const api = spawn(process.execPath, [join(repoRoot, 'dist', 'main.js')], {
  cwd: workDir,
  env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...live, PORT: String(PORT), RATE_LIMIT_LIMIT: '10000', DATABASE_URL: `postgresql://rr_admin:${s.ADPW}@127.0.0.1:${s.PGPORT}/${s.LIVEDB}` },
  stdio: 'ignore',
  windowsHide: true,
});
const timed = async (method, path, body) => {
  const t = Date.now();
  const r = await fetch(`${BASE}${path}`, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  await r.text();
  return { status: r.status, ms: Date.now() - t };
};
const bogus = () => timed('POST', '/auth/invitations/redeem', { token: 'x'.repeat(43), password: 'Bogus-password-for-cost-1' });
const malformed = () => timed('POST', '/auth/invitations/redeem', { token: 'short', password: 'Bogus-password-for-cost-1' });
const stats = (rs) => {
  const ms = rs.map((r) => r.ms).sort((a, b) => a - b);
  return { n: ms.length, statuses: [...new Set(rs.map((r) => r.status))].join(','), p50: ms[Math.floor(ms.length / 2)], max: ms.at(-1) };
};
const out = {};
try {
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(`${BASE}/health/ready`)).status === 200) break;
    } catch {
      /* starting */
    }
    await sleep(200);
  }
  for (let i = 0; i < 3; i += 1) await bogus();
  const seq = [];
  for (let i = 0; i < 10; i += 1) seq.push(await bogus());
  out.sequentialBogusToken = stats(seq);
  const mal = [];
  for (let i = 0; i < 10; i += 1) mal.push(await malformed());
  out.sequentialMalformedToken = stats(mal);
  const liveBase = [];
  for (let i = 0; i < 5; i += 1) liveBase.push(await timed('GET', '/health/live'));
  out.liveAlone = stats(liveBase);
  const burst = Array.from({ length: 30 }, () => bogus());
  await sleep(100);
  const during = [];
  for (let i = 0; i < 5; i += 1) during.push(await timed('GET', '/health/live'));
  const t = Date.now();
  out.burst30Concurrent = { ...stats(await Promise.all(burst)), wallMs: Date.now() - t + 100 };
  out.liveDuringBurst = stats(during);
} finally {
  api.kill();
  writeFileSync(join(workDir, 'r09-redeem-cost.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}
