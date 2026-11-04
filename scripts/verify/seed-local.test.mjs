import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { main, createChildRunner, needsBuild } from '../dev/seed-local.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const protocol = (state = 'INSTALLED', extra = '') =>
  `STATE\t${state}\nORGANIZATION\tDemo\nFIXTURE_ORGANIZATION\tyes\nENVIRONMENT\tLOCAL_TEST\nCOUNTS\tdepartments=9\taccounts=22\n${extra}`;
function world(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'slm-local-seed-'));
  roots.push(root);
  const configuration = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://owner@localhost/demo',
    PORT: '3111',
    SEED_SUPER_ADMIN_PASSWORD: 'a long operator test password',
    SEED_DEMO_ACCOUNT_PASSWORD: 'a long demo test password',
    SEED_READY_TIMEOUT_SECONDS: '.001',
    ...options.settings,
  };
  writeFileSync(
    join(root, '.env.seed.local'),
    Object.entries(configuration)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n'),
  );
  const calls = [],
    output = [];
  let environment;
  const runner = {
    run: async (command, args, input) => {
      calls.push({ command, args, input });
      if (args.includes('check')) return options.check || { code: 2, stdout: protocol() };
      return {
        code: options.fail?.(args) ? 1 : args.includes('apply') ? options.applyCode || 0 : 0,
        stdout: args.includes('apply') ? 'seed report' : '',
      };
    },
    start: (_command, args) => calls.push({ start: args }),
    close: async () => calls.push({ close: true }),
  };
  const dependencies = {
    root,
    parentEnvironment: options.parentEnvironment,
    runnerFactory: (_root, env) => {
      environment = env;
      return runner;
    },
    probe: async (_url, ready) => (ready ? options.ready !== false : options.portBusy === true),
    needsBuild: () => options.build === true,
    output: (line) => output.push(line),
    ask: async () => options.answer ?? '',
    delay: async () => {},
  };
  return { calls, output, configuration, env: () => environment, run: (argv = []) => main(argv, dependencies), root };
}

for (const settings of [
  { NODE_ENV: 'test' },
  { NODE_ENV: 'production' },
  { NODE_ENV: '' },
  { DATABASE_URL: '' },
  { DATABASE_URL: 'postgresql://owner@remote/db' },
  { SEED_DEMO_ACCOUNT_PASSWORD: '' },
])
  test('guards refuse before spawning any process', async () => {
    const h = world({ settings });
    assert.equal(await h.run(), 3);
    assert.equal(h.calls.length, 0);
  });
test('busy API port refuses before build or check', async () => {
  const h = world({ portBusy: true, build: true });
  assert.equal(await h.run(), 3);
  assert.equal(h.calls.length, 0);
});
for (const answer of ['', 'wrong', 'c'])
  test(`confirmation handles ${JSON.stringify(answer)} for incomplete installation`, async () => {
    const h = world({ answer, check: { code: 2, stdout: protocol('INCOMPLETE') } });
    assert.equal(await h.run(), answer === '' ? 0 : 3);
    assert.equal(h.calls.filter((call) => call.args?.includes('reset')).length, 0);
  });
test('correct reset orders check/reset/deploy/start/apply/cleanup and hides passwords', async () => {
  const h = world();
  assert.equal(await h.run(['--confirm-reset', 'demo']), 0);
  assert.deepEqual(
    h.calls.map((call) =>
      call.args?.includes('check')
        ? 'check'
        : call.args?.includes('reset')
          ? 'reset'
          : call.args?.includes('deploy')
            ? 'deploy'
            : call.start?.[0] || (call.args?.includes('apply') ? 'apply' : 'close'),
    ),
    ['check', 'reset', 'deploy', 'dist/main', 'dist/worker', 'apply', 'close'],
  );
  assert(h.calls.find((call) => call.args?.includes('apply')).args.includes('--allow-bootstrap'));
  assert(
    !JSON.stringify(h.calls.map(({ input, ...rest }) => rest)).includes(h.configuration.SEED_SUPER_ADMIN_PASSWORD),
  );
  assert(!h.output.join('').includes(h.configuration.SEED_DEMO_ACCOUNT_PASSWORD));
});
test('continuation skips reset and preserves apply exit status', async () => {
  const h = world({ applyCode: 4 });
  assert.equal(await h.run(['--continue']), 4);
  assert(!h.calls.some((call) => call.args?.includes('reset')));
});
for (const state of ['EMPTY', 'NOT_MIGRATED'])
  test(`migrates ${state} without prompting or resetting`, async () => {
    const h = world({ check: { code: state === 'EMPTY' ? 0 : 3, stdout: protocol(state) } });
    assert.equal(await h.run(), 0);
    assert(!h.calls.some((call) => call.args?.includes('reset')));
  });
test('check failure permits reset only; shared environment refuses reset', async () => {
  const failed = world({ check: { code: 1, stdout: '' } });
  assert.equal(await failed.run(['--confirm-reset', 'demo']), 0);
  const continuation = world({ check: { code: 1, stdout: protocol() } });
  assert.equal(await continuation.run(['--continue']), 3);
  const shared = world({ check: { code: 2, stdout: protocol().replace('LOCAL_TEST', 'SHARED') } });
  assert.equal(await shared.run(['--confirm-reset', 'demo']), 3);
});
test('another organization rejects continuation', async () => {
  const h = world({ check: { code: 2, stdout: protocol().replace('yes', 'no') } });
  assert.equal(await h.run(['--continue']), 3);
});
test('weak-password check never resets and removes inherited Prisma consent from children', async () => {
  const key = 'PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION';
  const h = world({
    parentEnvironment: { [key]: 'simulated inherited value' },
    check: { code: 3, stdout: 'REFUSED\tSECRETS\tTOO_SHORT\n' },
  });
  assert.equal(await h.run(['--confirm-reset', 'demo']), 3);
  assert(!h.calls.some((call) => call.args?.includes('reset')));
  assert.equal(h.env()[key], undefined);
  assert.equal(h.env().DOTENV_CONFIG_PATH, join(h.root, '.env.seed.local'));
});
test('stale build runs first and readiness timeout stops both children', async () => {
  const h = world({ build: true, ready: false });
  assert.equal(await h.run(['--continue']), 1);
  assert.equal(h.calls[0].command, 'pnpm');
  assert.equal(h.calls.at(-1).close, true);
  assert(!h.calls.some((call) => call.args?.includes('apply')));
});
test('build freshness compares dist against source/prisma', () => {
  const h = world();
  assert(needsBuild(h.root));
  mkdirSync(join(h.root, 'dist'));
  mkdirSync(join(h.root, 'src'));
  writeFileSync(join(h.root, 'src/a.ts'), '');
  writeFileSync(join(h.root, 'dist/cli.js'), '');
  utimesSync(join(h.root, 'dist/cli.js'), new Date(0), new Date(0));
  assert(needsBuild(h.root));
});
test('SIGINT stops registered children and prevents further spawning', async () => {
  const child = new EventEmitter();
  child.stdin = { on() {}, end() {} };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  let killed = 0;
  const previous = process.exitCode;
  const runner = createChildRunner(
    '.',
    {},
    () => child,
    () => {
      killed++;
      child.emit('close', 0);
    },
  );
  try {
    runner.start('fake-node', []);
    process.emit('SIGINT');
    assert(runner.aborted);
    assert.equal(killed, 1);
    assert.throws(() => runner.start('fake-node', []));
  } finally {
    await runner.close();
    process.exitCode = previous;
  }
});
