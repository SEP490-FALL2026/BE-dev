// Phase 2 of the live review: global rate limit, production profile, database outage, worker SIGTERM in Docker.
// Usage: node phase2.mjs <repoRoot> <workDir>   (same files as live-smoke.mjs; the live DB must be bootstrapped)
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const [repoRoot, workDir] = process.argv.slice(2);
const req = createRequire(join(repoRoot, 'package.json'));
const { SMTPServer } = req('smtp-server');
const { Client } = req('pg');
const parseEnv = (file) => Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const liveEnv = parseEnv(join(workDir, 'live.env'));
const secrets = parseEnv(join(workDir, 'secrets.env'));
const PG = `slm-review-pg17-${secrets.RUN}`;
const DB_URL = `postgresql://review_admin:${secrets.ADPW}@127.0.0.1:${secrets.PGPORT}/${secrets.LIVEDB}`;
const runDir = join(workDir, 'phase2-run');
mkdirSync(runDir, { recursive: true });
const results = [];
const check = (id, name, ok, detail = '') => { results.push({ id, name, ok: Boolean(ok), detail: String(detail) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}${detail ? ' — ' + detail : ''}`); };
const note = (id, name, detail) => { results.push({ id, name, ok: null, detail: String(detail) }); console.log(`INFO ${id} ${name} — ${detail}`); };
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();

const baseEnv = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, ...liveEnv, DATABASE_URL: DB_URL };
const procs = {};
function start(name, entry, extra) {
  const log = createWriteStream(join(runDir, `${name}.log`), { flags: 'a' });
  const child = spawn(process.execPath, [join(repoRoot, 'dist', entry)], { cwd: runDir, env: { ...baseEnv, ...extra }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.pipe(log); child.stderr.pipe(log);
  procs[name] = child;
  return child;
}
async function stop(name) { const c = procs[name]; if (!c || c.exitCode !== null) return; const e = new Promise((r) => c.once('exit', r)); c.kill(); await e; delete procs[name]; }
async function http(port, method, path, { token, cookie, body, headers = {}, timeoutMs = 25000 } = {}) {
  const h = { ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  if (cookie) h.cookie = `slm_refresh=${cookie}`;
  if (body !== undefined) h['content-type'] = 'application/json';
  const t = Date.now();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* raw */ }
    const sc = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('slm_refresh='));
    return { status: res.status, json, code: json?.error?.code ?? json?.message, setCookie: sc, cookieValue: sc ? decodeURIComponent(sc.split(';')[0].slice(12)) : undefined, ms: Date.now() - t };
  } catch (error) { return { status: 0, code: error.name, ms: Date.now() - t }; }
}
async function waitHealthy(port, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) { const r = await http(port, 'GET', '/health/ready', { timeoutMs: 3000 }); if (r.status === 200) return true; await sleep(300); }
  return false;
}
const SA_EMAIL = 'sa.review@example.test';

const sink = { mode: 'accept', slowMs: 0, messages: [] };
const smtp = new SMTPServer({ authOptional: true, disabledCommands: ['STARTTLS', 'AUTH'], logger: false,
  onData(stream, session, cb) { stream.on('data', () => {}); stream.on('end', async () => { if (sink.mode === 'slow') await sleep(sink.slowMs); sink.messages.push({ to: session.envelope.rcptTo.map((r) => r.address), at: Date.now() }); cb(); }); } });
smtp.on('error', () => {});
await new Promise((r) => smtp.listen(52526, '0.0.0.0', r));

const sql = new Client({ connectionString: DB_URL });
sql.on('error', () => {});
await sql.connect();
await sql.query('delete from login_throttles');
const PHASES = process.env.PHASES ?? 'ABPSD';

try {
  if (PHASES.includes('A')) {
  // ------------------------------------------------ A. global per-IP rate limit (profile: 10 requests / 60 s)
  start('api-rl', 'main.js', { PORT: '53102', RATE_LIMIT_LIMIT: '10' });
  await waitHealthy(53102);
  await sleep(61000); // let the readiness polling fall out of the 60 s window
  const saRl = await http(53102, 'POST', '/auth/login', { body: { email: SA_EMAIL, password: secrets.SAPW } });
  const statuses = [];
  for (let i = 0; i < 10; i += 1) statuses.push((await http(53102, 'GET', '/health/live')).status);
  const limited = await http(53102, 'GET', '/health/live');
  const logoutLimited = await http(53102, 'POST', '/auth/logout', { cookie: saRl.cookieValue });
  const meLimited = await http(53102, 'GET', '/me', { token: saRl.json?.data?.accessToken });
  check('RL-1', 'global throttler: request 11 in the window -> 429 before authentication', limited.status === 429, `${[saRl.status, ...statuses].join(',')} -> ${limited.status} ${limited.code}`);
  check('RL-2', 'logout while throttled -> 429 and the cookie is NOT cleared (contract)', logoutLimited.status === 429 && !logoutLimited.setCookie, `${logoutLimited.status} cleared=${Boolean(logoutLimited.setCookie)}`);
  note('RL-3', 'authenticated /me while throttled', `${meLimited.status} ${meLimited.code}`);
  await stop('api-rl');
  }

  if (PHASES.includes('B')) {
  // ------------------------------------------------ B. production profile (HTTP over localhost, no TLS fixture)
  const prodEnv = {
    PORT: '53103', NODE_ENV: 'production', AUTH_COOKIE_SECURE: '', SWAGGER_ENABLED: '',
    CORS_ORIGINS: 'https://app.review.example', APP_PUBLIC_URL: 'https://app.review.example',
    OBJECT_STORAGE_ENDPOINT: 'https://storage.review.example', REDIS_PASSWORD: 'review-only-not-used', SMTP_TLS: 'true',
  };
  for (const k of Object.keys(prodEnv)) if (prodEnv[k] === '') delete baseEnv[k];
  start('api-prod', 'main.js', Object.fromEntries(Object.entries(prodEnv).filter(([, v]) => v !== '')));
  const prodUp = await waitHealthy(53103);
  check('PR-1', 'production profile starts with explicit secrets and no Redis/MinIO running', prodUp);
  const prodLogin = await http(53103, 'POST', '/auth/login', { body: { email: SA_EMAIL, password: secrets.SAPW } });
  check('PR-2', 'production refresh cookie carries Secure, HttpOnly, SameSite=Strict', /Secure/.test(prodLogin.setCookie ?? '') && /HttpOnly/.test(prodLogin.setCookie ?? '') && /SameSite=Strict/.test(prodLogin.setCookie ?? ''), (prodLogin.setCookie ?? '').replace(/slm_refresh=[^;]+/, 'slm_refresh=<redacted>'));
  const docs = await fetch('http://127.0.0.1:53103/api/docs');
  check('PR-3', 'Swagger is not mounted in production by default', docs.status === 404, docs.status);
  await stop('api-prod');
  for (const k of ['AUTH_COOKIE_SECURE', 'SWAGGER_ENABLED']) baseEnv[k] = liveEnv[k];
  // The worker refuses to start in production without TLS settings that a local sink cannot satisfy; record only.
  const prodWorkerEnvMissing = execFileSync(process.execPath, ['-e', 'process.exit(0)']);
  void prodWorkerEnvMissing;
  }

  // ------------------------------------------------ C. database outage
  start('api-db', 'main.js', { PORT: '53104' });
  await waitHealthy(53104);
  const sa = await http(53104, 'POST', '/auth/login', { body: { email: SA_EMAIL, password: secrets.SAPW } });
  const token = sa.json.data.accessToken;
  if (PHASES.includes('P')) {
  docker('pause', PG);
  const pausedAt = Date.now();
  const paused = await Promise.all([
    http(53104, 'GET', '/me', { token }),
    http(53104, 'POST', '/auth/login', { body: { email: SA_EMAIL, password: secrets.SAPW } }),
    http(53104, 'POST', '/auth/refresh', { cookie: sa.cookieValue }),
    http(53104, 'GET', '/app-users', { token }),
    http(53104, 'GET', '/health/ready'),
  ]);
  note('DB-1', 'PostgreSQL paused (network partition, connections hang): /me, login, refresh, /app-users, ready', paused.map((r) => `${r.status}${r.code ? '/' + r.code : ''}@${r.ms}ms`).join(' | '));
  check('DB-1b', 'every request answers within 25 s while the database hangs (no unbounded wait)', paused.every((r) => r.status !== 0), paused.map((r) => r.status).join(','));
  docker('unpause', PG);
  await sleep(3000);
  const afterUnpause = await http(53104, 'GET', '/me', { token });
  check('DB-2', 'after unpause the same token works again', afterUnpause.status === 200, `${afterUnpause.status} (paused ${Math.round((Date.now() - pausedAt) / 1000)} s)`);
  }
  if (PHASES.includes('S')) {
  docker('stop', PG);
  const stopped = await Promise.all([
    http(53104, 'GET', '/me', { token }),
    http(53104, 'POST', '/auth/login', { body: { email: SA_EMAIL, password: secrets.SAPW } }),
    http(53104, 'POST', '/auth/refresh', { cookie: sa.cookieValue }),
    http(53104, 'POST', '/auth/logout', { cookie: sa.cookieValue }),
    http(53104, 'GET', '/app-users', { token }),
    http(53104, 'GET', '/health/ready'),
  ]);
  const want = [[503, 'TOKEN_VERIFICATION_UNAVAILABLE'], [503, 'AUTH.UNAVAILABLE'], [503, 'AUTH.UNAVAILABLE'], [503, 'AUTH.UNAVAILABLE'], [503, 'TOKEN_VERIFICATION_UNAVAILABLE'], [503, undefined]];
  check('DB-3', 'PostgreSQL stopped (connection refused): 503 with the contract codes, never 401/500; refresh/logout keep the cookie',
    stopped.every((r, i) => r.status === want[i][0] && (want[i][1] === undefined || r.code === want[i][1])) && !stopped[2].setCookie && !stopped[3].setCookie,
    stopped.map((r) => `${r.status}/${r.code}@${r.ms}ms`).join(' | '));
  docker('start', PG);
  let back = false;
  for (let i = 0; i < 60 && !back; i += 1) { await sleep(1000); back = (await http(53104, 'GET', '/me', { token, timeoutMs: 5000 })).status === 200; }
  check('DB-4', 'after the database restarts the API recovers without a restart', back);
  }
  await sql.end().catch(() => {});
  if (PHASES.includes('D')) {

  // ------------------------------------------------ D. worker in the runtime image: SIGTERM during an SMTP send
  const sql2 = new Client({ connectionString: DB_URL });
  sql2.on('error', () => {});
  for (let i = 0; i < 30; i += 1) { try { await sql2.connect(); break; } catch { await sleep(1000); } }
  const reach = (() => { try { return docker('run', '--rm', '--add-host=host.docker.internal:host-gateway', '--entrypoint', 'node', 'saas-sentry-be-review:64073c4', '-e', "require('net').connect(52526,'host.docker.internal').on('connect',()=>{console.log('ok');process.exit(0)}).on('error',e=>{console.log(e.code);process.exit(1)})"); } catch (e) { return String(e.stdout ?? e.message).trim(); } })();
  note('SIG-0', 'container can reach the host SMTP sink', reach);
  const org = (await sql2.query('select id from organizations')).rows[0].id;
  const dept = (await sql2.query('select id from departments')).rows[0].id;
  const title = (await sql2.query('select id from job_titles')).rows[0].id;
  const emp = (await sql2.query(`insert into employees (id, organization_id, employee_code, full_name, work_email, normalized_work_email, employment_type, hire_date, status, updated_at)
     values (gen_random_uuid(), $1, 'FX-SIG02', 'Gia lap SIG2', 'fx.sig02@example.test', 'fx.sig02@example.test', 'STAFF', date '2026-03-02', 'ACTIVE', now()) on conflict do nothing returning id`, [org])).rows[0]?.id;
  if (emp) await sql2.query(`insert into employee_placements (id, organization_id, employee_id, department_id, job_title_id, valid_from) values (gen_random_uuid(), $1, $2, $3, $4, date '2026-03-02')`, [org, emp, dept, title]);
  const cname = `slm-review-worker-${secrets.RUN}`;
  docker('run', '-d', '--name', cname, '--label', `review=slm-g0g1-${secrets.RUN}`, '--network', `slm-review-net-${secrets.RUN}`, '--add-host=host.docker.internal:host-gateway',
    '--env-file', join(workDir, 'live.env'), '-e', `DATABASE_URL=postgresql://review_admin:${secrets.ADPW}@reviewpg:5432/${secrets.LIVEDB}`,
    '-e', 'SMTP_HOST=host.docker.internal', '-e', 'SMTP_PORT=52526', 'saas-sentry-be-review:64073c4', 'node', 'dist/worker.js');
  await sleep(4000);
  sink.mode = 'slow'; sink.slowMs = 10000;
  const created = await http(53104, 'POST', '/app-users', { token, body: { employeeId: emp, roles: [] } });
  let row;
  for (let i = 0; i < 20; i += 1) { row = (await sql2.query(`select status from email_outbox where recipient='fx.sig02@example.test'`)).rows[0]; if (row?.status === 'SENDING') break; await sleep(500); }
  const stopStarted = Date.now();
  docker('stop', '-t', '30', cname);
  const stopMs = Date.now() - stopStarted;
  const exitCode = docker('inspect', '-f', '{{.State.ExitCode}}', cname);
  const final = (await sql2.query(`select status, attempts, last_error_code, to_char(updated_at,'HH24:MI:SS.MS') upd from email_outbox where recipient='fx.sig02@example.test'`)).rows[0];
  const mails = sink.messages.filter((m) => m.to.includes('fx.sig02@example.test')).length;
  const logs = docker('logs', cname).split('\n').filter((l) => /error|warn/i.test(l)).map((l) => l.replace(/"stack":"[^"]*"/, '"stack":"…"').slice(0, 220)).slice(0, 5);
  note('SIG-1', 'SIGTERM (docker stop -t 30) while the worker waits on a 10 s SMTP reply', `create ${created.status}; row before stop ${row?.status}; stop took ${stopMs} ms; exit ${exitCode}; row after ${JSON.stringify(final)}; mails ${mails}; logs ${JSON.stringify(logs)}`);
  check('SIG-2', 'graceful stop lets the in-flight send finish and record SENT (no duplicate later)', final?.status === 'SENT' && mails === 1, JSON.stringify(final));
  writeFileSync(join(runDir, 'worker-container.log'), docker('logs', '-t', cname));
  note('SIG-3', 'timeline', `stop started ${new Date(stopStarted).toISOString().slice(11,23)}; mail accepted ${sink.messages.filter((m) => m.to.includes('fx.sig02@example.test')).map((m) => new Date(m.at).toISOString().slice(11,23)).join(',')}`);
  docker('rm', cname);
  await sql2.end();
  }
} catch (error) {
  check('RUN', 'phase 2 aborted', false, `${error.name}: ${error.message}`);
  try { docker('unpause', PG); } catch { /* not paused */ }
  try { docker('start', PG); } catch { /* running */ }
} finally {
  for (const n of Object.keys(procs)) await stop(n);
  await new Promise((r) => smtp.close(r));
  writeFileSync(join(runDir, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ pass: results.filter((r) => r.ok === true).length, fail: results.filter((r) => r.ok === false).length, info: results.filter((r) => r.ok === null).length }));
}
