import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Deliberately fixed: this is a small verification command, not a configurable mutation framework.
export const MUTANTS = [
  {
    id: 'n1-disposal',
    file: 'src/infrastructure/database/pg-pool.ts',
    before: 'void this.end().catch(() => undefined);',
    after: 'void Promise.resolve(); // mutant: omit timeout connection disposal',
    probes: [
      { file: 'src/infrastructure/database/pg-pool.spec.ts' },
      {
        config: 'test/config/jest.integration-timing.cjs',
        file: 'test/integration/audit/database-stall.timing-spec.ts',
      },
    ],
  },
  {
    id: 'authorization',
    file: 'src/infrastructure/security/guards/authorization.guard.ts',
    before: 'if (!principal || !required.some((role) => principal.roles.includes(role))) {',
    after: 'if (false) { // mutant: omit authorization check',
    probes: [{ file: 'src/infrastructure/security/guards/access-guards.spec.ts' }],
  },
  {
    id: 'invitation-invalidation',
    file: 'src/modules/identity-access/accounts/app-users/account-invitation.service.ts',
    before: "await this.accounts.revokeTokens(tx, hashes, 'SUPERSEDED', now);",
    after: 'void hashes; // mutant: omit superseded invitation revocation',
    probes: [
      {
        config: 'test/config/jest.integration.cjs',
        file: 'test/integration/identity-access/account-management-http.integration-spec.ts',
        name: 'resending keeps exactly one usable token',
      },
    ],
  },
];

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const excluded = (name) =>
  /^\.env(?:\.|$)/i.test(name) ||
  ['.git', 'node_modules', 'dist', 'coverage', '.models', '.aws', '.codex', '.agents'].includes(name);

async function ownerManifest(ownerRoot) {
  const manifest = new Map();
  const visit = async (relative = '') => {
    for (const entry of await readdir(path.join(ownerRoot, relative), { withFileTypes: true })) {
      if (excluded(entry.name) || entry.isSymbolicLink()) continue;
      const child = path.join(relative, entry.name);
      if (child.startsWith(`src${path.sep}generated${path.sep}`)) continue;
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) manifest.set(child, hash(await readFile(path.join(ownerRoot, child))));
    }
  };
  await visit();
  return manifest;
}

/** A source snapshot of the current tree, including uncommitted fixes. Never reads .env files. */
export async function createDisposableCopy(ownerRoot, { linkNodeModules = true } = {}) {
  ownerRoot = path.resolve(ownerRoot);
  const root = await mkdtemp(path.join(tmpdir(), 'slm-targeted-mutation-'));
  const manifest = new Map();
  const cleanup = async () => {
    const target = path.resolve(root);
    const parent = path.resolve(tmpdir());
    if (
      path.dirname(target) !== parent ||
      !path.basename(target).startsWith('slm-targeted-mutation-') ||
      target === ownerRoot
    ) {
      throw new Error('Refusing cleanup outside the owned temporary copy');
    }
    await rm(target, { recursive: true, force: true });
  };
  try {
    const copy = async (relative = '') => {
      for (const entry of await readdir(path.join(ownerRoot, relative), { withFileTypes: true })) {
        if (excluded(entry.name) || entry.isSymbolicLink()) continue;
        const child = path.join(relative, entry.name);
        const target = path.join(root, child);
        if (entry.isDirectory()) {
          await mkdir(target, { recursive: true });
          await copy(child);
        } else if (entry.isFile()) {
          await copyFile(path.join(ownerRoot, child), target);
          // Generated files are copied for Prisma consumers; they are not owner source evidence.
          if (!child.startsWith(`src${path.sep}generated${path.sep}`))
            manifest.set(child, hash(await readFile(target)));
        }
      }
    };
    await copy();
    if (linkNodeModules) {
      const modules = path.join(ownerRoot, 'node_modules');
      if (!(await lstat(modules)).isDirectory())
        throw new Error('Install development dependencies before mutation verification');
      await symlink(modules, path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    }
    return { root, manifest, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

const realAssertion = (result) =>
  result.failureDetails?.some((detail) => detail && typeof detail.matcherResult === 'object') ||
  // Supertest reports assertion Errors rather than Jest matcherResult, including HTTP status checks.
  result.failureMessages?.some((message) => /expected \d{3} [^\n]*, got \d{3} /i.test(message));

/** Exit 1 alone is never evidence that a mutant was killed (setup and beforeAll can also exit 1). */
export function classifyJest({ exitCode, signal, timedOut, report } = {}) {
  if (signal || timedOut || !report || report.wasInterrupted || report.numRuntimeErrorTestSuites !== 0)
    return 'SETUP_ERROR';
  if (report.testResults?.some((suite) => suite.testExecError)) return 'SETUP_ERROR';
  if (exitCode === 0 && report.success === true && report.numPassedTests > 0 && report.numFailedTests === 0)
    return 'SURVIVED';
  if (exitCode !== 1 || report.numFailedTests < 1) return 'SETUP_ERROR';
  const failed =
    report.testResults?.flatMap((suite) => suite.assertionResults ?? []).filter((entry) => entry.status === 'failed') ??
    [];
  return failed.length > 0 && failed.every(realAssertion) ? 'KILLED' : 'SETUP_ERROR';
}

async function runJest({ cwd, mutant, phase }) {
  const outcomes = [];
  for (let index = 0; index < mutant.probes.length; index += 1) {
    const probe = mutant.probes[index];
    const reportFile = path.join(cwd, `mutation-${phase}-${mutant.id}-${index}.json`);
    const args = [
      path.join(cwd, 'node_modules/jest/bin/jest.js'),
      '--runInBand',
      '--no-cache',
      '--silent',
      '--json',
      '--outputFile',
      reportFile,
    ];
    if (probe.config) args.push('--config', probe.config);
    args.push('--runTestsByPath', probe.file);
    if (probe.name) args.push('--testNamePattern', probe.name);
    const result = await new Promise((resolve) => {
      // No raw child output is retained or printed: connection strings may appear in tool errors.
      const child = spawn(process.execPath, args, { cwd, env: { ...process.env, NODE_ENV: 'test' }, stdio: 'ignore' });
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, 180000);
      child.once('error', () => {
        clearTimeout(timer);
        resolve({ exitCode: null });
      });
      child.once('close', (exitCode, signal) => {
        clearTimeout(timer);
        resolve({ exitCode, signal, timedOut });
      });
    });
    try {
      result.report = JSON.parse(await readFile(reportFile, 'utf8'));
    } catch {
      /* missing/malformed report is setup failure */
    }
    await rm(reportFile, { force: true });
    outcomes.push(result);
    // Failed setup cannot be hidden by an assertion failure in another probe.
    if (classifyJest(result) === 'SETUP_ERROR') break;
  }
  const classes = outcomes.map(classifyJest);
  return {
    classification: classes.includes('SETUP_ERROR')
      ? 'SETUP_ERROR'
      : classes.includes('KILLED')
        ? 'KILLED'
        : 'SURVIVED',
    probes: outcomes.map((outcome, index) => ({
      file: mutant.probes[index].file,
      exitCode: outcome.exitCode,
      status: classes[index],
      passed: outcome.report?.numPassedTests ?? 0,
      failed: outcome.report?.numFailedTests ?? 0,
    })),
  };
}

const classify = (result) => result.classification ?? classifyJest(result);

export async function runTargetedMutations({
  ownerRoot = process.cwd(),
  linkNodeModules = true,
  execute = runJest,
} = {}) {
  let copy;
  const summary = { status: 'SETUP_ERROR', controls: [], results: [], ownerUnchanged: false, cleaned: false };
  try {
    copy = await createDisposableCopy(ownerRoot, { linkNodeModules });
    // Every fixed probe must have a green control before the first source byte is mutated.
    for (const mutant of MUTANTS) {
      const control = await execute({ cwd: copy.root, mutant, phase: 'control' });
      const status = classify(control);
      summary.controls.push({ id: mutant.id, status, probes: control.probes });
      if (status !== 'SURVIVED') {
        summary.status = 'CONTROL_FAILED';
        return summary;
      }
    }
    for (const mutant of MUTANTS) {
      const target = path.join(copy.root, mutant.file);
      const original = await readFile(target);
      const text = original.toString('utf8');
      const result = { id: mutant.id, status: 'UNAPPLIED', beforeHash: hash(original), restoredHash: undefined };
      try {
        const occurrences = text.split(mutant.before).length - 1;
        if (occurrences === 1) {
          const changed = text.replace(mutant.before, mutant.after);
          await writeFile(target, changed);
          if (!(await readFile(target)).equals(Buffer.from(changed)))
            throw new Error('Mutation write verification failed');
          const outcome = await execute({ cwd: copy.root, mutant, phase: 'mutant' });
          result.status = classify(outcome);
          result.probes = outcome.probes;
        }
      } catch {
        result.status = 'SETUP_ERROR';
      } finally {
        try {
          await writeFile(target, original);
          const restored = await readFile(target);
          result.restoredHash = hash(restored);
          if (!restored.equals(original) || result.restoredHash !== result.beforeHash) result.status = 'RESTORE_FAILED';
        } catch {
          result.status = 'RESTORE_FAILED';
        }
      }
      summary.results.push(result);
    }
    summary.status = summary.results.every((result) => result.status === 'KILLED')
      ? 'KILLED'
      : summary.results.find((result) => result.status !== 'KILLED').status;
  } catch {
    summary.status = summary.controls.length < MUTANTS.length && copy ? 'CONTROL_FAILED' : 'SETUP_ERROR';
  } finally {
    if (copy) {
      try {
        const current = await ownerManifest(ownerRoot);
        summary.ownerUnchanged = current.size === copy.manifest.size;
        for (const [relative, digest] of copy.manifest) {
          if (current.get(relative) !== digest) {
            summary.ownerUnchanged = false;
            break;
          }
        }
      } catch {
        summary.ownerUnchanged = false;
      }
      try {
        await copy.cleanup();
        summary.cleaned = true;
      } catch {
        summary.status = 'SETUP_ERROR';
      }
      if (!summary.ownerUnchanged) summary.status = 'SETUP_ERROR';
    }
  }
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const summary = await runTargetedMutations();
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = summary.status === 'KILLED' && summary.ownerUnchanged && summary.cleaned ? 0 : 1;
}
