// R-02 / R-15 re-review runner: database outages against the built API (dist/main.js) and a real
// PostgreSQL 17 container owned by this re-review.
//
// Usage: node r02-db-outage.mjs <repoRoot> <workDir> <phase...>
//   phases: P (driver error shapes through real Prisma), A (docker pause, warm pool),
//           A2 (short pause during writes), B (docker pause, cold pool), C (connection lost mid-request,
//           database stopped and restarted), D (one statement stalled inside a transaction),
//           D4 (real docker pause exactly when the lock's UPDATE is sent),
//           E (non-transient database error stays 500), M (R-15: /me after the guard)
//   <workDir>/live.env, <workDir>/secrets.env as for live-smoke.mjs. Nothing secret is printed.
//
// Every pause/stop targets only the container whose label is review=slm-g0g1-<RUN>; unpause/start
// always runs in `finally`.
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer, connect } from 'node:net';
import { mkdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const [repoRoot, workDir, ...phaseArgs] = process.argv.slice(2);
const phases = new Set(phaseArgs.length ? phaseArgs : ['P', 'A', 'A2', 'B', 'C', 'D', 'D4', 'E', 'M']);
const req = createRequire(join(repoRoot, 'package.json'));
const { Client } = req('pg');

const parseEnv = (file) =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
const liveEnv = parseEnv(join(workDir, 'live.env'));
const secrets = parseEnv(join(workDir, 'secrets.env'));
const CONTAINER = `slm-rr-pg-${secrets.RUN}`;
const LABEL = `slm-g0g1-${secrets.RUN}`;
const runDir = join(workDir, 'r02-run');
mkdirSync(runDir, { recursive: true });
const PORT = Number(process.env.R02_PORT ?? 53202); // Windows may reserve port ranges after a reboot
const BASE = `http://127.0.0.1:${PORT}/api/v1`;

// ---------------------------------------------------------------- results
const results = [];
function check(id, name, ok, detail = '') {
  results.push({ id, name, ok: Boolean(ok), detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}${detail ? ' — ' + detail : ''}`);
}
function note(id, name, detail) {
  results.push({ id, name, ok: null, detail: String(detail) });
  console.log(`INFO ${id} ${name} — ${detail}`);
}

// ---------------------------------------------------------------- docker (label-checked)
function docker(...args) {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function assertOwnContainer() {
  const label = docker('inspect', '-f', '{{index .Config.Labels "review"}}', CONTAINER);
  if (label !== LABEL) throw new Error(`refusing to touch ${CONTAINER}: label ${label}`);
}
function hostPort() {
  return Number(docker('port', CONTAINER, '5432').split(/\r?\n/)[0].split(':').pop());
}
const pause = () => (assertOwnContainer(), docker('pause', CONTAINER));
const unpause = () => {
  assertOwnContainer();
  if (docker('inspect', '-f', '{{.State.Paused}}', CONTAINER) === 'true') docker('unpause', CONTAINER);
};
async function waitPgReady(timeoutMs = 60000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      docker('exec', CONTAINER, 'pg_isready', '-U', 'postgres', '-q');
      return true;
    } catch {
      await sleep(500);
    }
  }
  return false;
}
const dbUrl = (port, host = '127.0.0.1') => `postgresql://rr_admin:${secrets.ADPW}@${host}:${port}/${secrets.LIVEDB}`;

// ---------------------------------------------------------------- controllable TCP relay
// Forwards bytes between the API and PostgreSQL. It can hold every byte (like `docker pause`), or hold
// one connection from the moment the client sends a statement matching a pattern, until released.
// It parses frontend messages only to read SQL text (Parse / Query); bind values are never read.
class Relay {
  constructor(upstreamPort) {
    this.upstreamPort = upstreamPort;
    this.conns = new Set();
    this.holdAll = false;
    this.trigger = null;
    this.seen = [];
    this.nextId = 1;
    this.server = createServer((client) => this.accept(client));
  }
  async listen() {
    await new Promise((r) => this.server.listen(0, '127.0.0.1', r));
    return this.server.address().port;
  }
  accept(client) {
    const conn = { id: this.nextId++, client, upstream: null, held: false, queue: [], buf: Buffer.alloc(0), startup: true };
    conn.upstream = connect(this.upstreamPort, '127.0.0.1');
    this.conns.add(conn);
    client.on('data', (chunk) => {
      for (const sql of this.parse(conn, chunk)) {
        this.seen.push({ conn: conn.id, at: Date.now(), sql: sql.replace(/\s+/g, ' ').slice(0, 90) });
        if (this.trigger && !this.trigger.firedOn && this.trigger.re.test(sql)) {
          this.trigger.firedOn = conn.id;
          this.trigger.firedAt = Date.now();
          // onFire: act (for example `docker pause`) before the statement is forwarded, instead of holding it here.
          if (this.trigger.onFire) this.trigger.onFire();
          else conn.held = true;
        }
      }
      this.forward(conn, conn.upstream, chunk);
    });
    conn.upstream.on('data', (chunk) => this.forward(conn, client, chunk));
    const close = () => {
      client.destroy();
      conn.upstream.destroy();
      this.conns.delete(conn);
    };
    client.on('close', close).on('error', close);
    conn.upstream.on('close', close).on('error', close);
  }
  forward(conn, to, chunk) {
    if (this.holdAll || conn.held) conn.queue.push([to, chunk]);
    else if (!to.destroyed) to.write(chunk);
  }
  parse(conn, chunk) {
    conn.buf = Buffer.concat([conn.buf, chunk]);
    const out = [];
    for (;;) {
      if (conn.startup) {
        if (conn.buf.length < 8) break;
        const len = conn.buf.readInt32BE(0);
        if (conn.buf.length < len) break;
        const code = conn.buf.readInt32BE(4);
        conn.buf = conn.buf.subarray(len);
        if (code !== 80877103 && code !== 80877104) conn.startup = false;
        continue;
      }
      if (conn.buf.length < 5) break;
      const type = conn.buf[0];
      const len = conn.buf.readInt32BE(1);
      if (conn.buf.length < 1 + len) break;
      const body = conn.buf.subarray(5, 1 + len);
      if (type === 0x51) out.push(body.toString('utf8', 0, body.indexOf(0)));
      if (type === 0x50) {
        const nameEnd = body.indexOf(0);
        out.push(body.toString('utf8', nameEnd + 1, body.indexOf(0, nameEnd + 1)));
      }
      conn.buf = conn.buf.subarray(1 + len);
    }
    return out;
  }
  release(conn) {
    conn.held = false;
    const queue = conn.queue;
    conn.queue = [];
    for (const [to, chunk] of queue) if (!to.destroyed) to.write(chunk);
  }
  releaseAll() {
    this.holdAll = false;
    for (const conn of this.conns) this.release(conn);
  }
  heldConn() {
    return [...this.conns].find((c) => c.id === this.trigger?.firedOn);
  }
  dropAll() {
    for (const conn of this.conns) {
      conn.client.destroy();
      conn.upstream.destroy();
    }
  }
  async close() {
    this.dropAll();
    await new Promise((r) => this.server.close(r));
  }
}

// ---------------------------------------------------------------- API process
let api = null;
let apiExit = null;
async function startApi(databaseUrl, extra = {}) {
  const log = createWriteStream(join(runDir, 'api.log'), { flags: 'a' });
  log.write(`\n=== start ${new Date().toISOString()}\n`);
  apiExit = null;
  api = spawn(process.execPath, [join(repoRoot, 'dist', 'main.js')], {
    cwd: runDir,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, ...liveEnv, PORT: String(PORT), RATE_LIMIT_LIMIT: '10000', DATABASE_URL: databaseUrl, ...extra },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  api.stdout.pipe(log);
  api.stderr.pipe(log);
  api.once('exit', (code, signal) => (apiExit = { code, signal, at: Date.now() }));
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    try {
      if ((await fetch(`${BASE}/health/live`)).status === 200) return true;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  return false;
}
async function stopApi() {
  if (!api || api.exitCode !== null) return;
  const exited = new Promise((r) => api.once('exit', r));
  api.kill();
  await exited;
}
const apiAlive = () => api && api.exitCode === null && apiExit === null;
function apiLogScan() {
  const text = readFileSync(join(runDir, 'api.log'), 'utf8');
  return {
    errors: text.split('\n').filter((l) => l.includes('"level":"error"')).length,
    unhandled: /unhandledRejection|UnhandledPromiseRejection|uncaughtException/i.test(text),
  };
}

// ---------------------------------------------------------------- HTTP
async function http(method, path, { token, cookie, body, timeoutMs = 45000 } = {}) {
  const h = {};
  if (token) h.authorization = `Bearer ${token}`;
  if (cookie) h.cookie = `slm_refresh=${cookie}`;
  if (body !== undefined) h['content-type'] = 'application/json';
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* not json */
    }
    const setCookie = res.headers.getSetCookie?.() ?? [];
    const refresh = setCookie.find((c) => c.startsWith('slm_refresh='));
    const cookieValue = refresh ? decodeURIComponent(refresh.split(';')[0].slice('slm_refresh='.length)) : undefined;
    return { status: res.status, json, code: json?.error?.code ?? json?.message, cookieValue, cleared: /Expires=Thu, 01 Jan 1970/.test(refresh ?? ''), ms: Date.now() - started };
  } catch (error) {
    return { status: 0, error: error.name, ms: Date.now() - started };
  }
}
const login = (email, password) => http('POST', '/auth/login', { body: { email, password } });
const fmt = (r) => `${r.status}${r.code ? '/' + r.code : ''}${r.error ? '/' + r.error : ''} ${(r.ms / 1000).toFixed(1)}s`;
const SA_EMAIL = 'sa.review@example.test';

// ---------------------------------------------------------------- SQL observer (direct, never through the relay)
let sql = null;
async function observer() {
  if (sql) await sql.end().catch(() => {});
  sql = new Client({ connectionString: dbUrl(hostPort()), statement_timeout: 10000, query_timeout: 15000 });
  sql.on('error', () => {}); // the observer itself is cut by docker stop; that is expected
  await sql.connect();
}
const q = async (text, params = []) => (await sql.query(text, params)).rows;
const one = async (text, params = []) => (await q(text, params))[0];
async function backends() {
  return q(
    `select pid, state, backend_xid is not null as wrote, round(extract(epoch from now()-xact_start))::int xact_s, left(regexp_replace(query, '\\s+', ' ', 'g'), 70) query
       from pg_stat_activity where datname = $1 and usename = 'rr_admin' and pid <> pg_backend_pid() order by pid`,
    [secrets.LIVEDB],
  );
}
const idleInTx = async () => (await backends()).filter((b) => b.state?.startsWith('idle in transaction'));

let orgId;
let deptId;
let titleId;
async function fixtureEmployee(code) {
  const email = `${code.toLowerCase()}@example.test`;
  const row = await one(
    `insert into employees (id, organization_id, employee_code, full_name, work_email, normalized_work_email, employment_type, hire_date, status, updated_at)
     values (gen_random_uuid(), $1, $2, $3, $4, $4, 'STAFF', date '2026-03-02', 'ACTIVE', now()) returning id`,
    [orgId, code, `Gia lap ${code}`, email],
  );
  await q(`insert into employee_placements (id, organization_id, employee_id, department_id, job_title_id, valid_from) values (gen_random_uuid(), $1, $2, $3, $4, date '2026-03-02')`, [orgId, row.id, deptId, titleId]);
  return row.id;
}
let SA;
let saCookie;
async function saLogin() {
  const r = await login(SA_EMAIL, secrets.SAPW);
  if (r.status !== 200) throw new Error(`SA login ${r.status} ${r.code}`);
  SA = r.json.data.accessToken;
  saCookie = r.cookieValue;
}
async function newAccount(code) {
  const employeeId = await fixtureEmployee(code);
  const r = await http('POST', '/app-users', { token: SA, body: { employeeId, roles: [] } });
  if (r.status !== 201) throw new Error(`create ${code}: ${r.status} ${r.code}`);
  return r.json.data.id;
}
async function recovered(label) {
  const end = Date.now() + 20000;
  let last;
  while (Date.now() < end) {
    last = await http('GET', '/me', { token: SA, timeoutMs: 15000 });
    if (last.status === 200) break;
    await sleep(500);
  }
  const ready = await http('GET', '/health/ready');
  const relog = await login(SA_EMAIL, secrets.SAPW);
  if (relog.status === 200) {
    SA = relog.json.data.accessToken;
    saCookie = relog.cookieValue;
  }
  check(`${label}-rec`, 'after the database answers again: /me 200, ready 200, login 200 without restarting the API; process alive',
    last?.status === 200 && ready.status === 200 && relog.status === 200 && apiAlive(), `${fmt(last)} ready ${ready.status} login ${relog.status} alive=${apiAlive()}`);
}

// ================================================================ RUN
const t0 = Date.now();
try {
  await observer();
  ({ id: orgId } = await one('select id from organizations'));
  ({ id: deptId } = await one('select id from departments'));
  ({ id: titleId } = await one('select id from job_titles'));
  await q('delete from login_throttles');
  const tag = Date.now().toString(36).toUpperCase();

  // ---------------------------------------------------------- P: driver error shapes through real Prisma
  if (phases.has('P')) {
    const { PrismaService } = req(join(repoRoot, 'dist/infrastructure/database/prisma.service.js'));
    const { TransactionRunner, toTransientError } = req(join(repoRoot, 'dist/infrastructure/database/transaction-runner.js'));
    const cfgValues = { DB_LOCK_TIMEOUT_MS: 500, DB_STATEMENT_TIMEOUT_MS: 1500, DB_TRANSACTION_TIMEOUT_MS: 6000, DB_TRANSACTION_MAX_WAIT_MS: 2000, DB_CONNECT_TIMEOUT_MS: 1000, DB_QUERY_TIMEOUT_MS: 2000 };
    const relay = new Relay(hostPort());
    const relayPort = await relay.listen();
    const config = { get: (k) => ({ ...cfgValues, DATABASE_URL: dbUrl(relayPort) })[k] };
    const prisma = new PrismaService(config);
    const runner = new TransactionRunner(prisma, config);
    const shape = (e) => {
      const chain = [];
      for (let cur = e, d = 0; cur && d < 4; cur = cur.cause, d += 1) chain.push(`${cur.constructor?.name}${cur.code ? '[' + cur.code + ']' : ''}: ${String(cur.message).split('\n')[0].slice(0, 70)}`);
      return `${chain.join(' <- ')} => ${toTransientError(e) ? 'transient(503)' : 'NOT transient(500)'}`;
    };
    const attempt = async (fn) => {
      const s = Date.now();
      try {
        await fn();
        return `ok ${Date.now() - s}ms`;
      } catch (e) {
        return `${Date.now() - s}ms ${shape(e)}`;
      }
    };
    await prisma.$queryRaw`SELECT 1`;
    relay.holdAll = true;
    note('P-1', 'warm pool, bytes held: bare $queryRaw', await attempt(() => prisma.$queryRaw`SELECT 1`));
    note('P-2', 'warm pool, bytes held: model findMany', await attempt(() => prisma.appUser.findMany({ take: 1 })));
    note('P-3', 'warm pool, bytes held: TransactionRunner.run', await attempt(() => runner.run((tx) => tx.$queryRaw`SELECT 1`)));
    relay.releaseAll();
    await sleep(2500);
    relay.dropAll();
    await sleep(300);
    relay.holdAll = true;
    note('P-4', 'cold connection, bytes held (connect timeout): model findMany', await attempt(() => prisma.appUser.findMany({ take: 1 })));
    relay.releaseAll();
    await relay.close();
    note('P-5', 'nothing listening (ECONNREFUSED): model findMany', await attempt(() => prisma.appUser.findMany({ take: 1 })));
    const relay2 = new Relay(hostPort());
    const p2 = await relay2.listen();
    const prisma2 = new PrismaService({ get: (k) => ({ ...cfgValues, DATABASE_URL: dbUrl(p2) })[k] });
    await prisma2.$queryRaw`SELECT 1`;
    const inflight = attempt(() => prisma2.$queryRaw`SELECT pg_sleep(1)`);
    await sleep(200);
    relay2.dropAll();
    note('P-6', 'connection reset while a query runs: $queryRaw', await inflight);
    const bad = await attempt(() => prisma2.$queryRawUnsafe('SELECT nope FROM app_users'));
    note('P-7', 'programming error (unknown column) on a healthy database', bad);
    check('P-8', 'a programming error is not classified as transient', bad.includes('NOT transient'), bad.slice(-40));
    await prisma.$disconnect().catch(() => {});
    await prisma2.$disconnect().catch(() => {});
    await relay2.close();
  }

  // Phases A..M drive the built API.
  const needsApi = ['A', 'A2', 'B', 'C', 'D', 'D4', 'E', 'M'].some((p) => phases.has(p));
  let targetIds = [];
  if (needsApi) {
    if (!(await startApi(dbUrl(hostPort())))) throw new Error('API did not start');
    await saLogin();
    for (let i = 1; i <= 7; i += 1) targetIds.push(await newAccount(`RR-${tag}-${i}`));
  }

  // ---------------------------------------------------------- A: docker pause, warm pool
  if (phases.has('A')) {
    for (let i = 0; i < 3; i += 1) {
      await http('GET', '/me', { token: SA });
      await http('GET', '/app-users', { token: SA });
      await http('GET', '/account-candidates', { token: SA });
    }
    const cookieBefore = saCookie;
    const rtBefore = await one(`select count(*) filter (where consumed_at is not null)::int used from refresh_tokens`);
    const lockTarget = targetIds[0];
    let calls;
    const pausedAt = Date.now();
    try {
      pause();
      calls = await Promise.all([
        http('GET', '/me', { token: SA }),
        login(SA_EMAIL, secrets.SAPW),
        http('POST', '/auth/refresh', { cookie: cookieBefore }),
        http('GET', '/app-users', { token: SA }),
        http('GET', '/account-candidates', { token: SA }),
        http('GET', '/health/ready'),
        http('POST', `/app-users/${lockTarget}/lock`, { token: SA }),
        http('POST', '/auth/logout', { cookie: cookieBefore }),
      ]);
    } finally {
      unpause();
    }
    const names = ['GET /me', 'POST /auth/login', 'POST /auth/refresh', 'GET /app-users', 'GET /account-candidates', 'GET /health/ready', 'POST lock', 'POST /auth/logout'];
    note('A-0', `docker pause (warm pool), ${Math.round((Date.now() - pausedAt) / 1000)} s`, names.map((n, i) => `${n} ${fmt(calls[i])}`).join(' | '));
    const answered = calls.every((r) => r.status !== 0);
    check('A-1', 'every request ends on its own while PostgreSQL is paused (no client-side abort at 45 s)', answered, calls.map((r) => r.status).join(','));
    const bound = 8000 + 2500; // DB_QUERY_TIMEOUT_MS plus scheduling slack; a write may need BEGIN + rollback
    check('A-2', '/me, login, list, candidates answer 503 within query timeout + slack (guard path and reads)',
      [0, 1, 3, 4].every((i) => calls[i].status === 503 && calls[i].ms <= bound), [0, 1, 3, 4].map((i) => fmt(calls[i])).join(' | '));
    const AVAIL = ['TOKEN_VERIFICATION_UNAVAILABLE', 'AUTH.UNAVAILABLE', 'SERVICE_UNAVAILABLE'];
  // The guard verifies the token against the database before any service runs, so an authenticated
  // route that cannot reach the database answers the guard's TOKEN_VERIFICATION_UNAVAILABLE.
  check('A-3', 'availability codes only (guard TOKEN_VERIFICATION_UNAVAILABLE, login AUTH.UNAVAILABLE, service SERVICE_UNAVAILABLE); never 401/500',
      calls[0].code === 'TOKEN_VERIFICATION_UNAVAILABLE' && calls[1].code === 'AUTH.UNAVAILABLE' && [2, 3, 4, 6, 7].every((i) => AVAIL.includes(calls[i].code)),
      [0, 1, 3, 4].map((i) => calls[i].code).join(','));
    check('A-4', 'refresh / logout / lock end with 503 too, and refresh/logout keep the cookie (no Set-Cookie clear)',
      [2, 6, 7].every((i) => calls[i].status === 503) && !calls[2].cleared && !calls[7].cleared, [2, 6, 7].map((i) => fmt(calls[i])).join(' | '));
    note('A-5', 'readiness while paused (terminus 1.5 s ping timeout; R-12 code)', fmt(calls[5]));
    await sleep(3000);
    const zombies = await idleInTx();
    check('A-6', 'after unpause no connection of the API is left idle in transaction', zombies.length === 0, JSON.stringify(zombies));
    const rtAfter = await one(`select count(*) filter (where consumed_at is not null)::int used from refresh_tokens`);
    const lockRow = await one('select status from app_users where id=$1', [lockTarget]);
    const lockAudit = (await one(`select count(*)::int c from audit_events where action='APP_USER.LOCKED' and resource_id=$1`, [lockTarget])).c;
    note('A-7', 'write outcome after the paused requests got 503 (commit not known to the client)', `refresh consumed +${rtAfter.used - rtBefore.used}; lock target status ${lockRow.status}, LOCKED audits ${lockAudit}`);
    check('A-8', 'lock that answered 503 left no half-written state (status and audit agree)', (lockRow.status === 'LOCKED') === (lockAudit === 1), `${lockRow.status}/${lockAudit}`);
    const replay = await http('POST', '/auth/refresh', { cookie: cookieBefore });
    note('A-9', 'client retries refresh with the cookie it still holds after the 503', `${fmt(replay)}${replay.cleared ? ' cookie cleared' : ''}`);
    const scan = apiLogScan();
    check('A-10', 'API process alive, no unhandled rejection / uncaught exception in its log', apiAlive() && !scan.unhandled, `alive=${apiAlive()} unhandled=${scan.unhandled}`);
    await recovered('A');
  }

  // ---------------------------------------------------------- A2: short pause during writes (BEGIN outlives maxWait)
  if (phases.has('A2')) {
    const target = targetIds[1];
    const cookie = saCookie;
    let calls;
    try {
      pause();
      const pending = Promise.all([http('POST', `/app-users/${target}/lock`, { token: SA }), http('POST', '/auth/refresh', { cookie })]);
      await sleep(4000);
      unpause();
      calls = await pending;
    } finally {
      unpause();
    }
    note('A2-0', 'paused 4 s (> maxWait 2 s, < query timeout 8 s) while lock and refresh run', `lock ${fmt(calls[0])} | refresh ${fmt(calls[1])}`);
    await sleep(2000);
    const zombies = await idleInTx();
    const lockRow = await one('select status from app_users where id=$1', [target]);
    const audits = (await one(`select count(*)::int c from audit_events where action='APP_USER.LOCKED' and resource_id=$1`, [target])).c;
    check('A2-1', 'no transaction left open after the late BEGIN; lock state and audit agree', zombies.length === 0 && (lockRow.status === 'LOCKED') === (audits === 1), `idle-in-tx=${zombies.length} status=${lockRow.status} audits=${audits}`);
    if (calls[1].status === 200) saCookie = calls[1].cookieValue;
    await recovered('A2');
  }

  // ---------------------------------------------------------- B: docker pause, cold pool
  if (phases.has('B')) {
    await stopApi();
    if (!(await startApi(dbUrl(hostPort())))) throw new Error('API did not restart');
    let calls;
    try {
      pause();
      calls = await Promise.all([http('GET', '/me', { token: SA }), login(SA_EMAIL, secrets.SAPW), http('GET', '/app-users', { token: SA }), http('GET', '/health/ready')]);
    } finally {
      unpause();
    }
    note('B-0', 'fresh API process (no pooled connection), PostgreSQL paused', ['me', 'login', 'list', 'ready'].map((n, i) => `${n} ${fmt(calls[i])}`).join(' | '));
    check('B-1', 'cold pool: /me, login, list answer 503 within connect timeout + query slack', [0, 1, 2].every((i) => calls[i].status === 503 && calls[i].ms <= 11000), [0, 1, 2].map((i) => fmt(calls[i])).join(' | '));
    await recovered('B');
  }

  // ---------------------------------------------------------- C: connection lost mid-request; database stopped and restarted
  if (phases.has('C')) {
    await stopApi();
    const relay = new Relay(hostPort());
    const relayPort = await relay.listen();
    if (!(await startApi(dbUrl(relayPort)))) throw new Error('API did not start behind the relay');
    await saLogin();
    // C-1: hold one statement of /app-users, then cut every connection (in-flight request loses its socket).
    relay.trigger = { re: /^SELECT COUNT\(\*\)/i }; // the list's count query: runs after the guard, inside the service
    const inflight = http('GET', '/app-users', { token: SA });
    await sleep(1500);
    relay.dropAll();
    const r1 = await inflight;
    relay.trigger = null;
    check('C-1', 'connection reset while a request is in flight -> 503 SERVICE_UNAVAILABLE, no 500', r1.status === 503 && r1.code === 'SERVICE_UNAVAILABLE', fmt(r1));
    // C-2: database stopped.
    assertOwnContainer();
    let calls;
    try {
      docker('stop', '-t', '10', CONTAINER);
      calls = await Promise.all([http('GET', '/me', { token: SA }), login(SA_EMAIL, secrets.SAPW), http('POST', '/auth/refresh', { cookie: saCookie }), http('GET', '/app-users', { token: SA }), http('GET', '/health/ready'), http('POST', '/auth/logout', { cookie: saCookie })]);
    } finally {
      docker('start', CONTAINER);
    }
    note('C-2', 'PostgreSQL stopped', ['me', 'login', 'refresh', 'list', 'ready', 'logout'].map((n, i) => `${n} ${fmt(calls[i])}`).join(' | '));
    check('C-3', 'stopped database: every route 503 quickly with its availability code; cookie kept', calls.every((r) => r.status === 503 && r.ms < 5000) && !calls[2].cleared && !calls[5].cleared, calls.map((r) => `${r.status}/${r.code}`).join(','));
    await waitPgReady();
    relay.upstreamPort = hostPort(); // a restarted container can publish a new host port
    await observer();
    await recovered('C');
    const scan = apiLogScan();
    check('C-4', 'no unhandled rejection / crash across reset and restart', apiAlive() && !scan.unhandled, `alive=${apiAlive()} unhandled=${scan.unhandled}`);
    globalThis.relayC = relay;
  }

  // ---------------------------------------------------------- D: one statement stalled inside a transaction
  if (phases.has('D')) {
    let relay = globalThis.relayC;
    if (!relay) {
      await stopApi();
      relay = new Relay(hostPort());
      const relayPort = await relay.listen();
      if (!(await startApi(dbUrl(relayPort)))) throw new Error('API did not start behind the relay');
      await saLogin();
    }
    const holdFor = async (re, action, ms) => {
      relay.trigger = { re };
      const pending = action();
      const end = Date.now() + ms;
      while (Date.now() < end && !relay.trigger.firedOn) await sleep(50);
      const fired = Boolean(relay.trigger.firedOn);
      const held = relay.heldConn();
      const response = await Promise.race([pending, sleep(Math.max(0, end - Date.now())).then(() => null)]);
      if (held) relay.release(held);
      const final = response ?? (await pending);
      relay.trigger = null;
      return { fired, response: final, connId: held?.id };
    };
    // D1: the UPDATE that locks an account never reaches PostgreSQL until 20 s later.
    const victim = targetIds[2];
    const auditsBefore = (await one(`select count(*)::int c from audit_events where action='APP_USER.LOCKED' and resource_id=$1`, [victim])).c;
    const d1 = await holdFor(/^UPDATE "public"\."app_users"/, () => http('POST', `/app-users/${victim}/lock`, { token: SA }), 20000);
    note('D1-0', 'UPDATE app_users of a lock held 20 s then delivered', `trigger=${d1.fired} response ${fmt(d1.response)}`);
    await sleep(1000);
    const after1 = await idleInTx();
    const status1 = (await one('select status from app_users where id=$1', [victim])).status;
    note('D1-1', 'right after release: backends idle in transaction, committed status of the victim', `${JSON.stringify(after1)} committed=${status1}`);
    check('D1-2', 'after the stalled lock answered, no API connection is left idle in transaction (dirty connection not reused)', after1.length === 0, `${after1.length} idle-in-tx`);
    // Normal traffic afterwards: reads and short write transactions on the shared pool.
    const other = targetIds[3];
    for (let i = 0; i < 12; i += 1) await http('GET', '/me', { token: SA });
    const w1 = await http('POST', `/app-users/${other}/lock`, { token: SA });
    const w2 = await http('POST', `/app-users/${other}/unlock`, { token: SA });
    for (let i = 0; i < 12; i += 1) await http('GET', '/app-users', { token: SA });
    await sleep(500);
    const status2 = (await one('select status from app_users where id=$1', [victim])).status;
    const audits2 = (await one(`select count(*)::int c from audit_events where action='APP_USER.LOCKED' and resource_id=$1`, [victim])).c - auditsBefore;
    const openSessions = (await one(`select count(*) filter (where revoked_at is null)::int c from auth_sessions where app_user_id=$1`, [victim])).c;
    const after2 = await idleInTx();
    note('D1-3', 'after later traffic (12 GET /me, lock+unlock of another account, 12 GET /app-users)', `other lock ${w1.status} unlock ${w2.status}; victim committed status=${status2}, new LOCKED audits=${audits2}; idle-in-tx=${after2.length}`);
    check('D1-4', 'the 503-answered lock never becomes a committed LOCKED without its audit row (US-01-06 atomicity)', !(status2 === 'LOCKED' && audits2 === 0), `status=${status2} audits=${audits2} openSessions=${openSessions}`);
    const relock = await http('POST', `/app-users/${victim}/lock`, { token: SA, timeoutMs: 20000 });
    note('D1-5', 'a later lock of the same victim (row lock still held by the zombie transaction?)', fmt(relock));
    // D2: COMMIT held 12 s (> query timeout 8 s): the client is told 503 while PostgreSQL commits later.
    const victim2 = targetIds[4];
    const d2 = await holdFor(/^COMMIT/, () => http('POST', `/app-users/${victim2}/lock`, { token: SA }), 12000);
    await sleep(1000);
    const s2 = (await one('select status from app_users where id=$1', [victim2])).status;
    const a2 = (await one(`select count(*)::int c from audit_events where action='APP_USER.LOCKED' and resource_id=$1`, [victim2])).c;
    note('D2-0', 'COMMIT of a lock held 12 s, then delivered', `trigger=${d2.fired} response ${fmt(d2.response)}; committed status=${s2} audits=${a2}`);
    check('D2-1', 'COMMIT outcome is all-or-nothing (status and audit agree) even though the client saw an error', (s2 === 'LOCKED') === (a2 === 1), `${s2}/${a2}`);
    const retry = await http('POST', `/app-users/${victim2}/lock`, { token: SA });
    note('D2-2', 'client retries the lock after the 503', `${fmt(retry)}; audits now ${(await one(`select count(*)::int c from audit_events where action='APP_USER.LOCKED' and resource_id=$1`, [victim2])).c}`);
    // D3: BEGIN held 4 s (> maxWait 2 s, < query timeout): the discarded transaction must be rolled back.
    const victim3 = targetIds[5];
    const d3 = await holdFor(/^BEGIN/, () => http('POST', `/app-users/${victim3}/lock`, { token: SA }), 4000);
    await sleep(1500);
    const after3 = await idleInTx();
    const s3 = (await one('select status from app_users where id=$1', [victim3])).status;
    check('D3-1', 'BEGIN held past maxWait: 503 and the late transaction is rolled back, nothing left open', d3.response.status === 503 && after3.length === 0 && s3 === 'ACTIVE', `${fmt(d3.response)} idle-in-tx=${after3.length} status=${s3}`);
    writeFileSync(join(runDir, 'relay-sql.json'), JSON.stringify(relay.seen.slice(-400), null, 1));
    const scan = apiLogScan();
    check('D-9', 'API process alive, no unhandled rejection', apiAlive() && !scan.unhandled, `alive=${apiAlive()} unhandled=${scan.unhandled}`);
  }

  // ---------------------------------------------------------- D4: real `docker pause` while a lock's UPDATE is in flight
  if (phases.has('D4')) {
    let relay = globalThis.relayC;
    if (!relay) {
      await stopApi();
      relay = new Relay(hostPort());
      const relayPort = await relay.listen();
      if (!(await startApi(dbUrl(relayPort)))) throw new Error('API did not start behind the relay');
      globalThis.relayC = relay;
      await saLogin();
    }
    const victim = targetIds[6];
    const other = targetIds[3];
    let firedAt = 0;
    let response;
    try {
      relay.trigger = { re: /^UPDATE "public"\."app_users"/, onFire: () => { pause(); firedAt = Date.now(); } };
      const pending = http('POST', `/app-users/${victim}/lock`, { token: SA });
      const end = Date.now() + 5000;
      while (!firedAt && Date.now() < end) await sleep(20);
      response = await Promise.race([pending, sleep(20000).then(() => null)]);
      unpause();
      response = response ?? (await pending);
    } finally {
      relay.trigger = null;
      unpause();
    }
    note('D4-0', 'docker pause issued when the lock UPDATE was sent; unpaused after 20 s', `paused=${Boolean(firedAt)} response ${fmt(response)}`);
    await sleep(1500);
    await observer();
    const zombies = await idleInTx();
    note('D4-1', 'after unpause: API backends idle in transaction', JSON.stringify(zombies));
    const w1 = await http('POST', `/app-users/${other}/lock`, { token: SA });
    const w2 = await http('POST', `/app-users/${other}/unlock`, { token: SA });
    for (let i = 0; i < 12; i += 1) await http('GET', '/app-users', { token: SA });
    await sleep(500);
    const st = (await one('select status from app_users where id=$1', [victim])).status;
    const au = (await one(`select count(*)::int c from audit_events where action='APP_USER.LOCKED' and resource_id=$1`, [victim])).c;
    const tok = (await one(`select count(*) filter (where revoked_at is null and consumed_at is null)::int c from account_action_tokens where app_user_id=$1`, [victim])).c;
    check('D4-2', 'real docker pause mid-transaction: a 503-answered lock is never committed later without its audit, token revocation and outbox cancel',
      !(st === 'LOCKED' && au === 0), `other lock ${w1.status}/unlock ${w2.status}; victim status=${st} LOCKED audits=${au} usable invitation tokens=${tok}; idle-in-tx before traffic=${zombies.length}`);
  }

  // ---------------------------------------------------------- E: a non-transient database error is a 500, not a 503
  if (phases.has('E')) {
    if (!apiAlive()) {
      await startApi(dbUrl(hostPort()));
      await saLogin();
    }
    const errorsBefore = apiLogScan().errors;
    let me;
    try {
      await q('ALTER TABLE auth_sessions RENAME TO auth_sessions_rr_hidden');
      me = await http('GET', '/me', { token: SA });
    } finally {
      await q('ALTER TABLE auth_sessions_rr_hidden RENAME TO auth_sessions');
    }
    await sleep(300);
    const errorsAfter = apiLogScan().errors;
    check('E-1', 'verifier hit by a non-transient DB error (relation missing) -> 500 INTERNAL_SERVER_ERROR with one error log, not 503 (R-04 change)',
      me.status === 500 && me.code === 'INTERNAL_SERVER_ERROR' && errorsAfter > errorsBefore, `${fmt(me)} errors ${errorsBefore}->${errorsAfter}`);
    const back = await http('GET', '/me', { token: SA });
    check('E-2', 'table restored: /me 200', back.status === 200, fmt(back));
  }

  // ---------------------------------------------------------- M: R-15, /me fails after the guard passed
  if (phases.has('M')) {
    let relay = globalThis.relayC;
    if (!relay) {
      await stopApi();
      relay = new Relay(hostPort());
      const relayPort = await relay.listen();
      if (!(await startApi(dbUrl(relayPort)))) throw new Error('API did not start behind the relay');
      await saLogin();
    }
    relay.trigger = { re: /"login_email"/ };
    const me = await http('GET', '/me', { token: SA });
    const fired = relay.trigger.firedOn;
    const held = relay.heldConn();
    if (held) relay.release(held);
    relay.trigger = null;
    note('M-1', 'GET /me with the MeService query (login email) unanswered; the guard already passed', `trigger=${Boolean(fired)} ${fmt(me)}`);
    check('M-2', 'R-15: /me answers 503 (availability) when the database stops answering after the guard', me.status === 503, fmt(me));
    const meDown = (await Promise.all([http('GET', '/me', { token: SA })]))[0];
    void meDown;
    if (globalThis.relayC === undefined) await relay.close();
  }
} catch (error) {
  check('RUN', 'runner aborted', false, `${error.name}: ${error.message}`);
  try {
    unpause();
  } catch {
    /* best effort */
  }
} finally {
  await stopApi();
  if (globalThis.relayC) await globalThis.relayC.close();
  await sql?.end().catch(() => {});
  const summary = { finishedAt: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), phases: [...phases], pass: results.filter((r) => r.ok === true).length, fail: results.filter((r) => r.ok === false).length, info: results.filter((r) => r.ok === null).length };
  writeFileSync(join(runDir, `results-${[...phases].join('')}.json`), JSON.stringify({ summary, results }, null, 2));
  console.log(JSON.stringify(summary));
  process.exit(summary.fail === 0 ? 0 : 1);
}
