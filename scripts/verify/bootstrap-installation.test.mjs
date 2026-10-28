// Prompt 06: the operator wrapper of the installation command (scripts/ops/bootstrap-installation.sh). Runs the real
// script with bash on a temporary application directory, with a fake `docker` first on PATH that only records what it
// receives (arguments, API_IMAGE, its whole environment and standard input) and a `stat` function, loaded through
// BASH_ENV, that answers the mode and owner of the configuration file (Git for Windows keeps no POSIX modes, and its
// bash puts /usr/bin before PATH, so a fake executable could not shadow the real stat); never on a server, never with
// Docker, never against a database. A mock proves what the wrapper sends, not that the installation works on a VPS.
//
// Proves: the settings and the password come from the private file, parsed as data (no expansion, no code execution,
// literal Unicode, spaces and metacharacters, exact password bytes); a missing, empty, unknown or duplicate setting, a
// loose file mode or an unusable image stops it before Docker starts; the password travels on standard input only and
// appears in no argument, no environment, no output, no trace and no file left behind; the exact deployed image is
// selected and the run refuses an image without the stdin mode instead of feeding it a legacy prompt; the exit codes of
// the installation command are the wrapper's; nothing but `run` of the api service is ever asked of Docker.
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterEach, before, describe, it } from 'node:test';
import { bashFor } from './git-bash.mjs';

const REPOSITORY = resolve(import.meta.dirname, '..', '..');
const SCRIPT = join(REPOSITORY, 'scripts', 'ops', 'bootstrap-installation.sh');
const TEMPLATE = join(REPOSITORY, '.env.bootstrap.example');
const SHA = '0123456789abcdef0123456789abcdef01234567';
const IMAGE = `ghcr.io/example/slm-api:${SHA}`;
/** A fake canary, not a credential: it must appear only where the password is meant to travel. */
const CANARY = 'canary-Pw-7c1e';
const PASSWORD = `${CANARY} Äß 密`;
const ORGANIZATION = 'Công ty TNHH Thử Nghiệm';
const ADMIN_EMAIL = 'quan.tri@example.test';

const REQUIRED = [
  'BOOTSTRAP_TIMEZONE',
  'BOOTSTRAP_ORGANIZATION_NAME',
  'BOOTSTRAP_DEPARTMENT_CODE',
  'BOOTSTRAP_DEPARTMENT_NAME',
  'BOOTSTRAP_ADMIN_CODE',
  'BOOTSTRAP_ADMIN_NAME',
  'BOOTSTRAP_ADMIN_EMAIL',
  'BOOTSTRAP_ADMIN_HIRE_DATE',
  'BOOTSTRAP_OPERATOR_REFERENCE',
  'BOOTSTRAP_ADMIN_PASSWORD',
];
const OPTIONAL = ['BOOTSTRAP_CURRENCY', 'BOOTSTRAP_LOGIN_EMAIL', 'BOOTSTRAP_ADMIN_TYPE'];

const DEFAULT_SETTINGS = [
  ['BOOTSTRAP_TIMEZONE', 'Asia/Ho_Chi_Minh'],
  ['BOOTSTRAP_ORGANIZATION_NAME', ORGANIZATION],
  ['BOOTSTRAP_DEPARTMENT_CODE', 'IT'],
  ['BOOTSTRAP_DEPARTMENT_NAME', 'Phòng Công nghệ Thông tin'],
  ['BOOTSTRAP_ADMIN_CODE', 'SA001'],
  ['BOOTSTRAP_ADMIN_NAME', 'Nguyễn Văn Quản Trị'],
  ['BOOTSTRAP_ADMIN_EMAIL', ADMIN_EMAIL],
  ['BOOTSTRAP_ADMIN_HIRE_DATE', '2026-01-05'],
  ['BOOTSTRAP_OPERATOR_REFERENCE', 'CHG-2026-1028'],
  ['BOOTSTRAP_ADMIN_PASSWORD', PASSWORD],
];

/** The words that would reveal a value of the file in an output; none may appear in what the wrapper prints. */
const PRIVATE_WORDS = [CANARY, ORGANIZATION, ADMIN_EMAIL, 'SA001', 'CHG-2026-1028'];

const FAKE_DOCKER = `#!/usr/bin/env bash
# Records one call: arguments (NUL separated), API_IMAGE, the whole environment and, for the installation run, stdin.
n=1
while [ -e "$FAKE_LOG/call-$n.argv" ]; do n=$((n + 1)); done
printf '%s\\0' "$@" > "$FAKE_LOG/call-$n.argv"
printf '%s' "\${API_IMAGE-<unset>}" > "$FAKE_LOG/call-$n.image"
env > "$FAKE_LOG/call-$n.env"
help=0
for argument in "$@"; do [ "$argument" = --help ] && help=1; done
if [ "$help" = 1 ]; then
  if [ -n "\${FAKE_HELP_EXIT:-}" ]; then exit "$FAKE_HELP_EXIT"; fi
  printf '%s\\n' "\${FAKE_USAGE-Usage: pnpm ops:bootstrap [options]  --password-stdin  Read the password from standard input}"
  exit 0
fi
case " $* " in
  *installation-cli.js*)
    cat > "$FAKE_LOG/call-$n.stdin"
    printf '%s\\n' "\${FAKE_INSTALL_OUT:-Installation complete.}"
    exit "\${FAKE_INSTALL_EXIT:-0}" ;;
esac
echo 'fake docker: unexpected call' >&2
exit 99
`;

/** Sourced through BASH_ENV: answers the one question the wrapper asks; every other call is the real stat. */
const FAKE_STAT_FUNCTION = `stat() {
  if [ "$1" = -c ] && [ "$2" = '%a %u' ]; then
    printf '%s %s\\n' "\${FAKE_STAT_MODE:-600}" "\${FAKE_STAT_UID:-$(id -u)}"
    return 0
  fi
  command stat "$@"
}
`;

let bash;
/** Exact directories this file creates, registered before they exist and removed by exact path. */
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
const withSettings = (overrides) => {
  const result = DEFAULT_SETTINGS.map(([key, value]) => [key, key in overrides ? overrides[key] : value]);
  for (const [key, value] of Object.entries(overrides)) {
    if (!result.some(([existing]) => existing === key)) result.push([key, value]);
  }
  return result.filter(([key]) => overrides[key] !== null);
};

/** A host: application directory, deployed image marker, live Compose file, fakes and an empty TMPDIR. */
function host({ fakeStat = true, image = `${IMAGE}\n` } = {}) {
  const root = join(tmpdir(), `slm-bootstrap-wrapper-${randomUUID()}`);
  fixtures.push(root);
  mkdirSync(root);
  const world = {
    root,
    app: join(root, 'app'),
    bin: join(root, 'bin'),
    log: join(root, 'log'),
    tmp: join(root, 'tmp'),
    config: join(root, 'app', '.env.bootstrap'),
  };
  for (const directory of [world.app, join(world.app, 'releases'), world.bin, world.log, world.tmp]) {
    mkdirSync(directory);
  }
  writeFileSync(join(world.app, 'docker-compose.prod.yml'), 'name: slm-production # live\n');
  if (image !== null) writeFileSync(join(world.app, 'releases', 'current-image'), image);
  writeFileSync(join(world.bin, 'docker'), FAKE_DOCKER);
  chmodSync(join(world.bin, 'docker'), 0o755);
  if (fakeStat) {
    world.bashEnv = join(world.root, 'fake-stat.sh');
    writeFileSync(world.bashEnv, FAKE_STAT_FUNCTION);
  }
  writeFileSync(world.config, text(DEFAULT_SETTINGS));
  chmodSync(world.config, 0o600);
  return world;
}

const callFiles = (world) => readdirSync(world.log).filter((name) => /^call-\d+\.argv$/.test(name));
const slurp = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : undefined);

function calls(world) {
  return callFiles(world).map((_, index) => {
    const base = join(world.log, `call-${index + 1}`);
    return {
      argv: slurp(`${base}.argv`).split('\0').slice(0, -1),
      image: slurp(`${base}.image`),
      environment: slurp(`${base}.env`),
      stdin: slurp(`${base}.stdin`),
    };
  });
}

function run(world, { args, env = {}, shell = [], input } = {}) {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (name.startsWith('BOOTSTRAP_') || name === 'API_IMAGE' || name === 'SHELLOPTS') delete environment[name];
  }
  const result = spawnSync(
    bash.executable,
    [
      ...shell,
      bash.path(SCRIPT),
      ...(args ?? ['--app-dir', bash.path(world.app), '--config', bash.path(world.config)]),
    ],
    {
      encoding: 'utf8',
      input,
      env: {
        ...environment,
        PATH: `${world.bin}${delimiter}${process.env.PATH}`,
        TMPDIR: bash.path(world.tmp),
        FAKE_LOG: bash.path(world.log),
        ...(world.bashEnv ? { BASH_ENV: bash.path(world.bashEnv) } : {}),
        ...env,
      },
    },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    output: `${result.stdout}${result.stderr}`,
  };
}

const writeConfig = (world, content) => {
  writeFileSync(world.config, content);
  chmodSync(world.config, 0o600);
};

/** Everything the wrapper prints and everything a refusal leaves behind must carry no value of the file. */
function assertNoPrivateWord(result) {
  for (const word of PRIVATE_WORDS)
    assert.ok(!result.output.includes(word), `the output carries a private value: ${word}`);
}

function assertRefusedBeforeDocker(world, result, pattern) {
  assert.equal(result.status, 3, result.output);
  assert.match(result.output, pattern);
  assert.match(result.output, /not started/i);
  assert.deepEqual(callFiles(world), [], 'Docker was started');
  assertNoPrivateWord(result);
}

const COMPOSE = (world) => [
  'compose',
  '--project-directory',
  bash.path(world.app),
  '-f',
  `${bash.path(world.app)}/docker-compose.prod.yml`,
  'run',
  '--rm',
  '--no-deps',
  '-T',
  'api',
  'node',
  'dist/installation-cli.js',
];

const INSTALL_ARGUMENTS = [
  '--password-stdin',
  '--timezone=Asia/Ho_Chi_Minh',
  `--organization-name=${ORGANIZATION}`,
  '--department-code=IT',
  '--department-name=Phòng Công nghệ Thông tin',
  '--admin-code=SA001',
  '--admin-name=Nguyễn Văn Quản Trị',
  `--admin-email=${ADMIN_EMAIL}`,
  '--admin-hire-date=2026-01-05',
  '--operator-reference=CHG-2026-1028',
  '--environment=SHARED',
];

describe('bootstrap-installation.sh: one explicit run from the private file', () => {
  it('is valid bash', () => {
    const result = spawnSync(bash.executable, ['-n', bash.path(SCRIPT)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });

  it('checks the image once with --help, then runs the installation with each setting as one --name=value token', () => {
    const world = host();

    const result = run(world);

    assert.equal(result.status, 0, result.output);
    const [help, install, ...rest] = calls(world);
    assert.deepEqual(rest, []);
    assert.deepEqual(help.argv, [...COMPOSE(world), '--help']);
    assert.deepEqual(install.argv, [...COMPOSE(world), ...INSTALL_ARGUMENTS]);
    assertNoPrivateWord(result);
  });

  it('passes the optional settings when set, and leaves them out when empty or absent', () => {
    const world = host();
    writeConfig(
      world,
      text(
        withSettings({
          BOOTSTRAP_CURRENCY: 'USD',
          BOOTSTRAP_LOGIN_EMAIL: 'sign.in@example.test',
          BOOTSTRAP_ADMIN_TYPE: 'CONTRACTOR',
        }),
      ),
    );
    const set = run(world);
    assert.equal(set.status, 0, set.output);
    const argv = calls(world)[1].argv.slice(COMPOSE(world).length);
    assert.ok(argv.includes('--currency=USD'));
    assert.ok(argv.includes('--login-email=sign.in@example.test'));
    assert.ok(argv.includes('--admin-type=CONTRACTOR'));

    const emptyWorld = host();
    writeConfig(emptyWorld, text(withSettings({ BOOTSTRAP_CURRENCY: '', BOOTSTRAP_LOGIN_EMAIL: '' })));
    const empty = run(emptyWorld);
    assert.equal(empty.status, 0, empty.output);
    assert.deepEqual(calls(emptyWorld)[1].argv.slice(COMPOSE(emptyWorld).length), INSTALL_ARGUMENTS);
  });

  it('selects the exact deployed image of releases/current-image for both runs, whatever API_IMAGE the caller exports', () => {
    const world = host();

    const result = run(world, { env: { API_IMAGE: 'ghcr.io/example/slm-api:latest' } });

    assert.equal(result.status, 0, result.output);
    assert.deepEqual(
      calls(world).map((call) => call.image),
      [IMAGE, IMAGE],
    );
  });

  it('sends the password on standard input only: no argument, no environment, no output, no file left behind', () => {
    const world = host();
    const before = readdirSync(world.app, { recursive: true }).sort();
    const configBefore = readFileSync(world.config);

    const result = run(world, { env: { BOOTSTRAP_ADMIN_PASSWORD: 'caller-exported-other-secret' } });

    assert.equal(result.status, 0, result.output);
    const [help, install] = calls(world);
    assert.equal(install.stdin, `${PASSWORD}\n`);
    assert.equal(help.stdin, undefined, 'the --help run was given a password');
    for (const call of [help, install]) {
      assert.ok(!call.argv.join('\n').includes(CANARY), 'the password is in an argument');
      assert.ok(!call.environment.includes(CANARY), 'the password is in the environment');
      assert.ok(!call.environment.includes('BOOTSTRAP_'), 'a BOOTSTRAP_ variable was forwarded to Docker');
      assert.ok(!call.environment.includes('caller-exported-other-secret'));
    }
    assertNoPrivateWord(result);
    assert.deepEqual(readdirSync(world.tmp), [], 'a temporary file was left in TMPDIR');
    assert.deepEqual(readdirSync(world.app, { recursive: true }).sort(), before, 'the application directory changed');
    assert.deepEqual(readFileSync(world.config), configBefore, 'the configuration file was modified');
  });

  it('sends the password byte for byte — spaces, quotes, dollar signs, backslashes, hash, non-ASCII — plus one line feed', () => {
    const tricky = ['  $HOME `id` "q" \'s\' \\n #x = ; & * éß密  ', ' leading', 'trailing ', '\\\\', "a'b", 'a"b'];
    for (const password of tricky) {
      const world = host();
      writeConfig(world, text(withSettings({ BOOTSTRAP_ADMIN_PASSWORD: password })));

      const result = run(world);

      assert.equal(result.status, 0, result.output);
      assert.equal(calls(world)[1].stdin, `${password}\n`, `password ${JSON.stringify(password)}`);
    }
  });

  it('removes only one pair of outer quotes of a password, so a password with edge spaces or quotes can be written exactly', () => {
    const cases = [
      ["'  spaced out  '", '  spaced out  '],
      ['"  spaced out  "', '  spaced out  '],
      ['\'"quoted"\'', '"quoted"'],
      ['"\'single\'"', "'single'"],
      ["'$HOME and `id`'", '$HOME and `id`'],
      ["''", null],
    ];
    for (const [written, sent] of cases) {
      const world = host();
      writeConfig(world, text(withSettings({ BOOTSTRAP_ADMIN_PASSWORD: written })));

      const result = run(world);

      if (sent === null) {
        assertRefusedBeforeDocker(world, result, /BOOTSTRAP_ADMIN_PASSWORD/);
      } else {
        assert.equal(result.status, 0, result.output);
        assert.equal(calls(world)[1].stdin, `${sent}\n`, written);
      }
    }
  });

  it('asks Docker for nothing but `run` of the api service of the live Compose file: no down, volume, prune, exec, migrate or reset', () => {
    const world = host();

    run(world);

    for (const call of calls(world)) {
      assert.deepEqual(call.argv.slice(0, COMPOSE(world).length), COMPOSE(world));
      assert.ok(
        !call.argv.some((argument) => /^(down|exec|rm|prune|volume|system|migrate|build|up|stop|kill)$/.test(argument)),
      );
      assert.ok(!call.argv.some((argument) => /^-v$|--volumes|--env-file|^-e$|^--env$/.test(argument)));
    }
  });
});

describe('bootstrap-installation.sh: the file is data, never code', () => {
  const MARK = 'EXECUTED';
  const hostile = [
    ['command substitution', '$(touch "$MARK")'],
    ['backticks', '`touch "$MARK"`'],
    ['a command after a semicolon', 'x; touch "$MARK"'],
    ['a pipe and background', 'x | touch "$MARK" & true'],
    ['a parameter expansion', '${HOME}/$HOME/${PATH:0:3}'],
    ['a tilde and glob', '~ * ? [a-z]*'],
    ['backslashes', 'a\\nb\\\\c\\$d'],
    ['quotes inside', 'it\'s a "name"'],
    ['a hash, an equals sign and a comment-looking tail', 'a # not a comment = b'],
    ['leading and trailing spaces', '   padded   '],
    ['Unicode', 'Tên đầy đủ 密码 😀'],
    ['a value that is an option name', '--help'],
    ['a value that starts with a dash', '-Acme'],
  ];

  for (const [name, value] of hostile) {
    it(`passes ${name} to the installation as one literal argument and executes nothing`, () => {
      const world = host();
      const mark = join(world.app, MARK);
      writeConfig(
        world,
        text(withSettings({ BOOTSTRAP_ORGANIZATION_NAME: value.replaceAll('"$MARK"', `"${bash.path(mark)}"`) })),
      );

      const result = run(world);

      assert.equal(result.status, 0, result.output);
      assert.equal(existsSync(mark), false, 'a command in the file was executed');
      const expected = value.replaceAll('"$MARK"', `"${bash.path(mark)}"`);
      const install = calls(world)[1].argv.slice(COMPOSE(world).length);
      assert.ok(install.includes(`--organization-name=${expected}`), JSON.stringify(install));
      assert.equal(calls(world)[0].argv.filter((argument) => argument === '--help').length, 1);
      assert.equal(install.filter((argument) => argument === '--help').length, 0);
    });
  }

  it('strips exactly one pair of outer quotes of a value and expands nothing inside them', () => {
    const world = host();
    writeConfig(
      world,
      text(
        withSettings({
          BOOTSTRAP_ORGANIZATION_NAME: '"  Acme $HOME `id`  "',
          BOOTSTRAP_DEPARTMENT_NAME: '\'It’s "quoted"\'',
        }),
      ),
    );

    const result = run(world);

    assert.equal(result.status, 0, result.output);
    const install = calls(world)[1].argv;
    assert.ok(install.includes('--organization-name=  Acme $HOME `id`  '));
    assert.ok(install.includes('--department-name=It’s "quoted"'));
  });

  it('refuses a line whose name is code, without executing it or printing the line', () => {
    const world = host();
    const mark = join(world.app, MARK);
    writeConfig(world, `${text(DEFAULT_SETTINGS)}$(touch "${bash.path(mark)}")=1\n`);

    const result = run(world);

    assertRefusedBeforeDocker(world, result, /line 11/);
    assert.equal(existsSync(mark), false);
    assert.ok(!result.output.includes('touch'));
  });

  it('ignores blank lines and whole-line comments, and nothing else', () => {
    const world = host();
    writeConfig(world, `# a comment with = and $(touch x)\n\n   \n${text(DEFAULT_SETTINGS)}\n# trailing comment\n`);

    const result = run(world);

    assert.equal(result.status, 0, result.output);
    assert.deepEqual(calls(world)[1].argv.slice(COMPOSE(world).length), INSTALL_ARGUMENTS);
  });

  it('reads a last line that has no newline', () => {
    const world = host();
    writeConfig(world, text(DEFAULT_SETTINGS).slice(0, -1));

    const result = run(world);

    assert.equal(result.status, 0, result.output);
    assert.equal(calls(world)[1].stdin, `${PASSWORD}\n`);
  });
});

describe('bootstrap-installation.sh: refuses before Docker is started', () => {
  it('needs both explicit paths, absolute, and nothing else as arguments — a password is never an argument', () => {
    const world = host();
    const app = bash.path(world.app);
    const config = bash.path(world.config);
    const cases = [
      [[], /--app-dir/],
      [['--app-dir', app], /--config/],
      [['--config', config], /--app-dir/],
      [['--app-dir', 'relative/dir', '--config', config], /absolute/],
      [['--app-dir', app, '--config', 'relative.env'], /absolute/],
      [['--app-dir', `${app}/missing`, '--config', config], /application directory/i],
      [['--app-dir', app, '--config', `${app}/missing.env`], /configuration file/i],
      [['--app-dir', app, '--config', config, `--password=${CANARY}`], /unknown argument/i],
      [['--app-dir', app, '--config', config, '--password', CANARY], /unknown argument/i],
    ];
    for (const [args, pattern] of cases) {
      assertRefusedBeforeDocker(world, run(world, { args }), pattern);
    }
  });

  it('prints its usage for --help and exits 0 without Docker', () => {
    const world = host();

    const result = run(world, { args: ['--help'] });

    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /--app-dir/);
    assert.match(result.stdout, /\.env\.bootstrap/);
    assert.deepEqual(callFiles(world), []);
  });

  it('refuses when the live Compose file is not there', () => {
    const world = host();
    rmSync(join(world.app, 'docker-compose.prod.yml'));

    assertRefusedBeforeDocker(world, run(world), /docker-compose\.prod\.yml/);
  });

  for (const key of REQUIRED) {
    it(`refuses a configuration without ${key}, naming only the setting`, () => {
      const world = host();
      writeConfig(world, text(withSettings({ [key]: null })));

      assertRefusedBeforeDocker(world, run(world), new RegExp(`${key}.*(missing|required)`, 'i'));
    });

    it(`refuses an empty ${key}`, () => {
      const world = host();
      writeConfig(world, text(withSettings({ [key]: '' })));

      assertRefusedBeforeDocker(world, run(world), new RegExp(`${key}.*(empty|required)`, 'i'));
    });
  }

  it('does not take the password from the caller environment or from anywhere but the file', () => {
    const world = host();
    writeConfig(world, text(withSettings({ BOOTSTRAP_ADMIN_PASSWORD: null })));

    const result = run(world, { env: { BOOTSTRAP_ADMIN_PASSWORD: 'caller-exported-other-secret' } });

    assertRefusedBeforeDocker(world, result, /BOOTSTRAP_ADMIN_PASSWORD/);
    assert.ok(!result.output.includes('caller-exported-other-secret'));
  });

  it('does not trim the password: a password of spaces is sent as it is', () => {
    const world = host();
    writeConfig(world, text(withSettings({ BOOTSTRAP_ADMIN_PASSWORD: '            ' })));

    const result = run(world);

    assert.equal(result.status, 0, result.output);
    assert.equal(calls(world)[1].stdin, '            \n');
  });

  const malformed = [
    ['an unknown setting', 'BOOTSTRAP_ENVIRONMENT=LOCAL_TEST', /line 11.*unknown/i],
    ['the removed shell-style export', 'export BOOTSTRAP_ADMIN_CODE=X', /line 11.*unknown/i],
    ['a name with spaces around the equals sign', 'BOOTSTRAP_ADMIN_CODE = X', /line 11.*unknown/i],
    ['a lowercase name', 'bootstrap_admin_code=X', /line 11.*unknown/i],
    ['a line without an equals sign', 'hunter2-not-a-setting', /line 11.*KEY=VALUE/i],
    ['a duplicate setting', 'BOOTSTRAP_ADMIN_CODE=SA002', /line 11.*duplicate/i],
    ['a duplicate password', 'BOOTSTRAP_ADMIN_PASSWORD=another-one', /line 11.*duplicate/i],
    ['an unbalanced opening quote', "BOOTSTRAP_LOGIN_EMAIL='x@example.test", /line 11.*quote/i],
    ['a closing quote with no opening one (ordinary text for a raw value)', 'BOOTSTRAP_ADMIN_TYPE=INTERN"', null],
    ['a lone quote', 'BOOTSTRAP_CURRENCY="', /line 11.*quote/i],
    ['mismatched quotes', 'BOOTSTRAP_CURRENCY="USD\'', /line 11.*quote/i],
  ];
  for (const [name, line, pattern] of malformed) {
    it(`refuses ${name} by line number, without echoing it`, () => {
      const world = host();
      writeConfig(world, `${text(DEFAULT_SETTINGS)}${line}\n`);

      const result = run(world);

      if (pattern === null) {
        assert.equal(result.status, 0, result.output);
        return;
      }
      assertRefusedBeforeDocker(world, result, pattern);
      assert.ok(!result.output.includes(line), 'the offending line was echoed');
      assert.ok(!result.output.includes('hunter2'));
    });
  }

  it('refuses a file with Windows line endings instead of silently putting a carriage return in a value', () => {
    const world = host();
    writeConfig(world, text(DEFAULT_SETTINGS).replaceAll('\n', '\r\n'));

    assertRefusedBeforeDocker(world, run(world), /carriage return|CRLF/i);
  });

  it('refuses a file with a NUL byte', () => {
    const world = host();
    writeConfig(
      world,
      Buffer.concat([Buffer.from(text(DEFAULT_SETTINGS)), Buffer.from('BOOTSTRAP_CURRENCY=V\u0000ND\n')]),
    );

    assertRefusedBeforeDocker(world, run(world), /NUL/i);
  });

  const modes = [
    ['644', /chmod 600/],
    ['640', /chmod 600/],
    ['604', /chmod 600/],
    ['666', /chmod 600/],
    ['777', /chmod 600/],
  ];
  for (const [mode, pattern] of modes) {
    it(`refuses a configuration file of mode ${mode}: the password must be readable by its owner only`, () => {
      const world = host();

      assertRefusedBeforeDocker(world, run(world, { env: { FAKE_STAT_MODE: mode } }), pattern);
    });
  }

  for (const mode of ['600', '400', '700', '0600']) {
    it(`accepts mode ${mode}`, () => {
      const world = host();

      const result = run(world, { env: { FAKE_STAT_MODE: mode } });

      assert.equal(result.status, 0, result.output);
    });
  }

  it('refuses a configuration file owned by another user', () => {
    const world = host();

    assertRefusedBeforeDocker(world, run(world, { env: { FAKE_STAT_UID: '4242424' } }), /owned by/i);
  });

  it('refuses a configuration file that is a symbolic link', (context) => {
    const world = host();
    const real = join(world.root, 'real.env');
    writeFileSync(real, text(DEFAULT_SETTINGS));
    chmodSync(real, 0o600);
    rmSync(world.config);
    try {
      symlinkSync(real, world.config);
    } catch {
      context.skip('this platform cannot create a symbolic link here');
      return;
    }
    if (process.platform === 'win32') {
      context.skip('Git Bash does not report a Windows symbolic link as one');
      return;
    }

    assertRefusedBeforeDocker(world, run(world), /symbolic link/i);
  });

  it('with the real stat (Linux): accepts a file of mode 600 and refuses 640', (context) => {
    if (process.platform === 'win32') {
      context.skip('Git for Windows keeps no POSIX modes');
      return;
    }
    const world = host({ fakeStat: false });
    assert.equal(run(world).status, 0);

    const loose = host({ fakeStat: false });
    chmodSync(loose.config, 0o640);
    assertRefusedBeforeDocker(loose, run(loose), /chmod 600/);
  });

  describe('the deployed image', () => {
    const refusedImages = [
      ['a missing releases/current-image', null, /current-image/],
      ['an empty file', '', /current-image/],
      ['a moving tag', 'ghcr.io/example/slm-api:latest\n', /immutable|commit/i],
      ['no tag', 'ghcr.io/example/slm-api\n', /immutable|commit/i],
      ['a digest', `ghcr.io/example/slm-api@sha256:${'a'.repeat(64)}\n`, /immutable|commit/i],
      ['an uppercase name', `GHCR.io/Example/slm-api:${SHA}\n`, /immutable|commit/i],
      ['a trailing word', `ghcr.io/example/slm-api:${SHA} extra\n`, /immutable|commit/i],
      ['two lines', `${IMAGE}\n${IMAGE}\n`, /one line/i],
      ['a carriage return', `${IMAGE}\r\n`, /immutable|commit/i],
      ['an option-looking name', `--rm:${SHA}\n`, /immutable|commit/i],
    ];
    for (const [name, content, pattern] of refusedImages) {
      it(`refuses ${name}`, () => {
        const world = host({ image: content });

        const result = run(world, { env: { API_IMAGE: IMAGE } });

        assertRefusedBeforeDocker(world, result, pattern);
      });
    }

    it('accepts the short commit tag the deploy script accepts, without a trailing newline', () => {
      const world = host({ image: 'ghcr.io/example/slm-api:0123abc' });

      const result = run(world);

      assert.equal(result.status, 0, result.output);
      assert.equal(calls(world)[1].image, 'ghcr.io/example/slm-api:0123abc');
    });

    it('stops at the image check when the image has no --password-stdin mode, and never sends it a password', () => {
      const world = host();
      const legacy = 'Usage: pnpm ops:bootstrap [options]  the password is typed at a hidden prompt';

      const result = run(world, { env: { FAKE_USAGE: legacy } });

      assert.equal(result.status, 3, result.output);
      assert.match(result.output, /--password-stdin/);
      assert.match(result.output, new RegExp(IMAGE.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')));
      assert.match(result.output, /deploy|build/i);
      assert.match(result.output, /not started|nothing was sent/i);
      assert.equal(calls(world).length, 1, 'only the --help run may happen');
      assert.equal(calls(world)[0].stdin, undefined);
      assertNoPrivateWord(result);
    });

    it('stops when the --help run itself fails, and says it did not start the installation', () => {
      const world = host();

      const result = run(world, { env: { FAKE_HELP_EXIT: '125' } });

      assert.equal(result.status, 3, result.output);
      assert.match(result.output, /--help/);
      assert.equal(calls(world).length, 1);
      assertNoPrivateWord(result);
    });
  });
});

describe('bootstrap-installation.sh: the exit codes are the installation command’s', () => {
  it('exits 0 when installed, and points at inspect, preflight and the file the password stays in', () => {
    const world = host();

    const result = run(world);

    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /inspect-cli\.js/);
    assert.match(result.output, /migration-preflight-cli\.js/);
    assert.match(result.output, /\.env\.bootstrap/);
    assertNoPrivateWord(result);
  });

  it('exits 2 when already installed, saying nothing was changed', () => {
    const world = host();

    const result = run(world, { env: { FAKE_INSTALL_EXIT: '2' } });

    assert.equal(result.status, 2, result.output);
    assert.match(result.output, /already installed/i);
    assertNoPrivateWord(result);
  });

  it('exits 1 on a failure and tells the operator to inspect the installation state: a lost COMMIT reply can hide an install', () => {
    const world = host();

    const result = run(world, { env: { FAKE_INSTALL_EXIT: '1' } });

    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /inspect/i);
    assert.match(result.output, /does not prove|COMMIT/i);
    assert.match(result.output, /inspect-cli\.js/);
    assertNoPrivateWord(result);
  });

  for (const code of [130, 125, 137]) {
    it(`passes exit ${code} through unchanged`, () => {
      const world = host();

      const result = run(world, { env: { FAKE_INSTALL_EXIT: String(code) } });

      assert.equal(result.status, code, result.output);
      assertNoPrivateWord(result);
    });
  }

  it('never runs the installation twice, and runs no cleanup or reset after a failure', () => {
    const world = host();

    run(world, { env: { FAKE_INSTALL_EXIT: '1' } });

    assert.equal(calls(world).length, 2);
    assert.equal(readFileSync(world.config, 'utf8'), text(DEFAULT_SETTINGS));
  });
});

describe('bootstrap-installation.sh: the secret stays out of traces and failure output', () => {
  it('prints no trace of the file or the password under bash -x', () => {
    const world = host();

    const result = run(world, { shell: ['-x'] });

    assert.equal(result.status, 0, result.output);
    assertNoPrivateWord(result);
  });

  it('prints no trace of the file or the password when the caller turned tracing on through SHELLOPTS', () => {
    const world = host();

    const result = run(world, { env: { SHELLOPTS: 'xtrace' } });

    assert.equal(result.status, 0, result.output);
    assertNoPrivateWord(result);
  });

  it('prints no value of the file on any refusal or failure path', () => {
    const paths = [
      (world) => run(world, { env: { FAKE_STAT_MODE: '644' } }),
      (world) => run(world, { env: { FAKE_INSTALL_EXIT: '1' } }),
      (world) => run(world, { env: { FAKE_USAGE: 'legacy' } }),
      (world) => run(world, { env: { FAKE_HELP_EXIT: '1' } }),
      (world) => {
        writeConfig(world, `${text(DEFAULT_SETTINGS)}BOOTSTRAP_ADMIN_CODE=dup\n`);
        return run(world);
      },
      (world) => {
        writeConfig(world, text(withSettings({ BOOTSTRAP_ADMIN_NAME: null })));
        return run(world);
      },
    ];
    for (const attempt of paths) {
      const world = host();
      assertNoPrivateWord(attempt(world));
    }
  });
});

describe('the template and the ignore rules', () => {
  it('lists every setting the wrapper reads, each with an empty value and no default credential', () => {
    const content = readFileSync(TEMPLATE, 'utf8');
    const assignments = content.split(/\r?\n/).filter((line) => /^BOOTSTRAP_[A-Z_]+=/.test(line));

    assert.deepEqual(assignments.map((line) => line.split('=')[0]).sort(), [...REQUIRED, ...OPTIONAL].sort());
    for (const line of assignments) assert.match(line, /^BOOTSTRAP_[A-Z_]+=$/, 'a template value is not empty');
    assert.match(content, /^BOOTSTRAP_ADMIN_PASSWORD=$/m);
  });

  it('is accepted by the parser: copied unfilled, the wrapper reports the first required setting empty, not a syntax error', () => {
    const world = host();
    writeConfig(world, readFileSync(TEMPLATE, 'utf8'));

    assertRefusedBeforeDocker(world, run(world), /BOOTSTRAP_TIMEZONE.*(empty|required)/i);
  });

  it('keeps the real file out of Git and out of the image, and the empty template in', () => {
    const gitignore = readFileSync(join(REPOSITORY, '.gitignore'), 'utf8').split(/\r?\n/);
    const dockerignore = readFileSync(join(REPOSITORY, '.dockerignore'), 'utf8').split(/\r?\n/);

    assert.ok(gitignore.includes('.env.*'), '.env.bootstrap is no longer ignored');
    assert.ok(gitignore.includes('!.env.example'));
    assert.ok(gitignore.includes('!.env.bootstrap.example'), 'the template is not excepted from the ignore rule');
    assert.ok(!gitignore.includes('!.env.bootstrap'));
    assert.ok(dockerignore.includes('.env.*'), '.env.bootstrap could enter the image build context');
  });
});

describe('bootstrap-installation.sh: source review guards', () => {
  const source = readFileSync(SCRIPT, 'utf8');
  const code = source
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

  it('never evaluates, sources or traces, and never gives Docker the password through a flag or a file', () => {
    assert.doesNotMatch(code, /\beval\b/);
    assert.doesNotMatch(code, /^\s*(source|\.)\s/m);
    assert.doesNotMatch(code, /\bset\s+-[a-zA-Z]*x/);
    assert.doesNotMatch(code, /--env-file|\bdocker\s+run\b|<<<|mktemp|\btee\b|\/tmp\b/);
    assert.match(code, /^set \+x$/m);
    assert.match(code, /builtin printf/);
    assert.match(code, /API_IMAGE=/);
  });
});
