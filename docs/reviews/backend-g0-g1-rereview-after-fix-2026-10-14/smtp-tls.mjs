// SMTP STARTTLS check for the outbox worker (re-review a8ba88f). Local sink only; no real recipient.
// Usage: node smtp-tls.mjs <repoRoot> <workDir> <certDir>
//   <certDir>/ca.pem, server.pem, server.key: a CA and a localhost certificate made for this run only.
// Cases: T1 trusted CA + STARTTLS required -> delivered over TLS; T2 untrusted certificate -> not delivered;
// T3 SMTP_TLS=true but the server offers no STARTTLS -> not delivered in clear; T4 SMTP_TLS=false and the
// server offers STARTTLS -> what nodemailer does by default (recorded).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const [repoRoot, workDir, certDir] = process.argv.slice(2);
const req = createRequire(join(repoRoot, 'package.json'));
const { SMTPServer } = req('smtp-server');
const { Client } = req('pg');
const env = (f) => Object.fromEntries(readFileSync(join(workDir, f), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const live = env('live.env');
const s = env('secrets.env');
const DB = `postgresql://rr_admin:${s.ADPW}@127.0.0.1:${s.PGPORT}/${s.LIVEDB}`;
const runDir = join(workDir, 'tls-run');
mkdirSync(runDir, { recursive: true });
const API_PORT = 53203;
const BASE = `http://127.0.0.1:${API_PORT}/api/v1`;
const results = [];
const check = (id, name, ok, detail) => {
  results.push({ id, name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name} — ${detail}`);
};
const note = (id, name, detail) => {
  results.push({ id, name, ok: null, detail });
  console.log(`INFO ${id} ${name} — ${detail}`);
};

let received = [];
function sink(port, { tls }) {
  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: tls ? ['AUTH'] : ['AUTH', 'STARTTLS'],
    ...(tls ? { key: readFileSync(join(certDir, 'server.key')), cert: readFileSync(join(certDir, 'server.pem')) } : {}),
    logger: false,
    onData(stream, session, callback) {
      stream.on('data', () => {});
      stream.on('end', () => {
        received.push({ to: session.envelope.rcptTo.map((r) => r.address), secure: Boolean(session.secure) });
        callback();
      });
    },
  });
  server.on('error', () => {});
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}
const procs = [];
function start(entry, extra, name) {
  const log = createWriteStream(join(runDir, `${name}.log`), { flags: 'a' });
  const child = spawn(process.execPath, [join(repoRoot, 'dist', entry)], { cwd: runDir, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...live, DATABASE_URL: DB, ...extra }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  procs.push(child);
  return child;
}
const stop = async (child) => {
  if (child.exitCode !== null) return;
  const done = new Promise((r) => child.once('exit', r));
  child.kill();
  await done;
};

const sql = new Client({ connectionString: DB });
await sql.connect();
const one = async (t, p = []) => (await sql.query(t, p)).rows[0];
try {
  const api = start('main.js', { PORT: String(API_PORT), RATE_LIMIT_LIMIT: '10000' }, 'api');
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(`${BASE}/health/ready`)).status === 200) break;
    } catch {
      /* starting */
    }
    await sleep(200);
  }
  await sql.query('delete from login_throttles');
  const login = await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'sa.review@example.test', password: s.SAPW }) })).json();
  const token = login.data.accessToken;
  const ids = await one('select (select id from organizations) o, (select id from departments) d, (select id from job_titles) j');
  const tag = Date.now().toString(36).toUpperCase();
  async function invite(code) {
    const email = `tls.${code.toLowerCase()}.${tag.toLowerCase()}@example.test`;
    const emp = await one(`insert into employees (id, organization_id, employee_code, full_name, work_email, normalized_work_email, employment_type, hire_date, status, updated_at)
      values (gen_random_uuid(), $1, $2, 'Gia lap TLS', $3, $3, 'STAFF', date '2026-03-02', 'ACTIVE', now()) returning id`, [ids.o, `TLS-${code}-${tag}`, email]);
    await sql.query(`insert into employee_placements (id, organization_id, employee_id, department_id, job_title_id, valid_from) values (gen_random_uuid(), $1, $2, $3, $4, date '2026-03-02')`, [ids.o, emp.id, ids.d, ids.j]);
    const r = await fetch(`${BASE}/app-users`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ employeeId: emp.id, roles: [] }) });
    if (r.status !== 201) throw new Error(`create ${r.status}`);
    return email;
  }
  async function outcome(email, ms = 9000) {
    const end = Date.now() + ms;
    let row;
    while (Date.now() < end) {
      row = await one('select status, attempts, last_error_code from email_outbox where recipient=$1', [email]);
      if (row && row.status !== 'PENDING' && row.status !== 'SENDING') break;
      if (row?.attempts >= 1 && row.status === 'PENDING') break;
      await sleep(300);
    }
    return { row, mail: received.find((m) => m.to.includes(email)) };
  }
  async function scenario(id, name, { tlsSink, workerEnv }, judge) {
    received = [];
    const port = 52530 + results.length;
    const server = await sink(port, { tls: tlsSink });
    const worker = start('worker.js', { SMTP_HOST: 'localhost', SMTP_PORT: String(port), OUTBOX_POLL_INTERVAL_MS: '500', ...workerEnv }, `worker-${id}`);
    await sleep(1500);
    const email = await invite(id);
    const { row, mail } = await outcome(email);
    await stop(worker);
    await new Promise((r) => server.close(r));
    const detail = `outbox ${row?.status}/${row?.attempts}/${row?.last_error_code ?? '-'}; mail ${mail ? (mail.secure ? 'received over TLS' : 'received IN CLEAR') : 'not received'}`;
    if (judge) check(id, name, judge(row, mail), detail);
    else note(id, name, detail);
    // leave nothing pending for later scenarios
    await sql.query(`update email_outbox set status='CANCELLED', payload_ciphertext=null where recipient=$1 and status in ('PENDING','SENDING')`, [email]);
  }
  const ca = join(certDir, 'ca.pem');
  await scenario('T1', 'SMTP_TLS=true, CA trusted (NODE_EXTRA_CA_CERTS): delivered over STARTTLS', { tlsSink: true, workerEnv: { SMTP_TLS: 'true', NODE_EXTRA_CA_CERTS: ca } }, (row, mail) => row?.status === 'SENT' && mail?.secure);
  await scenario('T2', 'SMTP_TLS=true, certificate not trusted: not delivered, row retried later (no clear-text fallback)', { tlsSink: true, workerEnv: { SMTP_TLS: 'true' } }, (row, mail) => !mail && row?.status === 'PENDING' && row.attempts >= 1);
  await scenario('T3', 'SMTP_TLS=true, server offers no STARTTLS: not delivered in clear', { tlsSink: false, workerEnv: { SMTP_TLS: 'true', NODE_EXTRA_CA_CERTS: ca } }, (row, mail) => !mail && row?.status !== 'SENT');
  await scenario('T4', 'SMTP_TLS=false, server offers STARTTLS with a trusted CA (nodemailer opportunistic upgrade)', { tlsSink: true, workerEnv: { SMTP_TLS: 'false', NODE_EXTRA_CA_CERTS: ca } });
  await scenario('T5', 'SMTP_TLS=false, server offers STARTTLS with an untrusted certificate', { tlsSink: true, workerEnv: { SMTP_TLS: 'false' } });
  await stop(api);
} catch (error) {
  check('RUN', 'runner aborted', false, `${error.name}: ${error.message}`);
} finally {
  for (const p of procs) await stop(p);
  await sql.end();
  writeFileSync(join(runDir, 'results.json'), JSON.stringify(results, null, 1));
  const fail = results.filter((r) => r.ok === false).length;
  console.log(JSON.stringify({ pass: results.filter((r) => r.ok).length, fail, info: results.filter((r) => r.ok === null).length }));
  process.exit(fail ? 1 : 0);
}
