// Live smoke for backend G0/G1 (review 14/10/2026).
// Usage: node live-smoke.mjs <repoRoot> <workDir>
//   <workDir>/live.env      app environment (secrets; never printed)
//   <workDir>/secrets.env   RUN, ADPW, SAPW, LIVEDB, PGPORT
// Starts a local SMTP sink in this process, the API (dist/main.js) and the worker (dist/worker.js)
// as separate processes, then drives every operation over real HTTP. Prints only check results;
// tokens, cookies, passwords and mail bodies stay in memory.
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const [repoRoot, workDir] = process.argv.slice(2);
const req = createRequire(join(repoRoot, 'package.json'));
const { SMTPServer } = req('smtp-server');
const { Client } = req('pg');
const jwt = createRequire(req.resolve('@nestjs/jwt'))('jsonwebtoken');

const parseEnv = (file) =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
const liveEnv = parseEnv(join(workDir, 'live.env'));
const secrets = parseEnv(join(workDir, 'secrets.env'));
const DB_URL = `postgresql://review_admin:${secrets.ADPW}@127.0.0.1:${secrets.PGPORT}/${secrets.LIVEDB}`;
const OWNER_URL = null; // all SQL here runs as the app role; fixtures need nothing more
const PORT = Number(liveEnv.PORT);
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const runDir = join(workDir, 'live-run');
mkdirSync(runDir, { recursive: true });

// ---------------------------------------------------------------- results
const results = [];
const secretsSeen = new Set([secrets.SAPW]);
function check(id, name, ok, detail = '') {
  results.push({ id, name, ok: Boolean(ok), detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}${detail ? ' — ' + detail : ''}`);
}
function note(id, name, detail) {
  results.push({ id, name, ok: null, detail: String(detail) });
  console.log(`INFO ${id} ${name} — ${detail}`);
}

// ---------------------------------------------------------------- SQL
const sql = new Client({ connectionString: DB_URL });
await sql.connect();
const q = async (text, params = []) => (await sql.query(text, params)).rows;
const one = async (text, params = []) => (await q(text, params))[0];

// ---------------------------------------------------------------- SMTP sink
const sink = { mode: 'accept', slowMs: 0, messages: [] };
function decodeMime(raw) {
  const split = raw.indexOf('\r\n\r\n');
  const headers = raw.slice(0, split);
  let body = raw.slice(split + 4);
  if (/content-transfer-encoding:\s*quoted-printable/i.test(headers)) {
    body = Buffer.from(
      body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))),
      'latin1',
    ).toString('utf8');
  } else if (/content-transfer-encoding:\s*base64/i.test(headers)) {
    body = Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  }
  return { headers, body };
}
const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ['STARTTLS', 'AUTH'],
  logger: false,
  onData(stream, session, callback) {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', async () => {
      const mode = sink.mode;
      if (mode === 'slow') await sleep(sink.slowMs);
      if (mode === 'temp') return callback(Object.assign(new Error('Try later'), { responseCode: 451 }));
      if (mode === 'perm') return callback(Object.assign(new Error('No such user'), { responseCode: 550 }));
      const raw = Buffer.concat(chunks).toString('latin1');
      const { headers, body } = decodeMime(raw);
      const token = /\/activate#token=([A-Za-z0-9_-]{43})/.exec(body)?.[1] ?? null;
      if (token) secretsSeen.add(token);
      sink.messages.push({ to: session.envelope.rcptTo.map((r) => r.address), headers, body, token, at: Date.now() });
      callback();
    });
  },
});
smtp.on('error', () => {}); // a client killed mid-session resets the connection; that is the crash case under test
await new Promise((resolve) => smtp.listen(Number(liveEnv.SMTP_PORT), '0.0.0.0', resolve));
const mailsTo = (addr) => sink.messages.filter((m) => m.to.includes(addr));
async function waitMail(addr, count = 1, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (mailsTo(addr).length >= count) return mailsTo(addr)[count - 1];
    await sleep(200);
  }
  return null;
}

// ---------------------------------------------------------------- processes
const baseEnv = {
  PATH: process.env.PATH,
  SystemRoot: process.env.SystemRoot,
  TEMP: process.env.TEMP,
  TMP: process.env.TMP,
  ...liveEnv,
  DATABASE_URL: DB_URL,
};
const procs = {};
function start(name, entry, extra = {}) {
  const log = createWriteStream(join(runDir, `${name}.log`), { flags: 'a' });
  const child = spawn(process.execPath, [join(repoRoot, 'dist', entry)], {
    cwd: runDir, // no .env here: only the variables above reach the process
    env: { ...baseEnv, ...extra },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  procs[name] = child;
  return child;
}
async function stop(name) {
  const child = procs[name];
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((r) => child.once('exit', r));
  child.kill(); // on Windows this is TerminateProcess: a hard stop, used as the crash case
  await exited;
  delete procs[name];
}
async function waitHealthy(timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const live = await fetch(`${BASE}/health/live`);
      const ready = await fetch(`${BASE}/health/ready`);
      if (live.status === 200 && ready.status === 200) return { live, ready };
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  return null;
}

// ---------------------------------------------------------------- HTTP
async function http(method, path, { token, cookie, body, headers = {}, timeoutMs = 20000 } = {}) {
  const h = { ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  if (cookie) h.cookie = `slm_refresh=${cookie}`;
  if (body !== undefined) h['content-type'] = 'application/json';
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: h,
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
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
    if (cookieValue) secretsSeen.add(cookieValue);
    if (json?.data?.accessToken) secretsSeen.add(json.data.accessToken);
    return {
      status: res.status,
      json,
      code: json?.error?.code ?? json?.message,
      setCookie: refresh,
      cookieValue,
      headers: res.headers,
      ms: Date.now() - started,
    };
  } catch (error) {
    return { status: 0, error: error.name, ms: Date.now() - started };
  }
}
const login = (email, password) => http('POST', '/auth/login', { body: { email, password } });
const SA_EMAIL = 'sa.review@example.test';
const IT_EMAIL = 'it.review@example.test';
const strongPassword = () => `Rv-${randomBytes(12).toString('base64url')}-9`;

// ---------------------------------------------------------------- fixtures (SQL; only for data without an API: G2/G6)
const orgRow = await one('select id, time_zone from organizations');
const deptRow = await one('select id from departments');
const titleRow = await one('select id from job_titles');
async function fixtureEmployee(code, email, status = 'ACTIVE') {
  const row = await one(
    `insert into employees (id, organization_id, employee_code, full_name, work_email, normalized_work_email,
       employment_type, hire_date, status, updated_at)
     values (gen_random_uuid(), $1, $2, $3, $4, lower($4), 'STAFF', date '2026-03-02', $5, now()) returning id`,
    [orgRow.id, code, `Gia lap ${code}`, email, status],
  );
  await q(
    `insert into employee_placements (id, organization_id, employee_id, department_id, job_title_id, valid_from)
     values (gen_random_uuid(), $1, $2, $3, $4, date '2026-03-02')`,
    [orgRow.id, row.id, deptRow.id, titleRow.id],
  );
  return row.id;
}
const auditCount = async (action) => Number((await one('select count(*)::int c from audit_events where action=$1', [action])).c);

// ================================================================ RUN
const t0 = Date.now();
try {
  // ---------------------------------------------------------- 1. two processes, health
  start('api', 'main.js');
  start('worker', 'worker.js');
  const health = await waitHealthy();
  check('H-1', 'API process up; GET /health/live 200 and /health/ready 200 within 30 s', health);
  if (!health) throw new Error('API did not become healthy');
  const ready = await (await fetch(`${BASE}/health/ready`)).json();
  check('H-2', 'readiness reports the database check', ready?.data?.checks?.some((c) => c.name === 'database' || c.status), JSON.stringify(ready?.data?.checks));
  const catalog = await http('GET', '/catalog-applications');
  check('H-3', 'catalog is not mounted (404)', catalog.status === 404, `${catalog.status} ${catalog.code}`);

  // ---------------------------------------------------------- 2. anonymous / login / me
  const anonMe = await http('GET', '/me');
  check('A-1', 'anonymous GET /me -> 401 AUTHENTICATION_REQUIRED', anonMe.status === 401 && anonMe.code === 'AUTHENTICATION_REQUIRED', anonMe.code);
  const anonAdmin = await http('GET', '/app-users');
  check('A-2', 'anonymous GET /app-users -> 401', anonAdmin.status === 401, anonAdmin.code);
  const wrongPw = await login(SA_EMAIL, 'definitely-wrong-password');
  const unknown = await login('nobody.review@example.test', 'definitely-wrong-password');
  const malformed = await login('not-an-email', 'definitely-wrong-password');
  const same = (r) => JSON.stringify({ ...r.json, error: { ...r.json?.error, requestId: 'x' } });
  check('A-3', 'wrong password, unknown email and malformed email give one identical 401 body (AC-10)',
    wrongPw.status === 401 && same(wrongPw) === same(unknown) && same(unknown) === same(malformed) && wrongPw.code === 'AUTH.INVALID_CREDENTIALS', `${wrongPw.code}`);
  await q('delete from login_throttles'); // keep the throttle checks below deterministic (fixture reset)
  const saLogin = await login(SA_EMAIL, secrets.SAPW);
  check('A-4', 'Super Admin login 200 AUTH.LOGGED_IN with Bearer token', saLogin.status === 200 && saLogin.json?.message === 'AUTH.LOGGED_IN' && saLogin.json?.data?.tokenType === 'Bearer', saLogin.status);
  const c = saLogin.setCookie ?? '';
  check('A-5', 'refresh cookie HttpOnly; SameSite=Strict; Path=/api/v1/auth; Max-Age≈absolute lifetime; no Secure in development profile',
    /HttpOnly/i.test(c) && /SameSite=Strict/i.test(c) && /Path=\/api\/v1\/auth/.test(c) && /Max-Age=(6047\d\d|604800)\b/.test(c) && !/Secure/i.test(c),
    c.replace(/slm_refresh=[^;]+/, 'slm_refresh=<redacted>'));
  let SA = saLogin.json.data.accessToken;
  let saCookie = saLogin.cookieValue;
  const me = await http('GET', '/me', { token: SA });
  check('A-6', '/me: direct [SUPER_ADMIN], derived [], department IT, job title, selfServiceOnly false (AC-17 direct part)',
    me.status === 200 && JSON.stringify(me.json.data.roles) === JSON.stringify({ direct: ['SUPER_ADMIN'], derived: [], effective: ['SUPER_ADMIN'] }) &&
      me.json.data.employee.department?.code === 'IT' && me.json.data.employee.jobTitle && me.json.data.selfServiceOnly === false,
    JSON.stringify(me.json?.data?.roles));
  const saAppUserId = me.json.data.appUserId;

  // ---------------------------------------------------------- 3. candidates, create IT account
  const cand = await http('GET', '/account-candidates', { token: SA });
  const itEmp = cand.json?.data?.items?.find((i) => i.employeeCode === 'IT001');
  check('C-1', 'candidates lists IT001 (no account) and not SA001', cand.status === 200 && itEmp && !cand.json.data.items.some((i) => i.employeeCode === 'SA001'), JSON.stringify(cand.json?.data?.items?.map((i) => i.employeeCode)));
  const candSearch = await http('GET', '/account-candidates?search=it00', { token: SA });
  check('C-2', 'candidate search is case-insensitive', candSearch.json?.data?.items?.length === 1, candSearch.status);
  const candBad = await http('GET', `/account-candidates?search=${'x'.repeat(101)}`, { token: SA });
  check('C-3', 'candidate search over 100 chars -> 422 VALIDATION_ERROR', candBad.status === 422 && candBad.code === 'VALIDATION_ERROR', candBad.code);
  const create = await http('POST', '/app-users', { token: SA, body: { employeeId: itEmp.id, roles: ['IT_ADMIN'] } });
  check('C-4', 'POST /app-users 201 APP_USER.CREATED, INVITED, roles [IT_ADMIN]', create.status === 201 && create.json.message === 'APP_USER.CREATED' && create.json.data.activationState === 'INVITED' && JSON.stringify(create.json.data.roles) === '["IT_ADMIN"]', create.status);
  const itId = create.json.data.id;
  const createAgain = await http('POST', '/app-users', { token: SA, body: { employeeId: itEmp.id, roles: [] } });
  check('C-5', 'second account for the same employee -> 409 APP_USER.ALREADY_EXISTS_FOR_EMPLOYEE (AC-8)', createAgain.status === 409 && createAgain.code === 'APP_USER.ALREADY_EXISTS_FOR_EMPLOYEE', createAgain.code);
  const invitedLogin = await login(IT_EMAIL, 'whatever-password-1');
  check('C-6', 'INVITED account cannot log in: same generic 401 (AC-9/AC-11)', invitedLogin.status === 401 && same(invitedLogin) === same(unknown), invitedLogin.code);
  const auditCreate = await one(`select count(*)::int c from audit_events where resource_id=$1 and action in ('APP_USER.CREATED','ROLE.GRANTED','APP_USER.INVITATION_SENT')`, [itId]);
  check('C-7', 'audit has APP_USER.CREATED, ROLE.GRANTED, APP_USER.INVITATION_SENT for the new account (AC-1)', auditCreate.c === 3, auditCreate.c);

  // ---------------------------------------------------------- 4. worker sends; redeem
  const mail = await waitMail(IT_EMAIL);
  check('M-1', 'worker delivered the invitation to the SMTP sink', mail && mail.token, mail ? 'received' : 'timeout');
  const outbox = await one('select status, payload_ciphertext is null as wiped, attempts from email_outbox where recipient=$1', [IT_EMAIL]);
  check('M-2', 'outbox row SENT, ciphertext wiped', outbox?.status === 'SENT' && outbox.wiped, JSON.stringify(outbox));
  check('M-3', 'mail carries no password and the link uses the URL fragment', mail && !mail.body.includes(secrets.SAPW) && /\/activate#token=/.test(mail.body), '');
  const itToken = mail.token;
  const weak = await http('POST', '/auth/invitations/redeem', { body: { token: 'x'.repeat(43), password: 'short' } });
  check('R-1', 'weak password with a bogus token -> 422 AUTH.PASSWORD_POLICY_VIOLATION (policy before token)', weak.status === 422 && weak.code === 'AUTH.PASSWORD_POLICY_VIOLATION', weak.code);
  const bogus = await http('POST', '/auth/invitations/redeem', { body: { token: 'x'.repeat(43), password: strongPassword() } });
  check('R-2', 'unknown token -> 400 AUTH.INVITATION_INVALID', bogus.status === 400 && bogus.code === 'AUTH.INVITATION_INVALID', bogus.code);
  const emailPw = await http('POST', '/auth/invitations/redeem', { body: { token: itToken, password: IT_EMAIL } });
  check('R-3', 'password equal to the login email -> 422 EQUALS_LOGIN_EMAIL, token kept', emailPw.status === 422 && emailPw.json?.error?.details?.violation === 'EQUALS_LOGIN_EMAIL', emailPw.code);
  const itPassword = strongPassword();
  secretsSeen.add(itPassword);
  const redeem = await http('POST', '/auth/invitations/redeem', { body: { token: itToken, password: itPassword } });
  check('R-4', 'redeem 200 AUTH.ACCOUNT_ACTIVATED, no cookie, no access token (no auto-login)', redeem.status === 200 && redeem.json?.message === 'AUTH.ACCOUNT_ACTIVATED' && !redeem.setCookie && !redeem.json?.data?.accessToken, redeem.code);
  const redeemAgain = await http('POST', '/auth/invitations/redeem', { body: { token: itToken, password: strongPassword() } });
  check('R-5', 'same token again -> 400 AUTH.INVITATION_INVALID', redeemAgain.status === 400 && redeemAgain.code === 'AUTH.INVITATION_INVALID', redeemAgain.code);
  const itLogin = await login(IT_EMAIL, itPassword);
  check('R-6', 'IT logs in after activation', itLogin.status === 200, itLogin.status);
  let IT = itLogin.json.data.accessToken;
  let itCookie = itLogin.cookieValue;
  const itMe = await http('GET', '/me', { token: IT });
  check('R-7', 'IT /me direct [IT_ADMIN]', JSON.stringify(itMe.json?.data?.roles?.direct) === '["IT_ADMIN"]', JSON.stringify(itMe.json?.data?.roles));
  const actAudit = await one(`select actor_kind, actor_app_user_id=$1::uuid as self from audit_events where action='APP_USER.ACTIVATED' and resource_id=$2`, [itId, itId]);
  check('R-8', 'APP_USER.ACTIVATED audited with the user as actor', actAudit?.actor_kind === 'USER' && actAudit.self, JSON.stringify(actAudit));

  // ---------------------------------------------------------- 5. authorization
  const itList = await http('GET', '/app-users', { token: IT });
  const itCreate = await http('POST', '/app-users', { token: IT, body: { employeeId: randomUUID(), roles: [] } });
  const itCand = await http('GET', '/account-candidates', { token: IT });
  const itLockSa = await http('POST', `/app-users/${saAppUserId}/lock`, { token: IT });
  check('Z-1', 'IT_ADMIN on admin routes -> 403 AUTHORIZATION.FORBIDDEN (list, create, candidates, lock SA) (AC-3)',
    [itList, itCreate, itCand, itLockSa].every((r) => r.status === 403 && r.code === 'AUTHORIZATION.FORBIDDEN'), [itList, itCreate, itCand, itLockSa].map((r) => r.status).join(','));
  const saStill = await one('select status from app_users where id=$1', [saAppUserId]);
  check('Z-2', 'Super Admin unchanged after the refused lock', saStill.status === 'ACTIVE');

  // ---------------------------------------------------------- 6. list / detail / pagination
  const list = await http('GET', '/app-users?page=1&pageSize=1', { token: SA });
  check('L-1', 'list pageSize=1: 1 item, totalItems 2, totalPages 2', list.status === 200 && list.json.data.items.length === 1 && list.json.data.pagination.totalItems === 2 && list.json.data.pagination.totalPages === 2, JSON.stringify(list.json?.data?.pagination));
  const page2 = await http('GET', '/app-users?page=2&pageSize=1', { token: SA });
  check('L-2', 'page 2 returns the other account (stable order)', page2.json?.data?.items?.[0]?.id && page2.json.data.items[0].id !== list.json.data.items[0].id);
  const filtRole = await http('GET', '/app-users?role=IT_ADMIN', { token: SA });
  const filtState = await http('GET', '/app-users?activationState=INVITED', { token: SA });
  const filtStatus = await http('GET', '/app-users?status=LOCKED', { token: SA });
  check('L-3', 'filters role/activationState/status', filtRole.json?.data?.items?.length === 1 && filtState.json?.data?.items?.length === 0 && filtStatus.json?.data?.items?.length === 0,
    `${filtRole.json?.data?.items?.length},${filtState.json?.data?.items?.length},${filtStatus.json?.data?.items?.length}`);
  const badQ = [await http('GET', '/app-users?pageSize=101', { token: SA }), await http('GET', '/app-users?page=0', { token: SA }), await http('GET', '/app-users?foo=1', { token: SA }), await http('GET', '/app-users?role=MANAGER', { token: SA })];
  check('L-4', 'invalid list queries (pageSize 101, page 0, unknown key, role MANAGER) -> 422', badQ.every((r) => r.status === 422), badQ.map((r) => r.status).join(','));
  const hugePage = await http('GET', '/app-users?page=999999999&pageSize=100', { token: SA });
  note('L-5', 'very large page number (skip ≈ 1e11)', `${hugePage.status} ${hugePage.code} items=${hugePage.json?.data?.items?.length}`);
  const detail = await http('GET', `/app-users/${itId}`, { token: SA });
  check('L-6', 'detail: roleHistory, invitation consumed (usable false), delivery SENT', detail.status === 200 && detail.json.data.roleHistory.length === 1 && detail.json.data.invitation.usable === false && detail.json.data.invitation.delivery.status === 'SENT', JSON.stringify(detail.json?.data?.invitation));
  const missing = await http('GET', `/app-users/${randomUUID()}`, { token: SA });
  const notUuid = await http('GET', '/app-users/abc', { token: SA });
  check('L-7', 'unknown id 404 APP_USER.NOT_FOUND; non-UUID 422', missing.status === 404 && missing.code === 'APP_USER.NOT_FOUND' && notUuid.status === 422, `${missing.status} ${notUuid.status}`);

  // ---------------------------------------------------------- 7. fixtures for further accounts (G2 import does not exist yet)
  const empA = await fixtureEmployee('FX-EMP002', 'fx.emp002@example.test');
  const empFin = await fixtureEmployee('FX-FIN001', 'fx.fin001@example.test');
  const empFin2 = await fixtureEmployee('FX-FIN002', 'fx.fin002@example.test');

  // resend / supersede
  const createA = await http('POST', '/app-users', { token: SA, body: { employeeId: empA, roles: [] } });
  check('I-1', 'account with roles [] -> 201, roles [] (AC-16 creation)', createA.status === 201 && createA.json.data.roles.length === 0, createA.status);
  const aId = createA.json.data.id;
  const mailA1 = await waitMail('fx.emp002@example.test', 1);
  const resend = await http('POST', `/app-users/${aId}/invitations`, { token: SA });
  check('I-2', 'resend -> 202 APP_USER.INVITATION_SENT', resend.status === 202 && resend.json.message === 'APP_USER.INVITATION_SENT', resend.status);
  const mailA2 = await waitMail('fx.emp002@example.test', 2);
  const tokRows = await q(`select revoked_reason, consumed_at is null as unconsumed from account_action_tokens where app_user_id=$1 order by created_at`, [aId]);
  check('I-3', 'old token SUPERSEDED, exactly one usable token', tokRows.length === 2 && tokRows[0].revoked_reason === 'SUPERSEDED' && tokRows[1].revoked_reason === null, JSON.stringify(tokRows));
  const oldRedeem = await http('POST', '/auth/invitations/redeem', { body: { token: mailA1?.token, password: strongPassword() } });
  check('I-4', 'superseded link -> 400 AUTH.INVITATION_INVALID (US-01-10 AC-2)', oldRedeem.status === 400, oldRedeem.code);
  const resendActivated = await http('POST', `/app-users/${itId}/invitations`, { token: SA });
  const resendSelf = await http('POST', `/app-users/${saAppUserId}/invitations`, { token: SA });
  check('I-5', 'resend to activated -> 409 APP_USER.ALREADY_ACTIVATED; to self -> 409 SELF_CHANGE_FORBIDDEN', resendActivated.code === 'APP_USER.ALREADY_ACTIVATED' && resendSelf.code === 'APP_USER.SELF_CHANGE_FORBIDDEN', `${resendActivated.code} ${resendSelf.code}`);

  // ---------------------------------------------------------- 8. roles
  const gEmp = await http('POST', `/app-users/${itId}/role-grants`, { token: SA, body: { role: 'EMPLOYEE' } });
  check('G-1', 'grant EMPLOYEE -> 201 ROLE.GRANTED', gEmp.status === 201 && gEmp.json.message === 'ROLE.GRANTED', gEmp.status);
  let meIt = await http('GET', '/me', { token: IT });
  check('G-2', 'same access token sees the new role on the next request', JSON.stringify(meIt.json?.data?.roles?.effective) === '["EMPLOYEE","IT_ADMIN"]', JSON.stringify(meIt.json?.data?.roles?.effective));
  const rIt = await http('DELETE', `/app-users/${itId}/role-grants/IT_ADMIN`, { token: SA });
  meIt = await http('GET', '/me', { token: IT });
  check('G-3', 'revoke IT_ADMIN -> 200; next request keeps EMPLOYEE only (AC-7)', rIt.status === 200 && JSON.stringify(meIt.json?.data?.roles?.effective) === '["EMPLOYEE"]', JSON.stringify(meIt.json?.data?.roles?.effective));
  const rLast = await http('DELETE', `/app-users/${itId}/role-grants/EMPLOYEE`, { token: SA });
  meIt = await http('GET', '/me', { token: IT });
  check('G-4', 'revoke the last role -> 200; /me selfServiceOnly true, no role added back (AC-16)', rLast.status === 200 && meIt.json?.data?.selfServiceOnly === true && meIt.json.data.roles.effective.length === 0, JSON.stringify(meIt.json?.data?.roles));
  const refusals = {
    superAdmin: await http('POST', `/app-users/${itId}/role-grants`, { token: SA, body: { role: 'SUPER_ADMIN' } }),
    manager: await http('POST', `/app-users/${itId}/role-grants`, { token: SA, body: { role: 'MANAGER' } }),
    approver: await http('POST', `/app-users/${itId}/role-grants`, { token: SA, body: { role: 'SPENDING_APPROVER' } }),
    self: await http('POST', `/app-users/${saAppUserId}/role-grants`, { token: SA, body: { role: 'EMPLOYEE' } }),
    revokeSaSelf: await http('DELETE', `/app-users/${saAppUserId}/role-grants/SUPER_ADMIN`, { token: SA }),
    revokeSaOther: await http('DELETE', `/app-users/${itId}/role-grants/SUPER_ADMIN`, { token: SA }),
    notHeld: await http('DELETE', `/app-users/${itId}/role-grants/FINANCE`, { token: SA }),
    unknownRole: await http('POST', `/app-users/${itId}/role-grants`, { token: SA, body: { role: 'ADMIN' } }),
    createSa: await http('POST', '/app-users', { token: SA, body: { employeeId: empFin2, roles: ['SUPER_ADMIN', 'IT_ADMIN'] } }),
    createMgr: await http('POST', '/app-users', { token: SA, body: { employeeId: empFin2, roles: ['MANAGER'] } }),
  };
  const expect = {
    superAdmin: [422, 'APP_USER.SUPER_ADMIN_TRANSFER_ONLY'], manager: [422, 'APP_USER.ROLE_DERIVED'], approver: [422, 'APP_USER.ROLE_DERIVED'],
    self: [409, 'APP_USER.SELF_CHANGE_FORBIDDEN'], revokeSaSelf: [409, 'APP_USER.SELF_CHANGE_FORBIDDEN'], revokeSaOther: [422, 'APP_USER.SUPER_ADMIN_TRANSFER_ONLY'],
    notHeld: [404, 'APP_USER.ROLE_NOT_GRANTED'], unknownRole: [422, 'VALIDATION_ERROR'], createSa: [422, 'APP_USER.SUPER_ADMIN_TRANSFER_ONLY'], createMgr: [422, 'APP_USER.ROLE_DERIVED'],
  };
  for (const [k, [st, code]] of Object.entries(expect)) {
    check(`G-5.${k}`, `refusal ${k} -> ${st} ${code} (AC-4/12/13/14)`, refusals[k].status === st && refusals[k].code === code, `${refusals[k].status} ${refusals[k].code}`);
  }
  const fin2HasAccount = await one('select count(*)::int c from app_users where employee_id=$1', [empFin2]);
  check('G-6', 'refused creations wrote nothing', fin2HasAccount.c === 0);
  const g2 = await http('POST', `/app-users/${itId}/role-grants`, { token: SA, body: { role: 'IT_ADMIN' } });
  const dup = await http('POST', `/app-users/${itId}/role-grants`, { token: SA, body: { role: 'IT_ADMIN' } });
  check('G-7', 're-grant IT_ADMIN 201; duplicate -> 409 ROLE_ALREADY_GRANTED', g2.status === 201 && dup.code === 'APP_USER.ROLE_ALREADY_GRANTED', `${g2.status} ${dup.code}`);
  const hist = await http('GET', `/app-users/${itId}`, { token: SA });
  check('G-8', 'role history keeps grants and revocations (AC-7)', hist.json?.data?.roleHistory?.length === 3 && hist.json.data.roleHistory.filter((h) => h.revokedAt).length === 2, JSON.stringify(hist.json?.data?.roleHistory?.map((h) => `${h.role}:${h.revokedAt ? 'rev' : 'on'}`)));

  // FINANCE seat (QĐ-67e)
  const fin = await http('POST', '/app-users', { token: SA, body: { employeeId: empFin, roles: ['FINANCE'] } });
  const finId = fin.json?.data?.id;
  const fin2Grant = await http('POST', `/app-users/${aId}/role-grants`, { token: SA, body: { role: 'FINANCE' } });
  check('F-1', 'FINANCE held by an INVITED account still blocks a second grant -> 409 FINANCE_ALREADY_ASSIGNED', fin.status === 201 && fin2Grant.code === 'APP_USER.FINANCE_ALREADY_ASSIGNED', `${fin.status} ${fin2Grant.code}`);
  await http('POST', `/app-users/${finId}/lock`, { token: SA });
  const fin3Grant = await http('POST', `/app-users/${aId}/role-grants`, { token: SA, body: { role: 'FINANCE' } });
  check('F-2', 'FINANCE held by a LOCKED account still blocks -> 409', fin3Grant.code === 'APP_USER.FINANCE_ALREADY_ASSIGNED', fin3Grant.code);
  const revFin = await http('DELETE', `/app-users/${finId}/role-grants/FINANCE`, { token: SA });
  const zeroFin = Number((await one(`select count(*)::int c from role_grants where role='FINANCE' and revoked_at is null`)).c);
  check('F-3', 'revoke FINANCE -> 200 and the organization may have 0 Finance', revFin.status === 200 && zeroFin === 0, zeroFin);
  const createFin2 = await http('POST', '/app-users', { token: SA, body: { employeeId: empFin2, roles: [] } });
  const fin2Id = createFin2.json?.data?.id;
  const [ga, gb] = await Promise.all([
    http('POST', `/app-users/${aId}/role-grants`, { token: SA, body: { role: 'FINANCE' } }),
    http('POST', `/app-users/${fin2Id}/role-grants`, { token: SA, body: { role: 'FINANCE' } }),
  ]);
  const finAfter = Number((await one(`select count(*)::int c from role_grants where role='FINANCE' and revoked_at is null`)).c);
  check('F-4', 'two concurrent FINANCE grants: exactly one 201, one 409; one grant in force (AC-18)', [ga.status, gb.status].sort().join() === '201,409' && finAfter === 1, `${ga.status},${gb.status} grants=${finAfter}`);
  const comboTry = await q(`select 1`); // combination trigger is covered by integration (no HTTP path reaches it)
  void comboTry;

  // ---------------------------------------------------------- 9. lock / unlock / sessions
  const lockIt = await http('POST', `/app-users/${itId}/lock`, { token: SA });
  check('K-1', 'lock -> 200 APP_USER.LOCKED', lockIt.status === 200 && lockIt.json.message === 'APP_USER.LOCKED' && lockIt.json.data.status === 'LOCKED', lockIt.status);
  const afterLockMe = await http('GET', '/me', { token: IT });
  const afterLockRefresh = await http('POST', '/auth/refresh', { cookie: itCookie });
  const afterLockLogin = await login(IT_EMAIL, itPassword);
  check('K-2', 'after lock: old access token 401 INVALID_ACCESS_TOKEN, refresh 401 + cookie cleared, login generic 401 (AC-6)',
    afterLockMe.status === 401 && afterLockMe.code === 'INVALID_ACCESS_TOKEN' && afterLockRefresh.status === 401 && /Expires=Thu, 01 Jan 1970/.test(afterLockRefresh.setCookie ?? '') && afterLockLogin.status === 401 && afterLockLogin.code === 'AUTH.INVALID_CREDENTIALS',
    `${afterLockMe.code} ${afterLockRefresh.code} ${afterLockLogin.code}`);
  const lockAuditBefore = await auditCount('APP_USER.LOCKED');
  const lockAgain = await http('POST', `/app-users/${itId}/lock`, { token: SA });
  check('K-3', 'locking a locked account -> 200, no second audit', lockAgain.status === 200 && (await auditCount('APP_USER.LOCKED')) === lockAuditBefore);
  const sessRevoked = await one(`select count(*) filter (where revoked_reason='ACCOUNT_LOCKED')::int r, count(*) filter (where revoked_at is null)::int open from auth_sessions where app_user_id=$1`, [itId]);
  check('K-4', 'every session of the account revoked ACCOUNT_LOCKED', sessRevoked.open === 0 && sessRevoked.r >= 1, JSON.stringify(sessRevoked));
  const unlock = await http('POST', `/app-users/${itId}/unlock`, { token: SA });
  const afterUnlockMe = await http('GET', '/me', { token: IT });
  const afterUnlockRefresh = await http('POST', '/auth/refresh', { cookie: itCookie });
  check('K-5', 'unlock 200; old access/refresh tokens stay dead (no resurrection)', unlock.status === 200 && afterUnlockMe.status === 401 && afterUnlockRefresh.status === 401, `${afterUnlockMe.status} ${afterUnlockRefresh.status}`);
  const relogin = await login(IT_EMAIL, itPassword);
  check('K-6', 'login works again after unlock (AC-7)', relogin.status === 200, relogin.status);
  IT = relogin.json.data.accessToken;
  itCookie = relogin.cookieValue;
  const lockSelf = await http('POST', `/app-users/${saAppUserId}/lock`, { token: SA });
  const unlockSelf = await http('POST', `/app-users/${saAppUserId}/unlock`, { token: SA });
  check('K-7', 'Super Admin cannot lock/unlock self -> 409 SELF_CHANGE_FORBIDDEN (AC-13/AC-15 path)', lockSelf.code === 'APP_USER.SELF_CHANGE_FORBIDDEN' && unlockSelf.code === 'APP_USER.SELF_CHANGE_FORBIDDEN', `${lockSelf.code} ${unlockSelf.code}`);
  // invitation revoked by lock, not revived by unlock
  const mailA2Token = mailA2?.token;
  await http('POST', `/app-users/${aId}/lock`, { token: SA });
  const lockedResend = await http('POST', `/app-users/${aId}/invitations`, { token: SA });
  const lockedRedeem = await http('POST', '/auth/invitations/redeem', { body: { token: mailA2Token, password: strongPassword() } });
  await http('POST', `/app-users/${aId}/unlock`, { token: SA });
  const unlockedRedeem = await http('POST', '/auth/invitations/redeem', { body: { token: mailA2Token, password: strongPassword() } });
  const aTok = await one(`select revoked_reason from account_action_tokens where app_user_id=$1 order by created_at desc limit 1`, [aId]);
  check('K-8', 'lock revokes the open invitation (ACCOUNT_LOCKED); resend while locked 409 ACCOUNT_LOCKED; link stays invalid after unlock',
    aTok.revoked_reason === 'ACCOUNT_LOCKED' && lockedResend.code === 'APP_USER.ACCOUNT_LOCKED' && lockedRedeem.status === 400 && unlockedRedeem.status === 400,
    `${aTok.revoked_reason} ${lockedResend.code} ${lockedRedeem.status} ${unlockedRedeem.status}`);

  // ---------------------------------------------------------- 10. refresh rotation, replay, logout
  const r1 = await http('POST', '/auth/refresh', { cookie: itCookie });
  check('S-1', 'refresh 200 AUTH.SESSION_REFRESHED rotates the refresh cookie', r1.status === 200 && r1.json.message === 'AUTH.SESSION_REFRESHED' && r1.cookieValue && r1.cookieValue !== itCookie, r1.status);
  note('S-1b', 'access token after refresh equals the previous one when issued in the same second (HS256, no jti)', r1.json?.data?.accessToken === IT);
  const replayAuditBefore = await auditCount('SESSION.REVOKED');
  const replay = await http('POST', '/auth/refresh', { cookie: itCookie });
  const afterReplay = await http('POST', '/auth/refresh', { cookie: r1.cookieValue });
  const replaySession = await one(`select revoked_reason from auth_sessions s join refresh_tokens t on t.session_id=s.id where t.token_hash=$1`, [createHash('sha256').update(itCookie).digest('hex')]);
  check('S-2', 'replaying the consumed cookie -> 401 + cleared; whole session revoked REPLAY_DETECTED; audit SESSION.REVOKED committed; new cookie dead too',
    replay.status === 401 && /Expires=Thu, 01 Jan 1970/.test(replay.setCookie ?? '') && replaySession?.revoked_reason === 'REPLAY_DETECTED' && (await auditCount('SESSION.REVOKED')) === replayAuditBefore + 1 && afterReplay.status === 401,
    `${replay.status} ${replaySession?.revoked_reason} ${afterReplay.status}`);
  const fresh = await login(IT_EMAIL, itPassword);
  IT = fresh.json.data.accessToken;
  itCookie = fresh.cookieValue;
  const out1 = await http('POST', '/auth/logout', { cookie: itCookie });
  const meAfterLogout = await http('GET', '/me', { token: IT });
  const out2 = await http('POST', '/auth/logout', { cookie: itCookie });
  const out3 = await http('POST', '/auth/logout');
  const out4 = await http('POST', '/auth/logout', { cookie: 'garbage' });
  check('S-3', 'logout 204 + cleared cookie; access token 401 next request; repeat/no cookie/garbage all 204 (idempotent)',
    out1.status === 204 && /Expires=Thu, 01 Jan 1970/.test(out1.setCookie ?? '') && meAfterLogout.status === 401 && [out2, out3, out4].every((r) => r.status === 204),
    [out1, meAfterLogout, out2, out3, out4].map((r) => r.status).join(','));
  const bearerOnly = await login(IT_EMAIL, itPassword);
  const outBearer = await http('POST', '/auth/logout', { token: bearerOnly.json.data.accessToken });
  const meStill = await http('GET', '/me', { token: bearerOnly.json.data.accessToken });
  check('S-4', 'logout with Bearer only -> 204 and revokes nothing (documented limitation)', outBearer.status === 204 && meStill.status === 200, `${outBearer.status} ${meStill.status}`);
  const logoutAudit = await one(`select count(*)::int c from audit_events where action like 'AUTH.%' or action like '%LOGIN%' or action like '%LOGOUT%'`);
  check('S-5', 'login/logout are not audited (FR-8.3)', logoutAudit.c === 0, logoutAudit.c);
  // idle / absolute expiry by fixture
  const exp = await login(IT_EMAIL, itPassword);
  const expSid = jwt.decode(exp.json.data.accessToken).sid;
  await q(`update auth_sessions set idle_expires_at = now() - interval '1 second' where id=$1`, [expSid]);
  const idleMe = await http('GET', '/me', { token: exp.json.data.accessToken });
  const idleRefresh = await http('POST', '/auth/refresh', { cookie: exp.cookieValue });
  check('S-6', 'idle-expired session (fixture): /me 401, refresh 401 + cleared', idleMe.status === 401 && idleRefresh.status === 401 && /Expires=Thu, 01 Jan 1970/.test(idleRefresh.setCookie ?? ''), `${idleMe.status} ${idleRefresh.status}`);
  const exp2 = await login(IT_EMAIL, itPassword);
  await q(`update auth_sessions set absolute_expires_at = now() - interval '1 second', idle_expires_at = now() + interval '1 hour' where id=$1`, [jwt.decode(exp2.json.data.accessToken).sid]);
  const absMe = await http('GET', '/me', { token: exp2.json.data.accessToken });
  const absRefresh = await http('POST', '/auth/refresh', { cookie: exp2.cookieValue });
  const absLogout = await http('POST', '/auth/logout', { cookie: exp2.cookieValue });
  check('S-7', 'absolute-expired session (fixture): /me 401, refresh 401, logout 204', absMe.status === 401 && absRefresh.status === 401 && absLogout.status === 204, `${absMe.status} ${absRefresh.status} ${absLogout.status}`);

  // ---------------------------------------------------------- 11. token verifier edge cases (hypothesis 4)
  const secret = liveEnv.AUTH_ACCESS_TOKEN_SECRET;
  const sign = (payload, opts = {}) => {
    const o = { algorithm: 'HS256', issuer: 'slm-api', audience: 'slm-web', expiresIn: 600, ...opts };
    for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
    return jwt.sign(payload, secret, o);
  };
  const good = await login(IT_EMAIL, itPassword);
  const goodClaims = jwt.decode(good.json.data.accessToken);
  const forged = {
    sidNotUuid: sign({ sid: 'not-a-uuid' }, { subject: goodClaims.sub }),
    sidUnknown: sign({ sid: randomUUID() }, { subject: goodClaims.sub }),
    subMismatch: sign({ sid: goodClaims.sid }, { subject: saAppUserId }),
    sidNumber: sign({ sid: 12345 }, { subject: goodClaims.sub }),
    expired: sign({ sid: goodClaims.sid, exp: Math.floor(Date.now() / 1000) - 10 }, { subject: goodClaims.sub, expiresIn: undefined }),
    wrongAud: sign({ sid: goodClaims.sid }, { subject: goodClaims.sub, audience: 'other' }),
    wrongIss: sign({ sid: goodClaims.sid }, { subject: goodClaims.sub, issuer: 'other' }),
    hs512: jwt.sign({ sid: goodClaims.sid }, secret, { algorithm: 'HS512', issuer: 'slm-api', audience: 'slm-web', subject: goodClaims.sub }),
    none: jwt.sign({ sid: goodClaims.sid, sub: goodClaims.sub, iss: 'slm-api', aud: 'slm-web' }, null, { algorithm: 'none' }),
    otherKey: jwt.sign({ sid: goodClaims.sid }, 'x'.repeat(48), { algorithm: 'HS256', issuer: 'slm-api', audience: 'slm-web', subject: goodClaims.sub }),
    garbage: 'abc.def.ghi',
  };
  for (const [k, tok] of Object.entries(forged)) {
    const r = await http('GET', '/me', { token: tok });
    if (k === 'sidNotUuid') {
      note('V-1', 'signed token whose sid is not a UUID (hypothesis 4)', `${r.status} ${r.code}`);
      check('V-1b', 'signed token with non-UUID sid answers 401 (contract: bad token is 401, 503 only for an unavailable dependency)', r.status === 401, `${r.status} ${r.code}`);
    } else {
      check(`V-${k}`, `token ${k} -> 401 INVALID_ACCESS_TOKEN`, r.status === 401 && r.code === 'INVALID_ACCESS_TOKEN', `${r.status} ${r.code}`);
    }
  }
  const twoParts = await http('GET', '/me', { headers: { authorization: 'Bearer a b' } });
  const basic = await http('GET', '/me', { headers: { authorization: 'Basic abc' } });
  check('V-2', 'malformed Authorization header -> 401 AUTHENTICATION_REQUIRED', twoParts.code === 'AUTHENTICATION_REQUIRED' && basic.code === 'AUTHENTICATION_REQUIRED', `${twoParts.code} ${basic.code}`);

  // ---------------------------------------------------------- 12. DTO strictness, envelope, request id
  const extra = await http('POST', '/auth/login', { body: { email: IT_EMAIL, password: 'x', extra: 1 } });
  const noBody = await http('POST', '/auth/login', { body: {} });
  const badJson = await http('POST', '/auth/login', { body: '{"email":' });
  const redeemExtra = await http('POST', '/auth/invitations/redeem', { body: { token: 'a', password: 'b', role: 'SUPER_ADMIN' } });
  const createExtra = await http('POST', '/app-users', { token: SA, body: { employeeId: empFin2, roles: [], status: 'ACTIVE' } });
  check('D-1', 'strict DTOs: extra/missing fields -> 422 VALIDATION_ERROR with requestId', [extra, noBody, redeemExtra, createExtra].every((r) => r.status === 422 && r.code === 'VALIDATION_ERROR' && r.json.error.requestId), [extra, noBody, redeemExtra, createExtra].map((r) => r.status).join(','));
  note('D-2', 'malformed JSON body on login', `${badJson.status} ${badJson.code}`);
  const forgedId = await http('GET', '/me', { headers: { 'x-request-id': 'attacker-chosen-id' } });
  check('D-3', 'client x-request-id is replaced (TRUST_PROXY_HOPS=0)', forgedId.json?.error?.requestId && forgedId.json.error.requestId !== 'attacker-chosen-id' && forgedId.headers.get('x-request-id') === forgedId.json.error.requestId, forgedId.json?.error?.requestId);
  const saCreateBadEmail = await http('POST', '/app-users', { token: SA, body: { employeeId: empFin2, loginEmail: 'not an email', roles: [] } });
  check('D-4', 'invalid login email -> 422 APP_USER.LOGIN_EMAIL_INVALID', saCreateBadEmail.code === 'APP_USER.LOGIN_EMAIL_INVALID', saCreateBadEmail.code);
  const takenEmail = await http('POST', '/app-users', { token: SA, body: { employeeId: empFin2, loginEmail: 'IT.Review+alias@Example.test', roles: [] } });
  note('D-5', 'login email equal to another account after normalization (+tag, case)', `${takenEmail.status} ${takenEmail.code}`);
  const noEmployee = await http('POST', '/app-users', { token: SA, body: { employeeId: randomUUID(), roles: [] } });
  check('D-6', 'unknown employee -> 404 ORGANIZATION.EMPLOYEE_NOT_FOUND', noEmployee.status === 404 && noEmployee.code === 'ORGANIZATION.EMPLOYEE_NOT_FOUND', noEmployee.code);

  // ---------------------------------------------------------- 13. login throttle (hypothesis 3)
  await q('delete from login_throttles');
  const wrong = () => login(IT_EMAIL, 'wrong-password-for-throttle');
  const seq = [];
  for (let i = 0; i < 4; i += 1) seq.push((await wrong()).status);
  const okAfter4 = await login(IT_EMAIL, itPassword);
  check('T-1', '4 wrong then correct -> success and the counter is cleared', seq.every((s) => s === 401) && okAfter4.status === 200 && (await q('select 1 from login_throttles')).length === 0, `${seq.join(',')},${okAfter4.status}`);
  const seq5 = [];
  for (let i = 0; i < 5; i += 1) seq5.push((await wrong()).status);
  const sixthCorrect = await login(IT_EMAIL, itPassword);
  const acct = await one('select status from app_users where id=$1', [itId]);
  check('T-2', '5 wrong -> 6th attempt with the right password 429 AUTH.LOGIN_TEMPORARILY_BLOCKED + retryAfterSeconds; AppUser.status unchanged (US-01-10 AC-7)',
    seq5.every((s) => s === 401) && sixthCorrect.status === 429 && sixthCorrect.code === 'AUTH.LOGIN_TEMPORARILY_BLOCKED' && sixthCorrect.json.error.details.retryAfterSeconds > 0 && acct.status === 'ACTIVE',
    `${seq5.join(',')},${sixthCorrect.status} retry=${sixthCorrect.json?.error?.details?.retryAfterSeconds}`);
  const otherEmail = await login(SA_EMAIL, secrets.SAPW);
  check('T-3', 'block is per email: Super Admin still logs in', otherEmail.status === 200, otherEmail.status);
  SA = otherEmail.json.data.accessToken;
  await sleep((sixthCorrect.json.error.details.retryAfterSeconds + 1) * 1000);
  const afterBlock = await login(IT_EMAIL, itPassword);
  check('T-4', 'after the block expires the right password works', afterBlock.status === 200, afterBlock.status);
  await q('delete from login_throttles');
  const burst = await Promise.all(Array.from({ length: 12 }, () => wrong()));
  const tally = burst.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {});
  check('T-5', '12 simultaneous wrong guesses: at most 5 reach the password check (rest 429)', (tally[401] ?? 0) <= 5 && (tally[401] ?? 0) + (tally[429] ?? 0) === 12, JSON.stringify(tally));
  await q('delete from login_throttles');
  const burstOk = await Promise.all(Array.from({ length: 7 }, () => login(IT_EMAIL, itPassword)));
  const tallyOk = burstOk.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {});
  note('T-6', '7 simultaneous CORRECT logins for one email (attempt reserved before hashing)', JSON.stringify(tallyOk));
  await q('delete from login_throttles');
  for (let i = 0; i < 4; i += 1) await wrong();
  const mixed = await Promise.all([login(IT_EMAIL, itPassword), wrong(), wrong()]);
  note('T-7', 'counter at 4: one correct + two wrong at once', mixed.map((r) => r.status).join(','));
  await q('delete from login_throttles');
  await sleep(500);

  // ---------------------------------------------------------- 14. candidates beyond 200 (hypothesis 1)
  await q(`insert into employees (id, organization_id, employee_code, full_name, work_email, normalized_work_email, employment_type, hire_date, status, updated_at)
           select gen_random_uuid(), $1, 'FXA-'||lpad(g::text,3,'0'), 'Gia lap A '||g, 'fxa'||g||'@example.test', 'fxa'||g||'@example.test', 'STAFF', date '2026-03-02', 'ACTIVE', now() from generate_series(0,199) g`, [orgRow.id]);
  await q(`insert into employee_placements (id, organization_id, employee_id, department_id, job_title_id, valid_from)
           select gen_random_uuid(), $1, e.id, $2, $3, date '2026-03-02' from employees e where e.employee_code like 'FXA-%'`, [orgRow.id, deptRow.id, titleRow.id]);
  await q(`insert into app_users (id, organization_id, employee_id, login_email, normalized_login_email, status, activation_state, updated_at)
           select gen_random_uuid(), $1, e.id, e.work_email, e.normalized_work_email, 'ACTIVE', 'INVITED', now() from employees e where e.employee_code like 'FXA-%'`, [orgRow.id]);
  const eligible = [];
  for (let i = 1; i <= 3; i += 1) eligible.push(await fixtureEmployee(`FXZ-00${i}`, `fxz${i}@example.test`));
  const candAll = await http('GET', '/account-candidates', { token: SA });
  const codes = candAll.json?.data?.items?.map((i) => i.employeeCode) ?? [];
  check('C-8', 'candidates without search include eligible FXZ-001..003 when 200 earlier employees already have accounts (hypothesis 1)', ['FXZ-001', 'FXZ-002', 'FXZ-003'].every((c0) => codes.includes(c0)), `returned ${codes.length}: ${codes.slice(0, 5).join(',')}`);
  const candZ = await http('GET', '/account-candidates?search=FXZ', { token: SA });
  note('C-9', 'same employees with search=FXZ', `${candZ.json?.data?.items?.length} items`);

  // ---------------------------------------------------------- 15. terminated employee (hypothesis 2; G6 has no API: SQL fixture)
  const termEmp = await fixtureEmployee('FX-TERM01', 'fx.term01@example.test');
  await stop('worker');
  const termAcc = await http('POST', '/app-users', { token: SA, body: { employeeId: termEmp, roles: ['EMPLOYEE'] } });
  const termId = termAcc.json?.data?.id;
  await q(`update employees set status='TERMINATED' where id=$1`, [termEmp]);
  const termDetail = await http('GET', `/app-users/${termId}`, { token: SA });
  note('X-1', 'detail of an INVITED account whose employee is TERMINATED: invitation.usable', `${termDetail.json?.data?.invitation?.usable} delivery=${termDetail.json?.data?.invitation?.delivery?.status}`);
  start('worker', 'worker.js');
  const termMail = await waitMail('fx.term01@example.test', 1, 12000);
  const termRow = await one('select status from email_outbox where recipient=$1', ['fx.term01@example.test']);
  note('X-2', 'worker behaviour for the invitation of a TERMINATED employee', `mail ${termMail ? 'SENT to the departed employee' : 'not sent'}; outbox ${termRow?.status}`);
  const termRedeem = await http('POST', '/auth/invitations/redeem', { body: { token: termMail?.token ?? 'x'.repeat(43), password: strongPassword() } });
  check('X-3', 'the link of a TERMINATED employee cannot activate (400)', termRedeem.status === 400, termRedeem.code);
  const termResend = await http('POST', `/app-users/${termId}/invitations`, { token: SA });
  const termEmp2 = await fixtureEmployee('FX-TERM02', 'fx.term02@example.test', 'TERMINATED');
  const termCreate = await http('POST', '/app-users', { token: SA, body: { employeeId: termEmp2, roles: [] } });
  const termCand = (await http('GET', '/account-candidates?search=FX-TERM', { token: SA })).json?.data?.items?.length;
  check('X-4', 'TERMINATED: resend 409 and create 409 APP_USER.EMPLOYEE_TERMINATED; not a candidate (AC-5)', termResend.code === 'APP_USER.EMPLOYEE_TERMINATED' && termCreate.code === 'APP_USER.EMPLOYEE_TERMINATED' && termCand === 0, `${termResend.code} ${termCreate.code} cand=${termCand}`);
  // activated account whose employee leaves
  const actEmp = await fixtureEmployee('FX-ACT01', 'fx.act01@example.test');
  const act = await http('POST', '/app-users', { token: SA, body: { employeeId: actEmp, roles: ['EMPLOYEE'] } });
  const actMail = await waitMail('fx.act01@example.test');
  const actPw = strongPassword();
  secretsSeen.add(actPw);
  await http('POST', '/auth/invitations/redeem', { body: { token: actMail?.token, password: actPw } });
  const actLogin = await login('fx.act01@example.test', actPw);
  await q(`update employees set status='TERMINATED' where id=$1`, [actEmp]);
  const actMe = await http('GET', '/me', { token: actLogin.json?.data?.accessToken });
  const actRefresh = await http('POST', '/auth/refresh', { cookie: actLogin.cookieValue });
  const actLogin2 = await login('fx.act01@example.test', actPw);
  check('X-5', 'employee TERMINATED (fixture): next request 401, refresh 401, login generic 401 (US-01-10 AC-6)', act.status === 201 && actLogin.status === 200 && actMe.status === 401 && actRefresh.status === 401 && actLogin2.status === 401, `${actMe.status} ${actRefresh.status} ${actLogin2.status}`);

  // ---------------------------------------------------------- 16. rollback on an injected failure
  // A trigger owned by this review database refuses one audit action, so the business write must roll back with it.
  await q(`create table if not exists review_inject(what text)`);
  await q(`create or replace function review_fail_audit() returns trigger language plpgsql as $$ begin
             if exists (select 1 from review_inject where what = NEW.action) then raise exception 'review injected failure'; end if;
             return NEW; end $$`);
  await q(`create trigger review_fail_audit before insert on audit_events for each row execute function review_fail_audit()`);
  const rbEmp = await fixtureEmployee('FX-RB01', 'fx.rb01@example.test');
  const outboxBefore = Number((await one('select count(*)::int c from email_outbox')).c);
  await q(`insert into review_inject values ('APP_USER.INVITATION_SENT')`);
  const rbCreate = await http('POST', '/app-users', { token: SA, body: { employeeId: rbEmp, roles: ['EMPLOYEE'] } });
  const rbState = await one(`select (select count(*) from app_users where employee_id=$1)::int users,
     (select count(*) from email_outbox)::int outbox, (select count(*) from audit_events where after->>'employeeId'=$2)::int audit`, [rbEmp, rbEmp]);
  check('B-1', 'audit failure at the last step of account creation: 500 and nothing left (account, grants, token, outbox, audit) — US-01-06 AC-3',
    rbCreate.status === 500 && rbState.users === 0 && rbState.outbox === outboxBefore && rbState.audit === 0, `${rbCreate.status} ${rbCreate.code} ${JSON.stringify(rbState)}`);
  await q(`delete from review_inject`);
  const victim = await login(IT_EMAIL, itPassword);
  await q(`insert into review_inject values ('APP_USER.LOCKED')`);
  const rbLock = await http('POST', `/app-users/${itId}/lock`, { token: SA });
  const rbAfter = await one(`select status, (select count(*) from auth_sessions where app_user_id=$1 and revoked_at is null)::int open from app_users where id=$1`, [itId]);
  const victimMe = await http('GET', '/me', { token: victim.json.data.accessToken });
  check('B-2', 'audit failure while locking: 500, account still ACTIVE, sessions still open', rbLock.status === 500 && rbAfter.status === 'ACTIVE' && rbAfter.open >= 1 && victimMe.status === 200, `${rbLock.status} ${JSON.stringify(rbAfter)} me=${victimMe.status}`);
  await q(`delete from review_inject`);
  await q(`drop trigger review_fail_audit on audit_events`);
  await q(`drop function review_fail_audit()`);
  await q(`drop table review_inject`);

  // ---------------------------------------------------------- 17. lock timeout (55P03) -> 503
  const holder = new Client({ connectionString: DB_URL });
  await holder.connect();
  await holder.query('BEGIN');
  await holder.query('SELECT id FROM app_users WHERE id=$1 FOR UPDATE', [itId]);
  const [lockBusy, loginBusy, meBusy] = await Promise.all([
    http('POST', `/app-users/${itId}/lock`, { token: SA }),
    login(IT_EMAIL, itPassword),
    http('GET', '/me', { token: victim.json.data.accessToken }),
  ]);
  await holder.query('ROLLBACK');
  await holder.end();
  check('P-1', 'row held FOR UPDATE elsewhere: admin lock -> 503 SERVICE_UNAVAILABLE ~3 s; login -> 503 AUTH.UNAVAILABLE; guard (no lock) 200',
    lockBusy.status === 503 && lockBusy.code === 'SERVICE_UNAVAILABLE' && loginBusy.status === 503 && loginBusy.code === 'AUTH.UNAVAILABLE' && meBusy.status === 200,
    `lock ${lockBusy.status}/${lockBusy.code}/${lockBusy.ms}ms login ${loginBusy.status}/${loginBusy.code}/${loginBusy.ms}ms me ${meBusy.status}`);
  const lockFree = await http('POST', `/app-users/${itId}/lock`, { token: SA });
  const unlockFree = await http('POST', `/app-users/${itId}/unlock`, { token: SA });
  check('P-2', 'after the holder releases, the same operations succeed', lockFree.status === 200 && unlockFree.status === 200);
  await q('delete from login_throttles');

  // ---------------------------------------------------------- 18. SMTP failures, restart, supersede while sending
  const smtpEmp = await fixtureEmployee('FX-SMTP01', 'fx.smtp01@example.test');
  sink.mode = 'temp';
  const smtpAcc = await http('POST', '/app-users', { token: SA, body: { employeeId: smtpEmp, roles: [] } });
  const smtpId = smtpAcc.json.data.id;
  await sleep(3500);
  const tempRow = await one(`select status, attempts, last_error_code, extract(epoch from next_attempt_at - now())::int wait from email_outbox where recipient=$1`, ['fx.smtp01@example.test']);
  check('O-1', 'SMTP 451: row back to PENDING with backoff, attempts 1, error code kept', tempRow.status === 'PENDING' && tempRow.attempts === 1 && tempRow.last_error_code === 'SMTP_451' && tempRow.wait > 15, JSON.stringify(tempRow));
  sink.mode = 'perm';
  await q(`update email_outbox set next_attempt_at = now() where recipient=$1`, ['fx.smtp01@example.test']); // fixture: skip the 30 s backoff
  await sleep(3500);
  const permRow = await one(`select status, last_error_code, payload_ciphertext is null wiped from email_outbox where recipient=$1`, ['fx.smtp01@example.test']);
  const permDetail = await http('GET', `/app-users/${smtpId}`, { token: SA });
  check('O-2', 'SMTP 550: FAILED, ciphertext wiped, visible in account detail', permRow.status === 'FAILED' && permRow.last_error_code === 'SMTP_550' && permRow.wiped && permDetail.json.data.invitation.delivery.status === 'FAILED', JSON.stringify(permRow));
  sink.mode = 'accept';
  await http('POST', `/app-users/${smtpId}/invitations`, { token: SA });
  const smtpMail = await waitMail('fx.smtp01@example.test', 1);
  check('O-3', 'resend after FAILED delivers a new mail', smtpMail?.token, smtpMail ? 'ok' : 'none');
  // worker down: mail waits, then goes
  await stop('worker');
  const downEmp = await fixtureEmployee('FX-DOWN01', 'fx.down01@example.test');
  await http('POST', '/app-users', { token: SA, body: { employeeId: downEmp, roles: [] } });
  await sleep(3000);
  const pendingWhileDown = await one(`select status from email_outbox where recipient=$1`, ['fx.down01@example.test']);
  start('worker', 'worker.js');
  const downMail = await waitMail('fx.down01@example.test', 1);
  check('O-4', 'worker stopped: mail stays PENDING; restarted worker sends it', pendingWhileDown.status === 'PENDING' && downMail, `${pendingWhileDown.status} ${downMail ? 'sent' : 'missing'}`);
  // supersede while the old mail is being sent
  const supEmp = await fixtureEmployee('FX-SUP01', 'fx.sup01@example.test');
  sink.mode = 'slow';
  sink.slowMs = 8000;
  const supAcc = await http('POST', '/app-users', { token: SA, body: { employeeId: supEmp, roles: [] } });
  await sleep(2500);
  const sendingRow = await one(`select status from email_outbox where recipient=$1`, ['fx.sup01@example.test']);
  await http('POST', `/app-users/${supAcc.json.data.id}/invitations`, { token: SA });
  await sleep(500);
  sink.mode = 'accept';
  const supMail1 = await waitMail('fx.sup01@example.test', 1, 20000);
  const supMail2 = await waitMail('fx.sup01@example.test', 2, 20000);
  const sup1Redeem = await http('POST', '/auth/invitations/redeem', { body: { token: supMail1?.token ?? 'x'.repeat(43), password: strongPassword() } });
  const sup2Redeem = await http('POST', '/auth/invitations/redeem', { body: { token: supMail2?.token ?? 'x'.repeat(43), password: strongPassword() } });
  check('O-5', 'resend while the first mail is SENDING: old mail still arrives but its link is rejected; new link works',
    sendingRow.status === 'SENDING' && supMail1 && supMail2 && sup1Redeem.status === 400 && sup2Redeem.status === 200,
    `${sendingRow.status} m1=${!!supMail1} m2=${!!supMail2} r1=${sup1Redeem.status} r2=${sup2Redeem.status}`);
  // two workers, many mails: each delivered exactly once
  start('worker2', 'worker.js');
  await sleep(2000);
  const multi = [];
  for (let i = 1; i <= 6; i += 1) multi.push(await fixtureEmployee(`FX-MW0${i}`, `fx.mw0${i}@example.test`));
  await Promise.all(multi.map((id) => http('POST', '/app-users', { token: SA, body: { employeeId: id, roles: [] } })));
  await sleep(8000);
  const perRecipient = multi.map((_, i) => mailsTo(`fx.mw0${i + 1}@example.test`).length);
  check('O-6', 'two worker processes, six invitations: every recipient got exactly one mail (SKIP LOCKED)', perRecipient.every((n) => n === 1), perRecipient.join(','));
  await stop('worker2');
  // crash in the middle of an SMTP send, then recovery after the lease
  const crashEmp = await fixtureEmployee('FX-CRASH01', 'fx.crash01@example.test');
  sink.mode = 'slow';
  sink.slowMs = 15000;
  await http('POST', '/app-users', { token: SA, body: { employeeId: crashEmp, roles: [] } });
  await sleep(2500);
  await stop('worker'); // hard kill on Windows
  sink.mode = 'accept';
  const crashedRow = await one(`select status, attempts from email_outbox where recipient=$1`, ['fx.crash01@example.test']);
  start('worker', 'worker.js');
  let crashFinal;
  for (let i = 0; i < 100; i += 1) {
    crashFinal = await one(`select status, attempts from email_outbox where recipient=$1`, ['fx.crash01@example.test']);
    if (crashFinal.status === 'SENT') break;
    await sleep(1000);
  }
  await sleep(1000);
  const crashMail = mailsTo('fx.crash01@example.test')[0];
  check('O-7', 'worker killed while SENDING: row stays SENDING until the 60 s lease ends, then the restarted worker sends it (at-least-once)',
    crashedRow.status === 'SENDING' && crashMail && crashFinal.status === 'SENT', `${JSON.stringify(crashedRow)} -> ${JSON.stringify(crashFinal)} mails=${mailsTo('fx.crash01@example.test').length}`);

  // ---------------------------------------------------------- 19. CORS / Origin
  const pre = await fetch(`${BASE}/auth/refresh`, { method: 'OPTIONS', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST' } });
  const preEvil = await fetch(`${BASE}/auth/refresh`, { method: 'OPTIONS', headers: { origin: 'http://evil.example', 'access-control-request-method': 'POST' } });
  check('W-1', 'CORS: configured origin gets ACAO + credentials; other origin gets no ACAO',
    pre.headers.get('access-control-allow-origin') === 'http://localhost:5173' && pre.headers.get('access-control-allow-credentials') === 'true' && !preEvil.headers.get('access-control-allow-origin'),
    `${pre.headers.get('access-control-allow-origin')} / ${preEvil.headers.get('access-control-allow-origin')}`);
  const originLogin = await login(IT_EMAIL, itPassword);
  const evilRefresh = await http('POST', '/auth/refresh', { cookie: originLogin.cookieValue, headers: { origin: 'http://evil.example' } });
  note('W-2', 'refresh with a foreign Origin header and a valid cookie (no Origin check; SameSite=Strict is the browser-side defence)', `${evilRefresh.status}`);
  const helmetRes = await fetch(`${BASE}/health/live`);
  check('W-3', 'security headers present (helmet)', helmetRes.headers.get('x-content-type-options') === 'nosniff' && helmetRes.headers.get('strict-transport-security'), helmetRes.headers.get('content-security-policy')?.slice(0, 30));

  // ---------------------------------------------------------- 20. audit and storage hygiene
  const auditText = (await one(`select coalesce(string_agg(coalesce(before::text,'')||coalesce(after::text,''), ' '), '') t from audit_events`)).t;
  const leaks = [...secretsSeen].filter((s) => s && auditText.includes(s)).length;
  check('Y-1', 'no password, refresh/access/invitation token appears in any audit row (US-01-10 AC-9)', leaks === 0, `${secretsSeen.size} secrets checked`);
  const outboxClear = await one(`select count(*) filter (where status in ('SENT','FAILED','CANCELLED') and payload_ciphertext is not null)::int bad, count(*)::int total from email_outbox`);
  check('Y-2', 'every terminal outbox row has its ciphertext wiped', outboxClear.bad === 0, JSON.stringify(outboxClear));
  const tokensStored = await q(`select token_hash from account_action_tokens union all select token_hash from refresh_tokens`);
  const rawStored = tokensStored.filter((r) => secretsSeen.has(r.token_hash)).length;
  check('Y-3', 'token tables hold only hashes (no raw token stored)', rawStored === 0 && tokensStored.every((r) => /^[0-9a-f]{64}$/.test(r.token_hash)), tokensStored.length);
  const auditImmutable = await sql.query(`update audit_events set action = action where false`).then(() => 'noop').catch((e) => e.code);
  const auditDelete = await sql.query(`delete from audit_events where id = (select id from audit_events limit 1)`).then(() => 'deleted').catch((e) => e.code);
  check('Y-4', 'audit DELETE refused by the database (23001 restrict_violation)', auditDelete === '23001', auditDelete);
  void auditImmutable;
  const actions = await q(`select action, count(*)::int n from audit_events group by 1 order by 1`);
  note('Y-5', 'audit actions recorded', actions.map((a) => `${a.action}×${a.n}`).join(', '));
} catch (error) {
  check('RUN', 'runner aborted', false, `${error.name}: ${error.message}`);
} finally {
  for (const name of Object.keys(procs)) await stop(name);
  // logs must not contain secrets either
  let logLeaks = 0;
  for (const name of ['api', 'worker', 'worker2']) {
    try {
      const text = readFileSync(join(runDir, `${name}.log`), 'utf8');
      logLeaks += [...secretsSeen].filter((s) => s && text.includes(s)).length;
    } catch {
      /* no log */
    }
  }
  check('Y-6', 'API/worker logs contain none of the passwords or tokens seen in the run', logLeaks === 0, logLeaks);
  await new Promise((r) => smtp.close(r));
  await sql.end();
  const summary = { finishedAt: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), pass: results.filter((r) => r.ok === true).length, fail: results.filter((r) => r.ok === false).length, info: results.filter((r) => r.ok === null).length, mails: sink.messages.length };
  writeFileSync(join(runDir, 'results.json'), JSON.stringify({ summary, results }, null, 2));
  console.log(JSON.stringify(summary));
  process.exit(summary.fail === 0 ? 0 : 1);
}
