#!/usr/bin/env node
// Mutation runner for the G0/1a/1b remediation prototype (gap C-2). Isolated clone only, never a shared checkout.
//
//   node mutate-prototype.mjs --clone <root> --admin-url <url> --out <dir> --run-id <id>
//                             [--only ID,ID] [--extra <json file>] [--list]
//
// Flow: preconditions -> control run (unmutated, every target must exist and pass) -> per mutation:
// apply exactly-once textual change -> run the target tests -> restore the original bytes in `finally`
// (sha256 verified) -> classify. Exit 0 only if every selected mutation is KILLED and every file restored.
//
// Exit codes: 0 all killed; 1 some mutation not KILLED (SURVIVED/UNAPPLIED/INFRA_ERROR/OTHER_FAILURE);
//             2 dirty clone or not a git work tree; 3 control run failed; 4 restore failed; 64 bad usage.
//
// Classification (per mutation, across all its test runs):
//   UNAPPLIED     `from` does not occur exactly once (count recorded); nothing was written, nothing ran.
//   INFRA_ERROR   no JSON from jest, runtime-error suites, testExecError, a failed suite with zero assertions
//                 (compile/import error), spawn error/timeout, a target that matched no assertion, a target that
//                 failed WITHOUT an assertion signature (hook/setup/timeout), or a skipped target.
//   KILLED        >= 1 target assertion failed and its failureMessages carry an assertion signature.
//   SURVIVED      every target assertion passed and nothing else failed.
//   OTHER_FAILURE every target passed but some other test failed (reported, not a kill).
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const RUN_TIMEOUT_MS = 15 * 60 * 1000;
const STALL = 'test/integration/database-stall.integration-spec.ts';
const ACCOUNT_CANDIDATES = 'test/integration/account-candidates.integration-spec.ts';
const BOUNDARIES = 'test/integration/account-candidates-boundaries.integration-spec.ts';
const ME_UNAVAILABLE = 'test/integration/me-unavailable.integration-spec.ts';
const LIST_AND_REDEEM = 'test/integration/account-list-and-redeem.integration-spec.ts';

const PG_POOL_INTEGRATION = 'test/integration/pg-pool.integration-spec.ts';
const PG_POOL_UNIT = 'src/infrastructure/database/pg-pool.spec.ts';
const ENV_SCHEMA_UNIT = 'src/infrastructure/config/env-schema.spec.ts';
const ARCH_UNIT = 'src/architecture-boundaries.spec.ts';
const PG_POOL = 'src/infrastructure/database/pg-pool.ts';

const stall = (...targets) => [{ kind: 'integration', path: STALL, targets }];

/** Default mutation set. `from`/`to` are LF text; matching ignores the file's CRLF. */
const MUTATIONS = [
  {
    id: 'N1a', finding: 'N-1', file: PG_POOL,
    from: 'const pool = new Pool({ ...config, Client: PooledClient });',
    to: 'const pool = new Pool(config);\n  void PooledClient;',
    what: 'pool built with the plain pg Client (the retiring client class is lost)',
    tests: [
      ...stall('never commits a transaction whose statement was answered late (N-1)'),
      { kind: 'integration', path: PG_POOL_INTEGRATION, targets: ['I1: removes a connection retired on a timeout'] },
    ],
  },
  {
    id: 'N1b', finding: 'N-1', file: PG_POOL,
    from: 'void this.end().catch(() => undefined);', to: 'void 0;',
    what: 'a retired connection is not ended',
    tests: [
      ...stall('never commits a transaction whose statement was answered late (N-1)'),
      { kind: 'unit', path: PG_POOL_UNIT, targets: ['retires the client when', 'retires the client on a timeout'] },
    ],
  },
  {
    id: 'N2', finding: 'R-02', file: 'src/infrastructure/database/prisma.service.ts',
    from: "        query_timeout: config.get('DB_QUERY_TIMEOUT_MS', { infer: true }),\n", to: '',
    what: 'pool built without query_timeout (the R-02 budget)',
    tests: stall('ends a bare read on an acquired connection at the query timeout, as a transient error'),
  },
  {
    id: 'N5', finding: 'N-5', file: 'src/infrastructure/database/transaction-runner.ts',
    from: "  'Client was closed and is not queryable',\n", to: '',
    what: '"Client was closed and is not queryable" no longer transient',
    tests: [{
      kind: 'unit', path: 'src/infrastructure/database/transient-error.spec.ts',
      targets: ['treats "Client was closed and is not queryable" as retryable'],
    }],
  },
  {
    id: 'IDLE', finding: 'R-02', file: 'src/infrastructure/database/prisma.service.ts',
    from: "        idle_in_transaction_session_timeout: config.get('DB_IDLE_IN_TRANSACTION_TIMEOUT_MS', { infer: true }),\n", to: '',
    what: 'server-side idle-in-transaction backstop not sent',
    tests: stall('sets the server-side idle-in-transaction backstop on pooled sessions'),
  },
  {
    id: 'DISP', finding: 'R-02', file: 'src/infrastructure/database/prisma.service.ts',
    from: 'new PrismaPg(pool, { disposeExternalPool: true })', to: 'new PrismaPg(pool)',
    what: '$disconnect leaves the service-owned pool open',
    tests: stall('keeps serving and closes every connection on disconnect'),
  },
  {
    id: 'R3x', finding: 'R-03', file: 'src/modules/organization/organization.repo.ts',
    from: '         AND e.id <> ALL (${[...excludeEmployeeIds]}::uuid[])\n', to: '',
    what: 'candidate query ignores the exclusion list',
    tests: [{ kind: 'integration', path: ACCOUNT_CANDIDATES, targets: ['/./'] }],
  },
  {
    id: 'R3y', finding: 'N-6', file: 'src/modules/organization/organization.repo.ts',
    from: '  return term.replace(/[\\\\%_]/g, (character) => `\\\\${character}`);', to: '  return term;',
    what: 'search term no longer escaped (% and _ act as wildcards again)',
    tests: [{
      kind: 'integration', path: BOUNDARIES,
      targets: ['search=Z_1 (underscore is literal)', 'search=% (percent is literal)', 'search=Y<backslash>1 (backslash is literal)'],
    }],
  },
  {
    id: 'R3z', finding: 'R-03', file: 'src/modules/organization/organization.repo.ts',
    from: '       ORDER BY e.employee_code, e.id\n', to: '       ORDER BY e.id\n',
    what: 'candidates no longer sorted by employee code',
    tests: [{ kind: 'integration', path: ACCOUNT_CANDIDATES, targets: ['/./'] }],
  },
  {
    id: 'R15', finding: 'R-15', file: 'src/modules/identity-access/me.controller.ts',
    from: '      throw toUnavailableApiException(error) ?? error;', to: '      throw error;',
    what: '/me no longer maps an unreachable database after the guard to 503',
    tests: [
      { kind: 'unit', path: 'src/modules/identity-access/me.controller.spec.ts', targets: ['/503/'] },
      { kind: 'integration', path: ME_UNAVAILABLE, targets: ['/503/'] },
    ],
  },
  {
    id: 'R12', finding: 'R-12', file: 'src/infrastructure/health/health.controller.ts',
    from: '      if (!(error instanceof ServiceUnavailableException)) throw error;\n', to: '',
    what: 'readiness maps every failure to 503, including non-Terminus errors (the instanceof guard is gone)',
    // The 503 test alone cannot kill this mutation (it still gets a 503); the pass-through test does.
    tests: [{
      kind: 'unit', path: 'src/infrastructure/health/health.controller.spec.ts',
      targets: ['/SERVICE_UNAVAILABLE/', 'leaves any other failure to the global filter'],
    }],
  },
  {
    id: 'R14', finding: 'R-14', file: 'src/modules/identity-access/identity-access.repo.ts',
    from: "{ isolationLevel: 'RepeatableRead' }", to: "{ isolationLevel: 'ReadCommitted' }",
    what: 'account page and count no longer read from one snapshot',
    tests: [{ kind: 'integration', path: LIST_AND_REDEEM, targets: ['/R-14/'] }],
  },
  {
    id: 'R09', finding: 'R-09', file: 'src/modules/identity-access/account-management.service.ts',
    from: "    if (lengthViolation && lengthViolation !== 'EQUALS_LOGIN_EMAIL') throw new PasswordPolicyError(lengthViolation);\n",
    to: "    if (lengthViolation && lengthViolation !== 'EQUALS_LOGIN_EMAIL') throw new PasswordPolicyError(lengthViolation);\n    await this.hasher.hash(password);\n",
    what: 'Argon2 hash runs before the token checks again',
    tests: [{ kind: 'integration', path: LIST_AND_REDEEM, targets: ['/R-09/'] }],
  },
  {
    id: 'C1a', finding: 'N-1', file: PG_POOL,
    from: "const position = typeof third === 'function' ? 2 : typeof second === 'function' ? 1 : -1;",
    to: "const position = typeof args[args.length - 1] === 'function' ? args.length - 1 : -1;",
    what: "callback found by a last-argument heuristic instead of pg's own position rule",
    tests: [{ kind: 'unit', path: PG_POOL_UNIT, targets: ['(text, callback, undefined)'] }],
  },
  {
    id: 'C1b', finding: 'N-1', file: PG_POOL,
    from: `      if (
        typeof (first as { submit?: unknown } | null)?.submit === 'function' ||
        (typeof first === 'object' && first !== null && (first as { callback?: unknown }).callback !== undefined) ||
        (typeof second === 'function' && third !== undefined)
      ) {
        throw new UnsupportedQueryFormError();
      }
`,
    to: '',
    what: 'query() no longer refuses Submittable / config.callback / double-callback forms',
    tests: [{ kind: 'unit', path: PG_POOL_UNIT, targets: ['throws UnsupportedQueryFormError synchronously'] }],
  },
  {
    id: 'C1c', finding: 'N-1', file: PG_POOL,
    from: '    if (this.retired) return;\n', to: '',
    what: 'retire() is no longer idempotent',
    tests: [{ kind: 'unit', path: PG_POOL_UNIT, targets: ['retires once when two queued queries both time out'] }],
  },
  {
    id: 'C1d', finding: 'N-1', file: PG_POOL,
    from: `    try {
      void this.end().catch(() => undefined);
    } catch {
      /* the connection is being abandoned either way */
    }
    try {
      this.onRetired();
    } catch {
      /* the hook can neither block end() nor replace the error */
    }
`,
    to: `    this.onRetired();
    void this.end().catch(() => undefined);
`,
    what: 'the hook runs before end() and unguarded (a throwing hook skips end() and replaces the error)',
    tests: [{
      kind: 'unit', path: PG_POOL_UNIT,
      targets: ['retires the client when', 'when the hook throws (Promise form)', 'when the hook throws (callback form)'],
    }],
  },
  {
    id: 'C1e', finding: 'N-1', file: PG_POOL,
    from: `  pool.on('release', (error, client) => {
    try {
      if (!error && client.getTransactionStatus() !== 'I') (client as unknown as RetireOnTimeoutClient).retire();
    } catch {
      /* never break the release */
    }
  });
`,
    to: '',
    what: 'no release guard: a connection handed back inside a transaction is reused',
    tests: [
      { kind: 'unit', path: PG_POOL_UNIT, targets: ['retires a released client whose transaction status is'] },
      { kind: 'integration', path: PG_POOL_INTEGRATION, targets: ['I11: a connection released inside a transaction'] },
    ],
  },
  {
    id: 'R3w', finding: 'N-6', file: 'src/modules/organization/organization.repo.ts',
    from: '/[\\\\%_]/g, (character)', to: '/[%_]/g, (character)',
    what: 'the LIKE escape class no longer contains the backslash',
    tests: [{ kind: 'integration', path: BOUNDARIES, targets: ['search=Y<backslash>1 (backslash is literal)'] }],
  },
  {
    id: 'R13a', finding: 'R-13', file: 'src/modules/installation/installation.module.ts',
    from: "import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';",
    to: "import { IdentityAccessModule as IdentityAccessFacadeModule } from '../identity-access/identity-access.module';",
    what: 'the installation module imports the full identity-access module again',
    tests: [{
      kind: 'unit', path: ARCH_UNIT,
      targets: ['does not reach the API/worker configuration, the identity-access module, notifications or the JWT library'],
    }],
  },
  {
    id: 'R13b', finding: 'R-13', file: 'src/infrastructure/config/env-config.ts',
    from: '  validate: validateInstallationEnvironment,\n', to: '  validate: validateEnvironment,\n',
    what: 'the installation config options use the full (API) environment validator',
    tests: [{ kind: 'unit', path: ENV_SCHEMA_UNIT, targets: ['validates the installation config options with the installation validator'] }],
  },
  {
    id: 'R13c', finding: 'R-13', file: 'src/infrastructure/config/env-schema.ts',
    from: 'Math.max(DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MS, parsed.DB_TRANSACTION_TIMEOUT_MS + IDLE_MARGIN_MS),',
    to: 'DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MS,',
    what: 'idle-in-transaction default fixed at 20 000 ms regardless of the transaction timeout',
    tests: [{ kind: 'unit', path: ENV_SCHEMA_UNIT, targets: ['does not reject a longer transaction timeout when no idle limit is given'] }],
  },
];

// ---------------------------------------------------------------------------------------------- helpers
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lf = (text) => text.replace(/\r\n/g, '\n');
// eslint-disable-next-line no-control-regex
const stripAnsi = (text) => String(text).replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '');
const log = (line) => console.log(line);

function parseArgs(argv) {
  const args = { list: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--list') args.list = true;
    else if (['--clone', '--admin-url', '--out', '--run-id', '--only', '--extra'].includes(arg)) {
      if (i + 1 >= argv.length) usage(`missing value for ${arg}`);
      args[arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
    } else usage(`unknown argument ${arg}`);
  }
  if (!args.clone) usage('--clone is required');
  if (!args.list) for (const required of ['adminUrl', 'out', 'runId']) if (!args[required]) usage(`--${required.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())} is required`);
  return args;
}

function usage(message) {
  console.error(`mutate-prototype: ${message}`);
  console.error('usage: node mutate-prototype.mjs --clone <root> --admin-url <url> --out <dir> --run-id <id> [--only ID,ID] [--extra <json>] [--list]');
  process.exit(64);
}

/** A target is a plain substring or a /regex/flags string (or RegExp) matched against the Jest fullName. */
function toMatcher(target) {
  if (target instanceof RegExp) return (name) => target.test(name);
  const m = /^\/(.*)\/([a-z]*)$/s.exec(target);
  if (m) {
    const re = new RegExp(m[1], m[2]);
    return (name) => re.test(name);
  }
  return (name) => name.includes(target);
}

function validateMutation(m) {
  for (const key of ['id', 'file', 'from', 'to', 'tests']) {
    if (m[key] === undefined) throw new Error(`mutation ${m.id ?? '?'} lacks "${key}"`);
  }
  for (const t of m.tests) {
    if (!['unit', 'integration', 'e2e', 'scripts'].includes(t.kind) || !t.path || !Array.isArray(t.targets) || t.targets.length === 0) {
      throw new Error(`mutation ${m.id} has a malformed test entry ${JSON.stringify(t)}`);
    }
  }
}

function countOccurrences(haystack, needle) {
  if (needle === '') return 0;
  let count = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) count++;
  return count;
}

function git(root, ...gitArgs) {
  const r = spawnSync('git', ['-C', root, ...gitArgs], { encoding: 'utf8' });
  return { status: r.status, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
}

// ---------------------------------------------------------------------------------------------- restore guard
let active = null; // { path, original, originalSha }
function restoreSync() {
  if (!active) return true;
  const { path, original, originalSha } = active;
  try {
    writeFileSync(path, original);
    return sha256(readFileSync(path)) === originalSha;
  } catch {
    return false;
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    const ok = restoreSync();
    console.error(`mutate-prototype: ${signal}, restore ${ok ? 'verified' : 'FAILED'}`);
    process.exit(ok ? 130 : 4);
  });
}
process.on('uncaughtException', (error) => {
  const ok = restoreSync();
  console.error(`mutate-prototype: uncaught ${error?.stack ?? error}; restore ${ok ? 'verified' : 'FAILED'}`);
  process.exit(ok ? 1 : 4);
});

// ---------------------------------------------------------------------------------------------- test execution
/** Runs one test file and returns a normalised outcome: { ok, infra, reason, assertions, suites, ... }. */
async function runTest(ctx, kind, path, tag) {
  const started = Date.now();
  const logDir = join(ctx.outDir, `logs-${ctx.runId}`);
  mkdirSync(logDir, { recursive: true });
  const env = { ...process.env, TEST_DATABASE_ADMIN_URL: ctx.adminUrl, NO_COLOR: '1' };
  delete env.FORCE_COLOR;
  let command;
  let args;
  let jsonFile = null;
  if (kind === 'scripts') {
    command = process.execPath;
    args = ['--test', '--test-reporter=tap', path];
  } else {
    jsonFile = join(ctx.tmpDir, `${tag}.json`);
    command = process.execPath;
    args = [join(ctx.root, 'node_modules/jest/bin/jest.js')];
    if (kind === 'integration') args.push('--config', './test/config/jest.integration.cjs');
    if (kind === 'e2e') args.push('--config', './test/config/jest.e2e.cjs');
    args.push('--runInBand', '--no-color', '--json', `--outputFile=${jsonFile}`, '--runTestsByPath', path);
  }

  const result = await new Promise((resolvePromise) => {
    let out = '';
    let timedOut = false;
    let child;
    try {
      child = spawn(command, args, { cwd: ctx.root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolvePromise({ spawnError: String(error), exit: null, out: '', timedOut: false });
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, RUN_TIMEOUT_MS);
    const collect = (chunk) => {
      out += chunk.toString('utf8');
      if (out.length > 8_000_000) out = out.slice(-4_000_000);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (error) => {
      clearTimeout(timer);
      resolvePromise({ spawnError: String(error), exit: null, out, timedOut });
    });
    child.on('close', (exit) => {
      clearTimeout(timer);
      resolvePromise({ exit, out, timedOut });
    });
  });

  const redact = ctx.redact;
  const logFile = join(logDir, `${tag}.log`);
  writeFileSync(logFile, redact(stripAnsi(result.out)).slice(-30000));
  const base = { kind, path, exit: result.exit, durationMs: Date.now() - started, log: logFile, assertions: [], suites: [] };
  if (result.spawnError) return { ...base, infra: true, reason: `spawn error: ${redact(result.spawnError)}` };
  if (result.timedOut) return { ...base, infra: true, reason: `timeout after ${RUN_TIMEOUT_MS / 60000} min` };

  if (kind === 'scripts') return { ...base, ...parseTap(stripAnsi(result.out)) };

  let json;
  try {
    json = JSON.parse(readFileSync(jsonFile, 'utf8'));
  } catch {
    return { ...base, infra: true, reason: 'jest produced no JSON result' };
  } finally {
    try { rmSync(jsonFile, { force: true }); } catch { /* ignore */ }
  }
  const assertions = [];
  const suites = [];
  let infraReason = null;
  for (const suite of json.testResults ?? []) {
    const suiteInfo = { name: suite.name?.replace(ctx.root, '').replace(/\\/g, '/'), status: suite.status, assertions: suite.assertionResults?.length ?? 0 };
    suites.push(suiteInfo);
    if (suite.testExecError) infraReason ??= `testExecError: ${redact(stripAnsi(JSON.stringify(suite.testExecError)).slice(0, 200))}`;
    else if (suite.status === 'failed' && (suite.assertionResults?.length ?? 0) === 0) {
      infraReason ??= `suite failed with zero assertions (compile/import error): ${redact(stripAnsi(suite.message ?? '').replace(/\s+/g, ' ').trim().slice(0, 200))}`;
    }
    for (const a of suite.assertionResults ?? []) {
      assertions.push({
        fullName: a.fullName,
        status: a.status,
        failureMessages: (a.failureMessages ?? []).map((m) => redact(stripAnsi(m))),
        durationMs: a.duration ?? null,
      });
    }
  }
  if (json.numRuntimeErrorTestSuites > 0) infraReason ??= `numRuntimeErrorTestSuites=${json.numRuntimeErrorTestSuites}`;
  return {
    ...base, infra: Boolean(infraReason), reason: infraReason, assertions, suites,
    counts: { total: json.numTotalTests, passed: json.numPassedTests, failed: json.numFailedTests, pending: json.numPendingTests },
  };
}

/** Minimal TAP parser for `node --test --test-reporter=tap` (scripts kind). */
function parseTap(text) {
  const assertions = [];
  const lines = text.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    const m = /^(\s*)(not ok|ok) \d+ - (.+?)(?: # (SKIP|TODO).*)?$/.exec(line);
    if (m) {
      current = {
        fullName: m[3].trim(),
        status: m[4] ? 'pending' : m[2] === 'ok' ? 'passed' : 'failed',
        failureMessages: [],
        durationMs: null,
      };
      assertions.push(current);
    } else if (current && current.status === 'failed' && /^\s+\S/.test(line)) {
      current.failureMessages.push(line.trim());
    }
  }
  for (const a of assertions) a.failureMessages = [a.failureMessages.join('\n')];
  if (assertions.length === 0) return { infra: true, reason: 'no TAP assertions found', assertions, suites: [] };
  return { infra: false, reason: null, assertions, suites: [{ name: 'tap', status: 'n/a', assertions: assertions.length }], counts: {
    total: assertions.length, passed: assertions.filter((a) => a.status === 'passed').length,
    failed: assertions.filter((a) => a.status === 'failed').length, pending: assertions.filter((a) => a.status === 'pending').length } };
}

const ASSERTION_SIGNATURE = /expect\(|Expected|Received|\.(?:toBe|toEqual|toStrictEqual|toMatch|toMatchObject|toContain|toThrow|toHaveLength|toHaveBeenCalled|toBeInstanceOf|rejects|resolves)\b|AssertionError|assert\./;

/** Evaluates each target of a test entry against one run. Returns { targets:[...], problem } */
function evaluateTargets(entry, run) {
  const targets = entry.targets.map((target) => {
    const match = toMatcher(target);
    const matched = run.assertions.filter((a) => match(a.fullName));
    return { target: String(target), matched };
  });
  return targets;
}

// ---------------------------------------------------------------------------------------------- main
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = resolve(args.clone);
  let mutations = [...MUTATIONS];
  if (args.extra) {
    const extra = JSON.parse(readFileSync(resolve(args.extra), 'utf8'));
    if (!Array.isArray(extra)) usage('--extra must be a JSON array of mutation objects');
    mutations.push(...extra);
  }
  for (const m of mutations) validateMutation(m);
  const ids = mutations.map((m) => m.id);
  if (new Set(ids).size !== ids.length) usage('duplicate mutation ids');
  if (args.only) {
    const wanted = args.only.split(',').map((s) => s.trim()).filter(Boolean);
    const unknown = wanted.filter((id) => !ids.includes(id));
    if (unknown.length > 0) usage(`unknown mutation id(s) in --only: ${unknown.join(',')}`);
    mutations = mutations.filter((m) => wanted.includes(m.id));
  }

  // --list: dry run, no writes.
  if (args.list) {
    let bad = 0;
    for (const m of mutations) {
      const path = join(root, m.file);
      let count = 0;
      let note = '';
      if (!existsSync(path)) note = 'file missing';
      else count = countOccurrences(lf(readFileSync(path, 'utf8')), lf(m.from));
      const ok = count === 1;
      if (!ok) bad++;
      log(`${m.id.padEnd(5)} ${ok ? 'APPLIES-ONCE' : `UNAPPLIED(count=${count}${note ? ', ' + note : ''})`} ${m.file} :: ${m.what ?? ''}`);
    }
    log(`${mutations.length} mutation(s), ${mutations.length - bad} apply exactly once, ${bad} do not`);
    process.exit(bad === 0 ? 0 : 1);
  }

  // Preconditions.
  const outDir = resolve(args.out);
  mkdirSync(outDir, { recursive: true });
  const resultPath = join(outDir, `mutation-${args.runId}.json`);
  const head = git(root, 'rev-parse', 'HEAD');
  if (head.status !== 0) { console.error(`mutate-prototype: not a git work tree: ${root}`); process.exit(2); }
  const dirty = git(root, 'status', '--porcelain');
  if (dirty.status !== 0 || dirty.out !== '') { console.error('mutate-prototype: dirty clone'); process.exit(2); }

  const adminPassword = /^[a-z]+:\/\/[^:@/]+:([^@]+)@/i.exec(args.adminUrl)?.[1];
  const redact = (text) => {
    let s = String(text);
    if (args.adminUrl) s = s.split(args.adminUrl).join('<admin-url>');
    if (adminPassword) s = s.split(adminPassword).join('<redacted>');
    return s;
  };
  const tmpDir = mkdtempSync(join(outDir, `tmp-${args.runId}-`));
  const ctx = { root, outDir, runId: args.runId, adminUrl: args.adminUrl, tmpDir, redact };

  const scriptSha256 = sha256(readFileSync(SCRIPT_PATH));
  const files = [...new Set(mutations.map((m) => m.file))];
  const targetFileHashes = {};
  for (const f of files) targetFileHashes[f] = existsSync(join(root, f)) ? sha256(readFileSync(join(root, f))) : null;

  const result = {
    runId: args.runId,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    node: process.version,
    cloneHead: head.out,
    scriptSha256,
    targetFileHashes,
    control: [],
    mutations: [],
    summary: { killed: 0, survived: 0, unapplied: 0, infraError: 0, otherFailure: 0, restoreFailed: 0 },
    gitStatusAfter: null,
  };
  const t0 = Date.now();
  const save = () => writeFileSync(resultPath, JSON.stringify(result, null, 2));
  const finish = (status, exitCode) => {
    result.status = status;
    result.finishedAt = new Date().toISOString();
    result.durationMs = Date.now() - t0;
    result.gitStatusAfter = git(root, 'status', '--porcelain').out;
    result.targetFileHashesAfter = Object.fromEntries(files.map((f) => [f, existsSync(join(root, f)) ? sha256(readFileSync(join(root, f))) : null]));
    save();
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    log(`summary ${JSON.stringify(result.summary)} status=${status} runtime=${Math.round(result.durationMs / 1000)}s result=${resultPath}`);
    process.exit(exitCode);
  };

  log(`mutate-prototype run=${args.runId} head=${head.out.slice(0, 7)} node=${process.version} script=${scriptSha256.slice(0, 12)} mutations=${mutations.map((m) => m.id).join(',')}`);

  // Control run: each distinct (kind, path) once, all targets of every mutation that uses it.
  const controlGroups = new Map();
  for (const m of mutations) {
    for (const t of m.tests) {
      const key = `${t.kind}|${t.path}`;
      if (!controlGroups.has(key)) controlGroups.set(key, { kind: t.kind, path: t.path, targets: [] });
      for (const target of t.targets) controlGroups.get(key).targets.push(target);
    }
  }
  let controlOk = true;
  let n = 0;
  for (const group of controlGroups.values()) {
    const run = await runTest(ctx, group.kind, group.path, `control-${++n}`);
    const failedNames = run.assertions.filter((a) => a.status === 'failed').map((a) => a.fullName);
    const problems = [];
    if (run.infra) problems.push(`infra: ${run.reason}`);
    if (failedNames.length > 0) problems.push(`failing tests in control: ${failedNames.slice(0, 5).join(' | ')}`);
    for (const target of new Set(group.targets.map(String))) {
      const match = toMatcher(target);
      const matched = run.assertions.filter((a) => match(a.fullName));
      if (matched.length === 0) problems.push(`target not found: ${target}`);
      else if (matched.some((a) => a.status !== 'passed')) problems.push(`target not passing: ${target}`);
    }
    const entry = {
      kind: group.kind, path: group.path, durationMs: run.durationMs, exit: run.exit, counts: run.counts ?? null,
      targets: [...new Set(group.targets.map(String))], ok: problems.length === 0, problems,
    };
    result.control.push(entry);
    log(`control ${entry.ok ? 'OK ' : 'FAIL'} ${group.kind}:${group.path} ${run.counts ? `${run.counts.passed}/${run.counts.total} passed` : ''} ${problems.join('; ')}`);
    if (!entry.ok) controlOk = false;
  }
  if (!controlOk) {
    result.mutations = mutations.map((m) => ({ id: m.id, status: 'NOT_RUN' }));
    log('CONTROL_FAILED: no mutation was run');
    finish('CONTROL_FAILED', 3);
  }

  // Mutations.
  let restoreFailed = false;
  for (const m of mutations) {
    const entry = { id: m.id, finding: m.finding ?? null, file: m.file, what: m.what ?? null, status: null, reason: null, restored: null, runs: [] };
    result.mutations.push(entry);
    const path = join(root, m.file);
    if (!existsSync(path)) {
      Object.assign(entry, { status: 'UNAPPLIED', reason: 'file missing', occurrences: 0 });
      result.summary.unapplied++;
      log(`${m.id.padEnd(5)} UNAPPLIED (file missing) ${m.file}`);
      continue;
    }
    const original = readFileSync(path);
    const originalSha = sha256(original);
    const text = lf(original.toString('utf8'));
    const from = lf(m.from);
    const occurrences = countOccurrences(text, from);
    entry.occurrences = occurrences;
    if (occurrences !== 1) {
      entry.status = 'UNAPPLIED';
      entry.reason = `pattern occurs ${occurrences} times (need exactly 1)`;
      result.summary.unapplied++;
      log(`${m.id.padEnd(5)} UNAPPLIED (occurrences=${occurrences}) ${m.file}`);
      continue;
    }

    active = { path, original, originalSha };
    try {
      const at = text.indexOf(from);
      writeFileSync(path, text.slice(0, at) + lf(m.to) + text.slice(at + from.length));
      let index = 0;
      for (const entryTest of m.tests) {
        const run = await runTest(ctx, entryTest.kind, entryTest.path, `${m.id}-${++index}`);
        const targets = evaluateTargets(entryTest, run).map(({ target, matched }) => ({
          target,
          matchedCount: matched.length,
          passed: matched.filter((a) => a.status === 'passed').length,
          failed: matched
            .filter((a) => a.status === 'failed')
            .map((a) => ({
              name: a.fullName,
              assertionSignature: a.failureMessages.some((msg) => ASSERTION_SIGNATURE.test(msg)),
              message: a.failureMessages.join(' ').replace(/\s+/g, ' ').trim().slice(0, 200),
            })),
          other: matched.filter((a) => a.status !== 'passed' && a.status !== 'failed').map((a) => `${a.fullName} (${a.status})`),
        }));
        const nonTargetFailed = run.assertions
          .filter((a) => a.status === 'failed' && !entryTest.targets.some((tg) => toMatcher(tg)(a.fullName)))
          .map((a) => a.fullName);
        entry.runs.push({
          kind: entryTest.kind, path: entryTest.path, exit: run.exit, durationMs: run.durationMs, counts: run.counts ?? null,
          infra: run.infra, reason: run.reason, targets, nonTargetFailed: nonTargetFailed.slice(0, 20), log: run.log,
        });
      }
    } finally {
      const ok = restoreSync();
      active = null;
      entry.restored = ok;
      if (!ok) restoreFailed = true;
    }
    if (restoreFailed) {
      entry.status = 'RESTORE_FAILED';
      result.summary.restoreFailed++;
      log(`${m.id.padEnd(5)} RESTORE_FAILED ${m.file} (exit 4)`);
      finish('RESTORE_FAILED', 4);
    }

    // Classify.
    const infraReasons = [];
    let killed = false;
    let targetFailedAll = [];
    let targetsAllPassed = true;
    let otherFailed = [];
    for (const run of entry.runs) {
      if (run.infra) infraReasons.push(`${run.kind}:${run.path}: ${run.reason}`);
      for (const t of run.targets) {
        if (t.matchedCount === 0) infraReasons.push(`target not found: ${t.target}`);
        if (t.other.length > 0) infraReasons.push(`target not executed: ${t.other.join(', ')}`);
        for (const f of t.failed) {
          targetsAllPassed = false;
          targetFailedAll.push(f);
          if (f.assertionSignature) killed = true;
        }
      }
      otherFailed = otherFailed.concat(run.nonTargetFailed);
    }
    if (infraReasons.length > 0) {
      entry.status = 'INFRA_ERROR';
      entry.reason = infraReasons.join(' ; ').slice(0, 600);
      result.summary.infraError++;
    } else if (killed) {
      entry.status = 'KILLED';
      result.summary.killed++;
    } else if (targetFailedAll.length > 0) {
      entry.status = 'INFRA_ERROR';
      entry.reason = `target failed without an assertion signature (hook/setup/timeout?): ${targetFailedAll.map((f) => f.name).join(' | ').slice(0, 300)}`;
      result.summary.infraError++;
    } else if (otherFailed.length > 0) {
      entry.status = 'OTHER_FAILURE';
      entry.reason = `targets passed, other tests failed: ${otherFailed.slice(0, 5).join(' | ')}`;
      result.summary.otherFailure++;
    } else if (targetsAllPassed) {
      entry.status = 'SURVIVED';
      result.summary.survived++;
    }
    entry.failedTargets = targetFailedAll.map((f) => ({ name: f.name, message: f.message }));
    const durations = Math.round(entry.runs.reduce((s, r) => s + r.durationMs, 0) / 1000);
    log(`${m.id.padEnd(5)} ${entry.status} restored=${entry.restored} ${durations}s ${m.what ?? ''}${entry.reason ? ` :: ${entry.reason}` : ''}${targetFailedAll.length ? ` :: failed: ${targetFailedAll.map((f) => f.name).join(' | ').slice(0, 200)}` : ''}`);
    save();
  }

  const allKilled = result.mutations.length > 0 && result.mutations.every((m) => m.status === 'KILLED' && m.restored === true);
  finish('COMPLETED', allKilled ? 0 : 1);
}

main().catch((error) => {
  const ok = restoreSync();
  console.error(`mutate-prototype: fatal ${error?.stack ?? error}; restore ${ok ? 'verified' : 'FAILED'}`);
  process.exit(ok ? 1 : 4);
});
