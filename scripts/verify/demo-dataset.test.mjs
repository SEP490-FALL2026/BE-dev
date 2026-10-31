// The operator wrapper of the demo dataset command (scripts/ops/demo-dataset.sh). Runs the real script with bash on a
// temporary application directory, with a fake `docker` first on PATH that records what it receives (arguments,
// API_IMAGE, its environment and standard input) and a `stat` function loaded through BASH_ENV (Git for Windows keeps no
// POSIX modes; see bootstrap-installation.test.mjs). Never Docker, never a server, never a database: it proves what the
// wrapper sends and refuses, not that the dataset loads on a VPS (that is the integration test of the command).
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterEach, before, describe, it } from 'node:test';
import { bashFor } from './git-bash.mjs';

const REPOSITORY = resolve(import.meta.dirname, '..', '..');
const SCRIPT = join(REPOSITORY, 'scripts', 'ops', 'demo-dataset.sh');
const TEMPLATE = join(REPOSITORY, '.env.demo-dataset.example');
const SHA = '0123456789abcdef0123456789abcdef01234567';
const IMAGE = `ghcr.io/example/slm-api:${SHA}`;
/** Fake canaries, not credentials: they must appear only on standard input. */
const SA_PASSWORD = 'canary-SA-4d2a $(touch x) Äß';
const DEMO_PASSWORD = 'canary-DEMO-9f1b `id` 密';
const ORGANIZATION = 'Công ty TNHH Thử Nghiệm';

const SETTINGS = [
  ['DEMO_FIXTURE', 'shared-demo-v1'],
  ['DEMO_ORGANIZATION_NAME', ORGANIZATION],
  ['DEMO_OPERATOR_REFERENCE', 'CHG-2026-1030'],
  ['DEMO_SUPER_ADMIN_PASSWORD', SA_PASSWORD],
  ['DEMO_ACCOUNT_PASSWORD', DEMO_PASSWORD],
];

const FAKE_DOCKER = `#!/usr/bin/env bash
n=1
while [ -e "$FAKE_LOG/call-$n.argv" ]; do n=$((n + 1)); done
printf '%s\\0' "$@" > "$FAKE_LOG/call-$n.argv"
printf '%s' "\${API_IMAGE-<unset>}" > "$FAKE_LOG/call-$n.image"
env > "$FAKE_LOG/call-$n.env"
for argument in "$@"; do
  if [ "$argument" = --help ]; then
    printf '%s\\n' "\${FAKE_USAGE-Usage: pnpm ops:demo-dataset <plan|apply> ... --secrets-stdin}"
    exit 0
  fi
done
cat > "$FAKE_LOG/call-$n.stdin"
printf '%s\\n' '[ĐÃ CÓ] org.departments — Phòng ban'
if [ -n "\${FAKE_STDERR-}" ]; then printf '%s\\n' "$FAKE_STDERR" >&2; fi
exit "\${FAKE_EXIT:-0}"
`;

const FAKE_STAT_FUNCTION = `stat() {
  if [ "$1" = -c ] && [ "$2" = '%a %u' ]; then
    printf '%s %s\\n' "\${FAKE_STAT_MODE:-600}" "$(id -u)"
    return 0
  fi
  command stat "$@"
}
`;

let bash;
const fixtures = [];

before(() => {
  bash = bashFor();
});

afterEach(() => {
  while (fixtures.length > 0) {
    rmSync(fixtures.at(-1), { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    fixtures.pop();
  }
});

const text = (settings) => settings.map(([key, value]) => `${key}=${value}`).join('\n') + '\n';

function host({ image = `${IMAGE}\n`, settings = SETTINGS } = {}) {
  const root = join(tmpdir(), `slm-demo-dataset-wrapper-${randomUUID()}`);
  fixtures.push(root);
  mkdirSync(root);
  const world = { root, app: join(root, 'app'), bin: join(root, 'bin'), log: join(root, 'log') };
  for (const directory of [world.app, join(world.app, 'releases'), world.bin, world.log]) mkdirSync(directory);
  writeFileSync(join(world.app, 'docker-compose.prod.yml'), 'name: slm-production\n');
  if (image !== null) writeFileSync(join(world.app, 'releases', 'current-image'), image);
  writeFileSync(join(world.bin, 'docker'), FAKE_DOCKER);
  chmodSync(join(world.bin, 'docker'), 0o755);
  world.bashEnv = join(root, 'fake-stat.sh');
  writeFileSync(world.bashEnv, FAKE_STAT_FUNCTION);
  world.config = join(world.app, '.env.demo-dataset');
  writeFileSync(world.config, typeof settings === 'string' ? settings : text(settings));
  chmodSync(world.config, 0o600);
  return world;
}

function run(world, { mode = 'plan', env = {}, args } = {}) {
  const environment = { ...process.env };
  for (const name of Object.keys(environment))
    if (name.startsWith('DEMO_') || name === 'API_IMAGE') delete environment[name];
  const result = spawnSync(
    bash.executable,
    [
      bash.path(SCRIPT),
      ...(args ?? ['--app-dir', bash.path(world.app), '--config', bash.path(world.config), '--mode', mode]),
    ],
    {
      encoding: 'utf8',
      env: {
        ...environment,
        PATH: `${world.bin}${delimiter}${process.env.PATH}`,
        FAKE_LOG: bash.path(world.log),
        BASH_ENV: bash.path(world.bashEnv),
        ...env,
      },
    },
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function calls(world) {
  return readdirSync(world.log)
    .filter((name) => /^call-\d+\.argv$/.test(name))
    .map((_, index) => {
      const base = join(world.log, `call-${index + 1}`);
      const read = (suffix) =>
        existsSync(`${base}.${suffix}`) ? readFileSync(`${base}.${suffix}`, 'utf8') : undefined;
      return {
        argv: read('argv').split('\0').slice(0, -1),
        image: read('image'),
        env: read('env'),
        stdin: read('stdin'),
      };
    });
}

function assertNoPassword(where, label) {
  for (const secret of [SA_PASSWORD, DEMO_PASSWORD, 'canary-SA', 'canary-DEMO']) {
    assert.ok(!where.includes(secret), `${label} carries a password`);
  }
}

describe('scripts/ops/demo-dataset.sh', () => {
  it('runs the command of the deployed image with the settings as arguments and the passwords on stdin only', () => {
    const world = host();
    const result = run(world, { mode: 'apply' });

    assert.equal(result.status, 0, result.output);
    const [help, main] = calls(world);
    assert.deepEqual(help.argv.slice(-3), ['node', 'dist/demo-dataset-cli.js', '--help']);
    assert.equal(main.image, IMAGE);
    assert.deepEqual(main.argv.slice(main.argv.indexOf('api') + 1), [
      'node',
      'dist/demo-dataset-cli.js',
      'apply',
      '--fixture=shared-demo-v1',
      `--organization=${ORGANIZATION}`,
      '--api-url=http://slm-api:3000',
      '--operator=CHG-2026-1030',
      '--environment=SHARED',
      '--secrets-stdin',
    ]);
    assert.ok(main.argv.includes('run') && main.argv.includes('--rm') && main.argv.includes('--no-deps'));
    assert.equal(main.stdin, `SUPER_ADMIN_PASSWORD=${SA_PASSWORD}\nDEMO_ACCOUNT_PASSWORD=${DEMO_PASSWORD}\n`);
    assertNoPassword(main.argv.join(' '), 'the arguments');
    assertNoPassword(main.env, 'the environment of docker');
    assertNoPassword(result.output, 'the output');
    const reports = readdirSync(join(world.app, 'demo-dataset'));
    assert.equal(reports.length, 1);
    assert.match(reports[0], /-shared-demo-v1-apply\.txt$/);
    const report = readFileSync(join(world.app, 'demo-dataset', reports[0]), 'utf8');
    assert.match(report, /org\.departments/);
    assertNoPassword(report, 'the kept report');
  });

  it('keeps the failure lines of the command (stderr) and the API it targeted in the report', () => {
    const world = host();
    const failure =
      'The demo dataset run failed in phase startup after 8012 ms (run 9100 ms): Error retryable=true pg="Query read timeout"';
    const result = run(world, { env: { FAKE_EXIT: '1', FAKE_STDERR: failure } });

    assert.equal(result.status, 1, result.output);
    const [name] = readdirSync(join(world.app, 'demo-dataset'));
    const report = readFileSync(join(world.app, 'demo-dataset', name), 'utf8');
    assert.match(report, /API http:\/\/slm-api:3000 \(default: DEMO_API_URL is not set\)/);
    assert.match(report, new RegExp(`image ${IMAGE.replace(/[.]/g, '\\.')}`));
    assert.ok(report.includes(failure), report);
    assert.match(report, /exit 1 after \d+ s/);
    assertNoPassword(report, 'the kept report');
  });

  it('says in the report when the API URL comes from the private file', () => {
    const world = host({ settings: [...SETTINGS, ['DEMO_API_URL', 'http://slm-api:4000']] });
    run(world);

    const [name] = readdirSync(join(world.app, 'demo-dataset'));
    assert.match(
      readFileSync(join(world.app, 'demo-dataset', name), 'utf8'),
      /API http:\/\/slm-api:4000 \(from DEMO_API_URL\)/,
    );
  });

  it('passes the exit code of the command through, and an optional API URL', () => {
    const world = host({ settings: [...SETTINGS, ['DEMO_API_URL', 'http://api:8080']] });
    const result = run(world, { env: { FAKE_EXIT: '4' } });

    assert.equal(result.status, 4, result.output);
    assert.match(result.output, /conflict or blocked/);
    assert.ok(calls(world)[1].argv.includes('--api-url=http://api:8080'));
  });

  const refusals = [
    [
      'an unknown mode',
      {},
      { args: (w) => ['--app-dir', bash.path(w.app), '--config', bash.path(w.config), '--mode', 'reset'] },
      /--mode must be plan or apply/,
    ],
    ['a missing required setting', { settings: SETTINGS.slice(0, 4) }, {}, /DEMO_ACCOUNT_PASSWORD is required/],
    ['an unknown setting', { settings: [...SETTINGS, ['DEMO_PASSWORD', 'x']] }, {}, /unknown setting/],
    ['a CRLF line', { settings: text(SETTINGS).replace('\n', '\r\n') }, {}, /carriage return/],
    ['a file other users can read', {}, { env: { FAKE_STAT_MODE: '644' } }, /readable by its owner only/],
    ['a moving image tag', { image: 'ghcr.io/example/slm-api:latest\n' }, {}, /immutable image/],
  ];
  for (const [label, hostOptions, runOptions, pattern] of refusals) {
    it(`refuses ${label} before Docker starts, printing no password`, () => {
      const world = host(hostOptions);
      const result = run(world, { ...runOptions, args: runOptions.args?.(world) });

      assert.equal(result.status, 3, result.output);
      assert.match(result.output, pattern);
      assert.deepEqual(calls(world), []);
      assertNoPassword(result.output, 'the output');
    });
  }

  it('refuses an image that has no demo dataset command, sending no password', () => {
    const world = host();
    const result = run(world, { env: { FAKE_USAGE: 'Usage: pnpm ops:bootstrap' } });

    assert.equal(result.status, 3, result.output);
    assert.match(result.output, /deploy a newer image/);
    assert.equal(calls(world).length, 1);
    assert.equal(calls(world)[0].stdin, undefined);
  });

  it('ships a template that names every setting and holds no value', () => {
    const template = readFileSync(TEMPLATE, 'utf8');
    for (const [key] of SETTINGS) assert.match(template, new RegExp(`^${key}=`, 'm'));
    for (const line of template.split('\n').filter((line) => /^DEMO_\w+=/.test(line))) {
      assert.ok(/^DEMO_FIXTURE=shared-demo-v1$|^DEMO_\w+=$/.test(line), `the template gives a value: ${line}`);
    }
  });
});
