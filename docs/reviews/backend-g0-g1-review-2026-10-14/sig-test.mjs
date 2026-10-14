// SIGTERM of the worker (runtime image) while an SMTP reply is pending; sink runs on the same Docker network.
// Usage: node sig-test.mjs <repoRoot> <workDir> <slowMs> <stopAfterMs> <code>
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const [repoRoot, workDir, slowMs, stopAfterMs, code] = process.argv.slice(2);
const { Client } = createRequire(join(repoRoot, 'package.json'))('pg');
const env = (f) => Object.fromEntries(readFileSync(join(workDir, f), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const live = env('live.env');
const s = env('secrets.env');
const DB = `postgresql://review_admin:${s.ADPW}@127.0.0.1:${s.PGPORT}/${s.LIVEDB}`;
const docker = (...a) => execFileSync('docker', a, { encoding: 'utf8' }).trim();
const ts = () => new Date().toISOString().slice(11, 23);
const email = `fx.${code.toLowerCase()}@example.test`;
const net = `slm-review-net-${s.RUN}`;
const sinkName = `slm-review-sink-${s.RUN}`;
const workerName = `slm-review-sigw-${s.RUN}`;
const mount = `${workDir.replace(/\//g, '\\')}\\pty:/review:ro`;

const api = spawn(process.execPath, [join(repoRoot, 'dist', 'main.js')], { cwd: join(workDir, 'phase2-run'), env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...live, PORT: '53105', DATABASE_URL: DB }, stdio: 'ignore', windowsHide: true });
const sql = new Client({ connectionString: DB });
sql.on('error', () => {});
const out = { code, slowMs: Number(slowMs), stopAfterMs: Number(stopAfterMs) };
try {
  await sql.connect();
  await sql.query('delete from login_throttles');
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch('http://127.0.0.1:53105/api/v1/health/ready')).status === 200) break; } catch { /* starting */ } await sleep(300); }
  const login = await (await fetch('http://127.0.0.1:53105/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'sa.review@example.test', password: s.SAPW }) })).json();
  const token = login.data.accessToken;
  const ids = (await sql.query('select (select id from organizations) o, (select id from departments) d, (select id from job_titles) j')).rows[0];
  const emp = (await sql.query(`insert into employees (id, organization_id, employee_code, full_name, work_email, normalized_work_email, employment_type, hire_date, status, updated_at)
    values (gen_random_uuid(), $1, $2, 'Gia lap SIG', $3, $3, 'STAFF', date '2026-03-02', 'ACTIVE', now()) returning id`, [ids.o, code, email])).rows[0].id;
  await sql.query(`insert into employee_placements (id, organization_id, employee_id, department_id, job_title_id, valid_from) values (gen_random_uuid(), $1, $2, $3, $4, date '2026-03-02')`, [ids.o, emp, ids.d, ids.j]);

  docker('run', '-d', '--name', sinkName, '--label', `review=slm-g0g1-${s.RUN}`, '--network', net, '--network-alias', 'reviewsmtp', '-e', `SLOW_MS=${slowMs}`, '-v', mount, '--entrypoint', 'node', 'saas-sentry-be-review:64073c4', '/review/mini-smtp.js');
  docker('run', '-d', '--name', workerName, '--label', `review=slm-g0g1-${s.RUN}`, '--network', net, '--env-file', join(workDir, 'live.env'),
    '-e', `DATABASE_URL=postgresql://review_admin:${s.ADPW}@reviewpg:5432/${s.LIVEDB}`, '-e', 'SMTP_HOST=reviewsmtp', '-e', 'SMTP_PORT=2525', 'saas-sentry-be-review:64073c4', 'node', 'dist/worker.js');
  await sleep(4000);
  const created = await fetch('http://127.0.0.1:53105/api/v1/app-users', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ employeeId: emp, roles: [] }) });
  out.create = `${created.status} at ${ts()}`;
  let row;
  for (let i = 0; i < 40; i += 1) { row = (await sql.query('select status from email_outbox where recipient=$1', [email])).rows[0]; if (row?.status === 'SENDING') break; await sleep(250); }
  out.rowBeforeStop = `${row?.status} at ${ts()}`;
  await sleep(Number(stopAfterMs));
  out.stopAt = ts();
  const t = Date.now();
  docker('stop', '-t', '30', workerName);
  out.stopMs = Date.now() - t;
  out.exit = docker('inspect', '-f', '{{.State.ExitCode}}', workerName);
  out.rowAfter = (await sql.query(`select status, attempts, last_error_code, to_char(updated_at,'HH24:MI:SS.MS') upd from email_outbox where recipient=$1`, [email])).rows[0];
  out.sinkLog = docker('logs', sinkName).split('\n').map((l) => l.replace(/<[^>]*>/g, '<rcpt>'));
  writeFileSync(join(workDir, 'phase2-run', `sig-${code}.worker.log`), docker('logs', '-t', workerName));
} finally {
  try { docker('rm', '-f', workerName, sinkName); } catch { /* gone */ }
  api.kill();
  await sql.end().catch(() => {});
  console.log(JSON.stringify(out, null, 1));
}
