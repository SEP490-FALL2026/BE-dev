import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, test } from 'node:test';
import { bashFor } from './git-bash.mjs';

const bash = bashFor();
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const script = resolve(import.meta.dirname, '../ops/seed.sh');
const sha = '0123456789abcdef0123456789abcdef01234567';
const canary = 'seed-test-canary-only';
function world(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'slm-vps-seed-'));
  roots.push(root);
  const app = join(root, 'app');
  mkdirSync(join(app, 'releases'), { recursive: true });
  writeFileSync(join(app, 'releases/current-image'), `ghcr.io/example/slm-api:${sha}`);
  writeFileSync(join(app, 'docker-compose.prod.yml'), 'services: {}');
  writeFileSync(join(app, '.env'), 'PORT=3112\nPOSTGRES_DB=demo_db\n');
  const config = join(root, 'private.env');
  writeFileSync(
    config,
    `SEED_OPERATOR_REFERENCE=TEST-OPS\nSEED_SUPER_ADMIN_PASSWORD=${canary}\nSEED_DEMO_ACCOUNT_PASSWORD=${canary}-demo\nSEED_ALLOW_RESET=${options.allowReset === false ? 'false' : 'true'}\n`,
  );
  const log = join(root, 'commands.jsonl'),
    fake = join(root, 'docker.mjs'),
    startup = join(root, 'bash-env');
  writeFileSync(
    fake,
    `import fs from 'node:fs';
const args=process.argv.slice(2), line=args.join(' ');
const input=line.includes('--secrets-stdin')||line.includes('pg_restore --list')?fs.readFileSync(0,'utf8'):'';
fs.appendFileSync(process.env.FAKE_LOG,JSON.stringify({args,input,image:process.env.API_IMAGE,secrets:Object.keys(process.env).filter(k=>k.startsWith('SEED_'))})+'\\n');
if(process.env.FAKE_FAIL && line.includes(process.env.FAKE_FAIL)) process.exit(1);
if(line.includes('--help')) console.log(process.env.FAKE_PROTOCOL||'SEED_PROTOCOL 1');
else if(line.includes('printenv POSTGRES_DB')) console.log(process.env.FAKE_SERVED_DB||'demo_db');
else if(line.includes('seed check')) { console.log(process.env.FAKE_CHECK); process.exit(Number(process.env.FAKE_CHECK_CODE)); }
else if(line.includes('pg_dump')) { if(process.env.FAKE_EMPTY!=='1') console.log('fake-custom-dump'); }
else if(line.includes('node -e') && process.env.FAKE_READY==='0') process.exit(1);
else if(line.includes('seed apply')) { console.log('seed report'); process.exit(Number(process.env.FAKE_APPLY_CODE||0)); }
`,
  );
  writeFileSync(
    startup,
    `stat(){ if [ "$2" = '%a' ]; then echo 600; else id -u; fi; }; export -f stat\nflock(){ [ "\${FAKE_LOCKED:-0}" != 1 ] || return 3; }; export -f flock\ndocker(){ "$FAKE_NODE" "$FAKE_DOCKER" "$@"; }; export -f docker\n`,
  );
  const check =
    options.check ??
    'STATE\tINSTALLED\nORGANIZATION\tDemo\nFIXTURE_ORGANIZATION\tyes\nENVIRONMENT\tSHARED\nCOUNTS\tdepartments=9\taccounts=22';
  const run = (args = ['--confirm-reset', 'demo_db'], env = {}) =>
    spawnSync(
      bash.executable,
      [bash.path(script), '--app-dir', bash.path(app), '--config', bash.path(config), ...args],
      {
        encoding: 'utf8',
        input: '\n',
        env: {
          ...process.env,
          BASH_ENV: bash.path(startup),
          FAKE_NODE: bash.path(process.execPath),
          FAKE_DOCKER: bash.path(fake),
          FAKE_LOG: log,
          FAKE_CHECK: check,
          FAKE_CHECK_CODE: String(options.checkCode ?? 2),
          ...env,
        },
        timeout: 60000,
      },
    );
  const calls = () => {
    try {
      return readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
    } catch {
      return [];
    }
  };
  return { run, calls, app };
}
const lines = (h) => h.calls().map(({ args }) => args.join(' '));

test('VPS reset orders verified backup, stop, recreate, provision, migrate, reconcile, up, ready and apply', () => {
  const h = world(),
    result = h.run();
  assert.equal(result.status, 0, result.stderr);
  const expected = [
    'seed --help',
    'seed check',
    'pg_dump',
    'pg_restore --list',
    'stop api worker',
    'DROP DATABASE',
    'run --rm -T db-admin',
    'migrate deploy',
    'database-roles-cli.js reconcile',
    'up -d api worker',
    'exec -T api node -e',
    'seed apply',
  ];
  const actual = lines(h);
  let previous = -1;
  for (const step of expected) {
    const at = actual.findIndex((line) => line.includes(step));
    assert(at > previous, step);
    previous = at;
  }
  for (const call of h.calls()) {
    assert.equal(call.image, `ghcr.io/example/slm-api:${sha}`);
    assert.deepEqual(call.secrets, []);
    if (call.args.includes('run')) assert(call.args.includes('-T'));
    assert(!call.args.join(' ').includes(canary));
  }
  assert(
    h
      .calls()
      .find((call) => call.args.includes('apply'))
      .input.includes(canary),
  );
  assert(lines(h).at(-1).includes('--api-url http://api:3112'));
  assert(!result.stdout.includes(canary));
  assert(!result.stderr.includes(canary));
  const reports = readdirSync(join(h.app, 'seed-reports'));
  assert.equal(reports.length, 1);
  const report = readFileSync(join(h.app, 'seed-reports', reports[0]), 'utf8');
  assert(!report.includes(canary));
  assert.match(report, /^seed apply \S+ image ghcr\.io\/example\/slm-api:[0-9a-f]{40} database demo_db phase ready\n/);
  assert.match(report, /seed report\nexit 0\n$/);
  assert.match(readFileSync(join(h.app, 'releases/.deploy.lock'), 'utf8'), /^pid \d+ seed since /);
});
test('an apply that fails after a finished reset keeps the services and prints no restore commands', () => {
  const h = world(),
    result = h.run(undefined, { FAKE_APPLY_CODE: '4' });
  assert.equal(result.status, 4);
  assert(!result.stderr.includes('pg_restore'));
  assert(lines(h).at(-1).includes('seed apply'));
});
test('the database .env names must be the one the postgres container serves, and the image record must exist', () => {
  const other = world();
  assert.equal(other.run([], { FAKE_SERVED_DB: 'another_db' }).status, 3);
  assert(!lines(other).some((line) => line.includes('seed check')));
  const missing = world();
  rmSync(join(missing.app, 'releases/current-image'));
  assert.equal(missing.run([]).status, 3);
  assert.equal(missing.calls().length, 0);
});
test('reset needs opt-in and exact database confirmation; Enter exits', () => {
  assert.equal(world({ allowReset: false }).run().status, 3);
  assert.equal(world().run(['--confirm-reset', 'wrong']).status, 3);
  assert.equal(world().run([]).status, 0);
});
test('deploy lock and protocol mismatch refuse before secrets or changes', () => {
  const locked = world();
  assert.equal(locked.run([], { FAKE_LOCKED: '1' }).status, 3);
  assert.equal(locked.calls().length, 0);
  const old = world();
  assert.equal(old.run([], { FAKE_PROTOCOL: 'old image' }).status, 3);
  assert.equal(old.calls().length, 1);
  assert.equal(old.calls()[0].input, '');
});
test('empty or invalid dump stops before services or database are touched', () => {
  for (const env of [{ FAKE_EMPTY: '1' }, { FAKE_FAIL: 'pg_restore --list' }]) {
    const h = world();
    assert.equal(h.run(undefined, env).status, 1);
    assert(!lines(h).some((line) => line.includes('stop api worker') || line.includes('DROP DATABASE')));
  }
});
test('a failure after recreation stops services and prints dump recovery commands', () => {
  const h = world(),
    result = h.run(undefined, { FAKE_FAIL: 'run --rm -T db-admin' });
  assert.equal(result.status, 1);
  assert(result.stderr.includes('pg_restore'));
  assert(result.stderr.includes('slm-pre-reseed-'));
  assert(lines(h).at(-1).includes('stop api worker'));
});
test('continuation needs the complete fixture organization, not reset opt-in', () => {
  const h = world({ allowReset: false });
  assert.equal(h.run(['--continue']).status, 0);
  assert(!lines(h).some((line) => line.includes('pg_dump')));
  assert.equal(world({ check: 'STATE\tINCOMPLETE\nFIXTURE_ORGANIZATION\tyes' }).run(['--continue']).status, 3);
  assert.equal(world({ check: 'STATE\tINSTALLED\nFIXTURE_ORGANIZATION\tno' }).run(['--continue']).status, 3);
  const local = world({
    check: 'STATE\tINSTALLED\nFIXTURE_ORGANIZATION\tyes\nENVIRONMENT\tLOCAL_TEST',
  });
  assert.equal(local.run(['--continue']).status, 3);
  assert(!lines(local).some((line) => line.includes('seed apply')));
});
test('unmigrated deploys migrations without reset opt-in; empty applies directly; check failure permits only reset', () => {
  const unmigrated = world({ allowReset: false, checkCode: 3, check: 'STATE\tNOT_MIGRATED' });
  assert.equal(unmigrated.run([]).status, 0);
  let previous = -1;
  for (const step of [
    'migrate deploy',
    'reconcile',
    'up -d --force-recreate api worker',
    'exec -T api node -e',
    'seed apply',
  ]) {
    const at = lines(unmigrated).findIndex((line) => line.includes(step));
    assert(at > previous, step);
    previous = at;
  }
  assert(!lines(unmigrated).some((line) => line.includes('pg_dump')));
  assert.equal(world({ checkCode: 0, check: 'STATE\tEMPTY' }).run([]).status, 0);
  assert.equal(world({ checkCode: 1, check: 'SECRETS\tok' }).run().status, 0);
  assert.equal(world({ checkCode: 1, check: 'SECRETS\tok' }).run(['--continue']).status, 3);
  const unverified = world({ checkCode: 1, check: '' });
  assert.equal(unverified.run().status, 3);
  assert(!lines(unverified).some((line) => line.includes('pg_dump')));
});
test('password refusal precedes any dump; readiness timeout stops services; apply status is preserved', () => {
  const refused = world({ checkCode: 3, check: 'REFUSED\tSECRETS\tTOO_SHORT' });
  assert.equal(refused.run().status, 3);
  assert(!lines(refused).some((line) => line.includes('pg_dump')));
  const timeout = world();
  assert.equal(timeout.run(['--confirm-reset', 'demo_db', '--ready-timeout', '1'], { FAKE_READY: '0' }).status, 1);
  assert(lines(timeout).at(-1).includes('stop api worker'));
  assert.equal(world().run(['--continue'], { FAKE_APPLY_CODE: '4' }).status, 4);
});
