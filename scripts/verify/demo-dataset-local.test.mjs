// The local operator wrapper (scripts/ops/demo-dataset-local.mjs). Runs the real wrapper logic with the outside world
// replaced: SSH, Git, the local ports and the command are fakes that record what they receive. Never SSH, never a
// database, never the VPS: it proves what the wrapper checks, sends and closes, not that the dataset loads.
import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { afterEach, describe, it } from 'node:test';
import { parseLocalConfig, runLocal } from '../ops/demo-dataset-local.mjs';

const COMMIT = '0123456789abcdef0123456789abcdef01234567';
/** Fake canaries, not credentials: they must reach the command only on stdin (and the database one only in DATABASE_URL). */
const DB_PASSWORD = 'canary-DB-7c1e';
const SA_PASSWORD = 'canary-SA-4d2a';
const DEMO_PASSWORD = 'canary-DEMO-9f1b';
const SETTINGS = [
  ['DEMO_FIXTURE', 'shared-demo-v1'],
  ['DEMO_ORGANIZATION_NAME', 'Công ty TNHH Thử Nghiệm'],
  ['DEMO_OPERATOR_REFERENCE', 'CHG-2026-1030'],
  ['DEMO_API_URL', 'https://slm.example.com'],
  ['DEMO_SSH_TARGET', 'deploy@vps.example.com'],
  ['DEMO_REMOTE_APP_DIR', '/opt/slm/backend'],
  ['DEMO_DATABASE_NAME', 'software_license_management'],
  ['DEMO_DATABASE_USER', 'slm_runtime'],
  ['DEMO_DATABASE_PASSWORD', DB_PASSWORD],
  ['DEMO_SUPER_ADMIN_PASSWORD', SA_PASSWORD],
  ['DEMO_ACCOUNT_PASSWORD', DEMO_PASSWORD],
];
const roots = [];

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

/** A temporary repository-like directory with a build, and a private file outside it. */
function workspace(settings = SETTINGS, { crlf = false } = {}) {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'slm-demo-local-'));
  roots.push(root);
  const repository = path.join(root, 'repo');
  fs.mkdirSync(path.join(repository, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(repository, 'dist', 'cli.js'), '');
  fs.writeFileSync(path.join(repository, 'dist', 'demo-dataset-cli.js'), '');
  const config = path.join(root, 'private', '.env.demo-dataset-local');
  fs.mkdirSync(path.dirname(config));
  const eol = crlf ? '\r\n' : '\n';
  fs.writeFileSync(config, settings.map(([k, v]) => `${k}=${v}`).join(eol) + eol);
  return { root, repository, config };
}

/** The outside world, faked. `answers` overrides what a command answers. */
function fakeWorld({
  image = `ghcr.io/example/slm-api:${COMMIT}\n`,
  diff = '',
  untracked = '',
  tunnelOpens = true,
  cliExit = 0,
  gitRepoForConfig = false,
  configIgnored = true,
  sourcesNewer = false,
} = {}) {
  const calls = { exec: [], tunnel: null, cli: null, killed: false };
  let tunnelUp = false;
  const world = {
    exec: (command, args) => {
      calls.exec.push([command, ...args]);
      const joined = args.join(' ');
      if (command === 'ssh' && joined.includes('releases/current-image'))
        return { status: 0, stdout: image, stderr: '' };
      if (command === 'ssh' && joined.includes('docker inspect'))
        return { status: 0, stdout: '172.18.0.2 \n', stderr: '' };
      if (command === 'git' && joined.includes('rev-parse --is-inside-work-tree'))
        return gitRepoForConfig ? { status: 0, stdout: 'true\n', stderr: '' } : { status: 128, stdout: '', stderr: '' };
      if (command === 'git' && joined.includes('ls-files --error-unmatch'))
        return { status: 1, stdout: '', stderr: '' };
      if (command === 'git' && joined.includes('check-ignore'))
        return { status: configIgnored ? 0 : 1, stdout: '', stderr: '' };
      if (command === 'git' && joined.includes('cat-file')) return { status: 0, stdout: '', stderr: '' };
      if (command === 'git' && joined.includes('diff --name-only')) return { status: 0, stdout: diff, stderr: '' };
      if (command === 'git' && joined.includes('ls-files --others'))
        return { status: 0, stdout: untracked, stderr: '' };
      if (command === process.execPath && joined.includes('--help'))
        return { status: 0, stdout: 'Usage: pnpm ops:demo-dataset … --secrets-stdin', stderr: '' };
      return { status: 1, stdout: '', stderr: `unexpected ${command} ${joined}` };
    },
    spawnTunnel: (command, args) => {
      const child = new EventEmitter();
      child.kill = () => {
        calls.killed = true;
        tunnelUp = false;
        setImmediate(() => child.emit('exit', 0));
      };
      calls.tunnel = [command, ...args];
      if (tunnelOpens) setImmediate(() => (tunnelUp = true));
      else setImmediate(() => child.emit('exit', 255));
      return child;
    },
    spawnCli: (args, options) => {
      const child = new EventEmitter();
      let stdin = '';
      child.stdin = new Writable({
        write(chunk, _encoding, done) {
          stdin += chunk;
          done();
        },
        final(done) {
          calls.cli.stdin = stdin;
          child.stdout.end(`[ĐÃ CÓ] org.departments — Phòng ban\n`);
          child.stderr.end();
          setImmediate(() => child.emit('exit', cliExit));
          done();
        },
      });
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      calls.cli = { args, options };
      return child;
    },
    portOpen: async () => tunnelUp,
    sleep: () => new Promise((resolve) => setImmediate(resolve)),
    newestMtime: () => (sourcesNewer ? Date.now() + 60_000 : 0),
  };
  return { world, calls };
}

/** Runs the wrapper with its output captured; the test runner's own stdout is never touched. */
const quiet = async (fn) => {
  const output = [];
  const sink = { write: (chunk) => output.push(String(chunk)) > 0 };
  const code = await fn({ stdout: sink, stderr: sink });
  return { code, output: output.join('') };
};

const assertNoSecret = (text, label) => {
  for (const secret of [DB_PASSWORD, SA_PASSWORD, DEMO_PASSWORD])
    assert.ok(!text.includes(secret), `${label} carries a secret`);
};

describe('scripts/ops/demo-dataset-local.mjs', () => {
  it('checks the deployed commit, opens the tunnel, runs the command with secrets on stdin only, and closes the tunnel', async () => {
    const { repository, config, root } = workspace();
    const { world, calls } = fakeWorld();

    const { code, output } = await quiet((io) => runLocal({ config, mode: 'apply' }, world, repository, io));

    assert.equal(code, 0, output);
    assert.ok(calls.exec.some((c) => c.join(' ').includes(`cat-file -e ${COMMIT}^{commit}`)));
    assert.ok(calls.exec.some((c) => c.join(' ').includes(`diff --name-only ${COMMIT} -- prisma openapi.json`)));
    assert.ok(calls.exec.filter((c) => c[0] === 'ssh').every((c) => c.includes('BatchMode=yes')));
    assert.deepEqual(calls.tunnel.slice(-3), ['-L', '127.0.0.1:15432:172.18.0.2:5432', 'deploy@vps.example.com']);
    assert.ok(calls.tunnel.includes('-N') && calls.tunnel.includes('ExitOnForwardFailure=yes'));
    assert.deepEqual(calls.cli.args.slice(1), [
      'apply',
      '--fixture=shared-demo-v1',
      '--organization=Công ty TNHH Thử Nghiệm',
      '--api-url=https://slm.example.com',
      '--operator=CHG-2026-1030',
      '--environment=SHARED',
      '--secrets-stdin',
    ]);
    assert.equal(calls.cli.stdin, `SUPER_ADMIN_PASSWORD=${SA_PASSWORD}\nDEMO_ACCOUNT_PASSWORD=${DEMO_PASSWORD}\n`);
    const env = calls.cli.options.env;
    assert.equal(env.NODE_ENV, 'production');
    assert.equal(
      env.DATABASE_URL,
      `postgresql://slm_runtime:${DB_PASSWORD}@127.0.0.1:15432/software_license_management`,
    );
    for (const [name, value] of Object.entries(env))
      if (name !== 'DATABASE_URL') assertNoSecret(String(value), `environment ${name}`);
    assert.ok(!fs.existsSync(path.join(calls.cli.options.cwd, '.env')), 'the command runs where no .env is read');
    assertNoSecret(calls.cli.args.join(' '), 'the arguments');
    assertNoSecret(output, 'the output');
    assert.equal(calls.killed, true, 'the tunnel is closed');
    const reports = fs
      .readdirSync(path.join(root, 'private', 'demo-dataset-reports'))
      .filter((n) => n.endsWith('.txt'));
    assert.equal(reports.length, 1);
    const report = fs.readFileSync(path.join(root, 'private', 'demo-dataset-reports', reports[0]), 'utf8');
    assert.match(report, /org\.departments/);
    assertNoSecret(report, 'the kept report');
  });

  it('passes the exit code of the command through and still closes the tunnel when it fails', async () => {
    const { repository, config } = workspace();
    const { world, calls } = fakeWorld({ cliExit: 1 });

    const { code } = await quiet((io) => runLocal({ config, mode: 'plan' }, world, repository, io));

    assert.equal(code, 1);
    assert.equal(calls.cli.args[1], 'plan');
    assert.equal(calls.killed, true);
  });

  const refusals = [
    [
      'a schema or contract that differs from the deployed commit',
      { diff: 'prisma/models/catalog.prisma\n' },
      /differs from the deployed commit/,
    ],
    [
      'a new migration not yet deployed',
      { untracked: 'prisma/migrations/20261101000000_x/migration.sql\n' },
      /differs from the deployed commit/,
    ],
    ['a moving image tag', { image: 'ghcr.io/example/slm-api:latest\n' }, /immutable image/],
    ['a build older than the sources', { sourcesNewer: true }, /pnpm build again/],
    ['a private file Git would commit', { gitRepoForConfig: true, configIgnored: false }, /not ignored/],
  ];
  for (const [label, options, pattern] of refusals)
    it(`refuses ${label} before any tunnel or command`, async () => {
      const { repository, config } = workspace();
      const { world, calls } = fakeWorld(options);

      const { code, output } = await quiet((io) => runLocal({ config, mode: 'apply' }, world, repository, io));

      assert.equal(code, 3, output);
      assert.match(output, pattern);
      assert.equal(calls.tunnel, null);
      assert.equal(calls.cli, null);
      assertNoSecret(output, 'the output');
    });

  it('fails without running the command when the tunnel does not open', async () => {
    const { repository, config } = workspace();
    const { world, calls } = fakeWorld({ tunnelOpens: false });

    const { code, output } = await quiet((io) => runLocal({ config, mode: 'apply' }, world, repository, io));

    assert.equal(code, 1);
    assert.match(output, /tunnel stopped/);
    assert.equal(calls.cli, null);
  });

  it('reads the private file as data, CRLF included, and refuses what it cannot trust', () => {
    const text = SETTINGS.map(([k, v]) => `${k}=${v}`).join('\r\n') + '\r\n';
    assert.equal(parseLocalConfig(text).DEMO_LOCAL_PORT, '15432');
    const without = (name) =>
      SETTINGS.filter(([k]) => k !== name)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
    const withValue = (name, value) => SETTINGS.map(([k, v]) => `${k}=${k === name ? value : v}`).join('\n');
    assert.throws(() => parseLocalConfig(without('DEMO_DATABASE_PASSWORD')), /DEMO_DATABASE_PASSWORD is required/);
    assert.throws(() => parseLocalConfig(`${withValue('DEMO_FIXTURE', 'x')}\nDEMO_UNKNOWN=1`), /unknown setting/);
    assert.throws(() => parseLocalConfig(withValue('DEMO_API_URL', 'http://slm.example.com')), /must be https/);
    assert.throws(() => parseLocalConfig(withValue('DEMO_API_URL', 'https://slm.example.com/api')), /origin only/);
    assert.throws(() => parseLocalConfig(withValue('DEMO_SSH_TARGET', '-oProxyCommand=x')), /user@host/);
    assert.throws(() => parseLocalConfig(withValue('DEMO_REMOTE_APP_DIR', '/opt/slm;rm -rf /')), /absolute plain path/);
    assert.throws(() => parseLocalConfig(withValue('DEMO_DATABASE_USER', 'slm runtime')), /plain PostgreSQL name/);
    assert.equal(
      parseLocalConfig(withValue('DEMO_API_URL', 'http://127.0.0.1:3000')).DEMO_API_URL,
      'http://127.0.0.1:3000',
    );
  });

  it('ships a template that names every setting and holds no secret value', () => {
    const template = fs.readFileSync(
      path.resolve(import.meta.dirname, '..', '..', '.env.demo-dataset-local.example'),
      'utf8',
    );
    for (const [key] of SETTINGS) assert.match(template, new RegExp(`^${key}=`, 'm'));
    for (const key of ['DEMO_DATABASE_PASSWORD', 'DEMO_SUPER_ADMIN_PASSWORD', 'DEMO_ACCOUNT_PASSWORD'])
      assert.match(template, new RegExp(`^${key}=$`, 'm'));
  });
});
