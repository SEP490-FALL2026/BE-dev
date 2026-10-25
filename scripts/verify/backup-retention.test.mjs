// DB-05 (delivery-gate-hardening): the retention procedure for the pre-migration backups the deploy workflow writes.
// Runs the real script with bash on a temporary `.../backups/postgres` directory; never on a server. On Windows the bash is
// the Git for Windows one, whatever shell started the suite (GATE-RV-01).
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { bashFor } from './git-bash.mjs';

const SCRIPT = resolve(import.meta.dirname, '..', 'ops', 'postgres-backup-retention.sh');
const NOW = '20261022T120000Z';
const NOW_MS = Date.UTC(2026, 9, 22, 12, 0, 0);
const created = [];

/** Resolved once; when it fails, the retention suite reports the setup message once instead of six exit codes. */
const setup = (() => {
  try {
    return { bash: bashFor() };
  } catch (error) {
    return { error };
  }
})();

const stamp = (daysAgo) =>
  new Date(NOW_MS - daysAgo * 86_400_000)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
const backupName = (daysAgo, sha = 'abc1234') => `slm-pre-migrate-${stamp(daysAgo)}-${sha}.dump`;

function backupDirectory(files) {
  const root = mkdtempSync(join(tmpdir(), 'slm-retention-'));
  created.push(root);
  const directory = join(root, 'app', 'backups', 'postgres');
  mkdirSync(directory, { recursive: true });
  for (const name of files) writeFileSync(join(directory, name), 'dump');
  return directory;
}

function retention(directory, ...options) {
  const { bash } = setup;
  const result = spawnSync(bash.executable, [bash.path(SCRIPT), '--dir', bash.path(directory), ...options], {
    encoding: 'utf8',
    env: { ...process.env, RETENTION_NOW: NOW },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

afterEach(() => {
  while (created.length) rmSync(created.pop(), { recursive: true, force: true });
});

describe('bashFor (GATE-RV-01)', () => {
  const GIT_EXEC_PATH = 'C:/Program Files/Git/mingw64/libexec/git-core';
  const GIT_BASH = String.raw`C:\Program Files\Git\bin\bash.exe`;
  const LAUNCHERS = [
    String.raw`C:\Windows\System32\bash.exe`,
    String.raw`C:\Users\dev\AppData\Local\Microsoft\WindowsApps\bash.exe`,
  ];
  // `usr\bin\bash.exe` is Git's too, but started from PowerShell it keeps Windows `sort` ahead of GNU `sort`.
  const GIT_USR_BASH = String.raw`C:\Program Files\Git\usr\bin\bash.exe`;
  const filesOf = (...paths) => {
    const files = new Set(paths);
    return (path) => files.has(path);
  };

  it('on Windows selects bin\\bash.exe of the active Git for Windows, not a WSL launcher or usr\\bin\\bash.exe', () => {
    const bash = bashFor({
      platform: 'win32',
      gitExecPath: () => GIT_EXEC_PATH,
      isFile: filesOf(...LAUNCHERS, GIT_USR_BASH, GIT_BASH),
    });

    assert.equal(bash.executable, GIT_BASH);
    for (const launcher of LAUNCHERS) assert.notEqual(bash.executable, launcher);
  });

  it('on Windows hands the script Git-Bash paths', () => {
    const bash = bashFor({ platform: 'win32', gitExecPath: () => GIT_EXEC_PATH, isFile: filesOf(GIT_BASH) });

    assert.equal(bash.path(String.raw`D:\FPT\repo\scripts\ops\retention.sh`), '/d/FPT/repo/scripts/ops/retention.sh');
    assert.equal(
      bash.path('C:/Users/dev/AppData/Local/Temp/slm-retention-x'),
      '/c/Users/dev/AppData/Local/Temp/slm-retention-x',
    );
  });

  it('elsewhere runs `bash` with native paths and never asks git', () => {
    const bash = bashFor({
      platform: 'linux',
      gitExecPath: () => assert.fail('git is only asked on Windows'),
      isFile: () => assert.fail('no file is checked off Windows'),
    });

    assert.equal(bash.executable, 'bash');
    assert.equal(bash.path('/tmp/slm-retention-x/app/backups/postgres'), '/tmp/slm-retention-x/app/backups/postgres');
  });

  it('fails with one setup message when Git for Windows Bash is missing, even if a WSL launcher exists', () => {
    for (const gitExecPath of [() => undefined, () => '/usr/libexec/git-core', () => GIT_EXEC_PATH]) {
      assert.throws(
        () => bashFor({ platform: 'win32', gitExecPath, isFile: filesOf(...LAUNCHERS, GIT_USR_BASH) }),
        /Git for Windows Bash not found/,
      );
    }
  });
});

describe('postgres-backup-retention.sh', () => {
  if (setup.error) {
    it('runs under Git for Windows Bash on Windows', () => assert.fail(setup.error.message));
    return;
  }

  // 14 backups: the 10 newest are kept whatever their age; of the 4 older ones, all are older than 30 days.
  const ages = [1, 5, 10, 20, 29, 31, 35, 40, 45, 50, 60, 70, 80, 90];
  const backups = ages.map((age) => backupName(age));
  const expired = [60, 70, 80, 90].map((age) => backupName(age));
  const unrelated = [
    'notes.txt',
    `${backupName(200)}.partial`,
    `other-app-${stamp(300)}-abc1234.dump`,
    'slm-pre-migrate-not-a-stamp-abc1234.dump',
  ];

  it('is a dry run by default: lists what it would delete and deletes nothing', () => {
    const directory = backupDirectory([...backups, ...unrelated]);

    const result = retention(directory);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /DRY RUN/);
    for (const name of expired) assert.match(result.stdout, new RegExp(`would delete ${name}`));
    assert.match(result.stdout, /would delete 4 of 14 backups/);
    assert.deepEqual(readdirSync(directory).sort(), [...backups, ...unrelated].sort());
  });

  it('with --apply deletes only backups beyond the 10 newest that are older than 30 days', () => {
    const directory = backupDirectory([...backups, ...unrelated]);

    const result = retention(directory, '--apply');

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /deleted 4 of 14 backups/);
    assert.deepEqual(
      readdirSync(directory).sort(),
      [...backups.filter((name) => !expired.includes(name)), ...unrelated].sort(),
    );
  });

  it('keeps every backup younger than 30 days even beyond the 10 newest', () => {
    const young = Array.from({ length: 13 }, (_, index) => backupName(index + 1));
    const directory = backupDirectory(young);

    const result = retention(directory, '--apply');

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /deleted 0 of 13 backups/);
    assert.equal(readdirSync(directory).length, 13);
  });

  it('keeps the 10 newest backups even when they are all older than 30 days', () => {
    const old = Array.from({ length: 11 }, (_, index) => backupName(100 + index));
    const directory = backupDirectory(old);

    const result = retention(directory, '--apply');

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readdirSync(directory).sort(), old.slice(0, 10).sort());
  });

  it('never touches a file outside the exact name pattern, and says it ignored it', () => {
    const directory = backupDirectory(unrelated);

    const result = retention(directory, '--apply');

    assert.equal(result.status, 0, result.stderr);
    for (const name of unrelated) assert.match(result.stdout, new RegExp(`ignored ${name.replace(/[.*]/g, '\\$&')}`));
    assert.deepEqual(readdirSync(directory).sort(), [...unrelated].sort());
  });

  it('refuses a directory that is not an application backup directory, a relative path, a missing one or no --dir', () => {
    const directory = backupDirectory(backups);
    const elsewhere = join(directory, '..');

    for (const args of [
      ['--dir', setup.bash.path(elsewhere), '--apply'],
      ['--dir', 'backups/postgres', '--apply'],
      ['--dir', setup.bash.path(join(directory, 'missing', 'backups', 'postgres')), '--apply'],
      ['--apply'],
      ['--dir', setup.bash.path(directory), '--keep', '1'],
    ]) {
      const result = spawnSync(setup.bash.executable, [setup.bash.path(SCRIPT), ...args], {
        encoding: 'utf8',
        env: { ...process.env, RETENTION_NOW: NOW },
      });
      assert.equal(result.status, 2, `${args.join(' ')}: ${result.stdout}${result.stderr}`);
    }
    assert.equal(readdirSync(directory).length, backups.length);
    assert.ok(existsSync(directory));
  });
});
