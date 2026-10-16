import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { classifyJest, createDisposableCopy, MUTANTS, runTargetedMutations } from './targeted-mutation.mjs';

const green = {
  exitCode: 0,
  report: { success: true, numPassedTests: 1, numFailedTests: 0, numRuntimeErrorTestSuites: 0, testResults: [] },
};
const assertion = {
  exitCode: 1,
  report: {
    success: false,
    numFailedTests: 1,
    numRuntimeErrorTestSuites: 0,
    testResults: [{ assertionResults: [{ status: 'failed', failureDetails: [{ matcherResult: { pass: false } }] }] }],
  },
};
const setup = {
  exitCode: 1,
  report: {
    success: false,
    numFailedTests: 1,
    numRuntimeErrorTestSuites: 0,
    testResults: [
      {
        assertionResults: [
          { status: 'failed', failureDetails: [{}], failureMessages: ['beforeAll failed: cannot provision database'] },
        ],
      },
    ],
  },
};

async function fixture(work) {
  const root = await mkdtemp(path.join(tmpdir(), 'slm-mutation-runner-test-'));
  try {
    for (const mutant of MUTANTS) {
      const target = path.join(root, mutant.file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, `// fixture\n${mutant.before}\n`);
    }
    await writeFile(path.join(root, 'package.json'), '{}');
    await writeFile(path.join(root, '.env'), 'MUST NOT COPY');
    await writeFile(path.join(root, 'src', '.env.local'), 'MUST NOT COPY');
    await work(root);
  } finally {
    const target = path.resolve(root);
    assert.equal(path.dirname(target), path.resolve(tmpdir()));
    assert.ok(path.basename(target).startsWith('slm-mutation-runner-test-'));
    await rm(target, { recursive: true, force: true });
  }
}

test('exit 1 requires a real assertion; setup errors, absent reports and crashes are never killed', () => {
  assert.equal(classifyJest(green), 'SURVIVED');
  assert.equal(classifyJest(assertion), 'KILLED');
  assert.equal(classifyJest(setup), 'SETUP_ERROR');
  assert.equal(classifyJest({ exitCode: 1 }), 'SETUP_ERROR');
  assert.equal(classifyJest({ ...assertion, exitCode: 2 }), 'SETUP_ERROR');
  assert.equal(classifyJest({ ...assertion, signal: 'SIGTERM' }), 'SETUP_ERROR');
  assert.equal(classifyJest({ ...assertion, timedOut: true }), 'SETUP_ERROR');
  assert.equal(classifyJest({ ...green, signal: 'SIGKILL' }), 'SETUP_ERROR');
  assert.equal(
    classifyJest({ ...assertion, report: { ...assertion.report, numRuntimeErrorTestSuites: 1 } }),
    'SETUP_ERROR',
  );
});

test('copy excludes environment files, keeps owner bytes and removes only its own temporary tree', async () =>
  fixture(async (ownerRoot) => {
    const copy = await createDisposableCopy(ownerRoot, { linkNodeModules: false });
    try {
      await assert.rejects(readFile(path.join(copy.root, '.env')), { code: 'ENOENT' });
      await assert.rejects(readFile(path.join(copy.root, 'src', '.env.local')), { code: 'ENOENT' });
      const mutant = MUTANTS[0];
      await writeFile(path.join(copy.root, mutant.file), 'changed');
      assert.equal(await readFile(path.join(ownerRoot, mutant.file), 'utf8'), `// fixture\n${mutant.before}\n`);
    } finally {
      await copy.cleanup();
    }
    await assert.rejects(readFile(path.join(copy.root, 'package.json')), { code: 'ENOENT' });
  }));

test('all three controls run before any mutation; a failed control applies nothing', async () =>
  fixture(async (ownerRoot) => {
    let calls = 0;
    const result = await runTargetedMutations({
      ownerRoot,
      linkNodeModules: false,
      execute: async ({ cwd }) => {
        calls += 1;
        for (const mutant of MUTANTS)
          assert.ok((await readFile(path.join(cwd, mutant.file), 'utf8')).includes(mutant.before));
        return calls === 2 ? setup : green;
      },
    });
    assert.equal(calls, 2);
    assert.equal(result.status, 'CONTROL_FAILED');
    assert.equal(result.results.length, 0);
    assert.equal(result.ownerUnchanged, true);
    assert.equal(result.cleaned, true);
  }));

test('exactly one mutant at a time; assertion failure kills and restores byte-for-byte before next mutant', async () =>
  fixture(async (ownerRoot) => {
    let calls = 0;
    const result = await runTargetedMutations({
      ownerRoot,
      linkNodeModules: false,
      execute: async ({ cwd, phase, mutant }) => {
        calls += 1;
        for (const candidate of MUTANTS) {
          const actual = await readFile(path.join(cwd, candidate.file), 'utf8');
          assert.equal(
            actual,
            `// fixture\n${phase === 'mutant' && candidate.id === mutant.id ? candidate.after : candidate.before}\n`,
          );
        }
        return phase === 'control' ? green : assertion;
      },
    });
    assert.equal(calls, 6);
    assert.deepEqual(
      result.results.map((entry) => entry.status),
      ['KILLED', 'KILLED', 'KILLED'],
    );
    for (const entry of result.results) assert.equal(entry.beforeHash, entry.restoredHash);
    assert.equal(result.ownerUnchanged, true);
    assert.equal(result.cleaned, true);
  }));

test('test process crash or setup failure still restores and cannot count as killed', async () =>
  fixture(async (ownerRoot) => {
    for (const failure of [setup, new Error('process crash')]) {
      const result = await runTargetedMutations({
        ownerRoot,
        linkNodeModules: false,
        execute: async ({ phase }) => {
          if (phase === 'control') return green;
          if (failure instanceof Error) throw failure;
          return failure;
        },
      });
      assert.deepEqual(
        result.results.map((entry) => entry.status),
        ['SETUP_ERROR', 'SETUP_ERROR', 'SETUP_ERROR'],
      );
      for (const entry of result.results) assert.equal(entry.beforeHash, entry.restoredHash);
      assert.equal(result.ownerUnchanged, true);
      assert.equal(result.cleaned, true);
    }
  }));

test('an actually terminated test command restores source and is SETUP_ERROR', async () =>
  fixture(async (ownerRoot) => {
    const result = await runTargetedMutations({
      ownerRoot,
      linkNodeModules: false,
      execute: async ({ cwd, phase }) => {
        if (phase === 'control') return green;
        return new Promise((resolve, reject) => {
          const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { cwd, stdio: 'ignore' });
          child.once('error', reject);
          child.once('spawn', () => child.kill('SIGTERM'));
          child.once('close', (exitCode, signal) => resolve({ exitCode, signal }));
        });
      },
    });
    assert.deepEqual(
      result.results.map((entry) => entry.status),
      ['SETUP_ERROR', 'SETUP_ERROR', 'SETUP_ERROR'],
    );
    for (const entry of result.results) assert.equal(entry.beforeHash, entry.restoredHash);
    assert.equal(result.ownerUnchanged, true);
    assert.equal(result.cleaned, true);
  }));

test('surviving tests are SURVIVED; missing or duplicate replacement is UNAPPLIED', async () =>
  fixture(async (ownerRoot) => {
    const target = path.join(ownerRoot, MUTANTS[1].file);
    await writeFile(target, `${MUTANTS[1].before}\n${MUTANTS[1].before}`);
    await writeFile(path.join(ownerRoot, MUTANTS[2].file), 'target removed');
    const result = await runTargetedMutations({ ownerRoot, linkNodeModules: false, execute: async () => green });
    assert.deepEqual(
      result.results.map((entry) => entry.status),
      ['SURVIVED', 'UNAPPLIED', 'UNAPPLIED'],
    );
    assert.equal(result.ownerUnchanged, true);
  }));

test('restore failure has its own status and never retains KILLED', async () =>
  fixture(async (ownerRoot) => {
    const result = await runTargetedMutations({
      ownerRoot,
      linkNodeModules: false,
      execute: async ({ cwd, phase, mutant }) => {
        if (phase === 'control') return green;
        await rm(path.join(cwd, mutant.file));
        await mkdir(path.join(cwd, mutant.file)); // restoration must fail, even with a genuine assertion result
        return assertion;
      },
    });
    assert.deepEqual(
      result.results.map((entry) => entry.status),
      ['RESTORE_FAILED', 'RESTORE_FAILED', 'RESTORE_FAILED'],
    );
    assert.equal(result.ownerUnchanged, true);
    assert.equal(result.cleaned, true);
  }));
