#!/usr/bin/env node
// Builds or checks docs/guides/native-handoff-manifest.json: the list of files a developer
// checkout must contain for the native identity work, with SHA-256 over the actual bytes.
//
//   node docs/guides/tools/build-native-handoff-manifest.mjs [--write]  write the manifest
//   node docs/guides/tools/build-native-handoff-manifest.mjs --check    compare, exit 1 on any difference
//   node docs/guides/tools/build-native-handoff-manifest.mjs --bundle <dir>
//                  copy every listed file into <dir>/Code/BE-dev-software-license-management/... and <dir>/Docs/...
//                  (the workspace layout, so links between the two repositories resolve) plus the manifest and
//                  BUNDLE-README.md; <dir> must not exist yet; every Docs file must be present
//   node docs/guides/tools/build-native-handoff-manifest.mjs --compare <BE checkout> <Docs checkout>
//                  read-only: run from an extracted bundle, report per file whether the receiver's checkout is
//                  identical, lacks the file, or differs (and whether that file has uncommitted local changes)
//   --docs <path>  location of the separate Docs repository (default: ../../Docs from the BE root)
//
// Writes only the manifest (or the new bundle directory). It never commits, stages or contacts a service;
// it reads local git metadata (HEAD, file state) when a repository is present.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(here, '..', '..', '..');
const manifestPath = join(backendRoot, 'docs', 'guides', 'native-handoff-manifest.json');
const BE_DIR = 'Code/BE-dev-software-license-management';

// Text files are hashed over LF-normalized bytes (CRLF -> LF): with core.autocrlf=true a fresh checkout writes CRLF,
// and a raw-byte hash would then differ from the preparing workspace for files nobody changed.
const TEXT_EXT = /\.(md|json|mjs|js|ts|py|csv|html|drawio|txt|ya?ml|ps1|mmd)$/i;
function digest(path, bytes = readFileSync(path)) {
  const data = TEXT_EXT.test(path) ? Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1') : bytes;
  return createHash('sha256').update(data).digest('hex');
}

const USAGE =
  'usage: build-native-handoff-manifest.mjs [--write | --check | --bundle <new dir> | --compare <BE checkout> <Docs checkout>] [--docs <Docs root>] [--backend-only]';
const argv = process.argv.slice(2);
// Anything unrecognised exits without writing: a mistyped flag must never rewrite the manifest.
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === '--help' || arg === '-h') {
    console.log(USAGE);
    process.exit(0);
  }
  if (arg === '--bundle' || arg === '--docs') {
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) {
      console.error(`${arg} needs a path\n${USAGE}`);
      process.exit(2);
    }
    i += 1;
  } else if (arg === '--compare') {
    if (!argv[i + 1] || !argv[i + 2] || argv[i + 1].startsWith('--') || argv[i + 2].startsWith('--')) {
      console.error(`--compare needs <BE checkout> <Docs checkout>\n${USAGE}`);
      process.exit(2);
    }
    i += 2;
  } else if (arg !== '--check' && arg !== '--write' && arg !== '--backend-only') {
    console.error(`unknown argument: ${arg}\n${USAGE}`);
    process.exit(2);
  }
}
const check = argv.includes('--check');
const bundleFlag = argv.indexOf('--bundle');
const bundleDir = bundleFlag >= 0 ? resolve(argv[bundleFlag + 1]) : null;
const compareFlag = argv.indexOf('--compare');
const compareTargets = compareFlag >= 0 ? [resolve(argv[compareFlag + 1]), resolve(argv[compareFlag + 2])] : null;
const backendOnly = argv.includes('--backend-only');
if (backendOnly && !argv.includes('--check')) {
  console.error(`--backend-only is only valid with --check\n${USAGE}`);
  process.exit(2);
}
const docsFlag = argv.indexOf('--docs');
const docsRoot = resolve(docsFlag >= 0 ? argv[docsFlag + 1] : join(backendRoot, '..', '..', 'Docs'));
if ([check, bundleDir !== null, compareTargets !== null, argv.includes('--write')].filter(Boolean).length > 1) {
  console.error(`choose one of --write, --check, --bundle, --compare\n${USAGE}`);
  process.exit(2);
}

// Files of this repository (relative to the backend root). Order is the reading order of native-handoff.md.
// Rule: every document the hand-off cites as required is listed here, unless it is tracked and unchanged in
// the baseline HEAD recorded below (then the receiver's checkout already has the same bytes).
const BACKEND_FILES = [
  'AGENTS.md',
  'ARCHITECTURE.md',
  'README.md',
  'docs/README.md',
  'docs/rules/README.md',
  'docs/rules/context.md',
  'docs/rules/architecture.md',
  'docs/rules/database-business.md',
  'docs/rules/documentation.md',
  'docs/rules/security-jobs.md',
  'docs/rules/api-contract.md',
  'docs/architecture/backend-architecture-spec.md',
  'docs/guides/kien-truc-backend-va-cach-viet-code.md',
  'docs/decisions/0002-zod-http-contract-and-auth-defaults.md',
  'docs/decisions/0004-error-contract-availability-and-request-id-trust.md',
  'docs/decisions/0005-database-constraints-outside-prisma.md',
  'docs/decisions/0006-principal-provisioning-and-authorization.md',
  'docs/decisions/0007-money-representation.md',
  'docs/decisions/0008-effective-roles-super-admin-and-terminated-holders.md',
  'docs/decisions/0009-single-super-admin-and-transfer.md',
  'docs/decisions/0010-native-password-authentication.md',
  'docs/architecture/native-identity-workforce-design.md',
  'docs/architecture/native-delivery-plan.md',
  'docs/architecture/native-owner-decision-package.md',
  'docs/architecture/s0-core-design.md',
  'docs/guides/native-handoff.md',
  'docs/guides/native-handoff-prompts.md',
  'docs/guides/native-identity-verification.md',
  'docs/guides/native-identity-maintenance.md',
  'docs/guides/native-business-walkthrough.md',
  'docs/guides/tools/build-native-handoff-manifest.mjs',
  'docs/guides/tools/check-handoff-links.py',
  'docs/examples/employee-import/README.md',
  'docs/examples/employee-import/employee-template.csv',
  'docs/examples/employee-import/employee-template.xlsx',
  'docs/examples/employee-import/employees-15.csv',
  'docs/examples/employee-import/employees-15.xlsx',
  'docs/examples/employee-import/employees-invalid.csv',
  'docs/examples/employee-import/expected-results.json',
];

// Sections of the Docs repository that packages cite (relative to the Docs root), plus the derived files their
// links reach when those differ from the Docs baseline HEAD. Optional on a developer machine for --check (reported
// as `absent`), but REQUIRED for --bundle: a bundle never ships with a cited Docs file missing.
const DOCS_FILES = [
  'Decisions/project-decisions.md',
  'Requiments/BRD - HỆ THỐNG QUẢN TRỊ BẢN QUYỀN PHẦN MỀM & TỐI ƯU CHI PHÍ CÔNG NGHỆ.md',
  'Requiments/Định nghĩa phạm vi & nghiệp vụ.md',
  'BE-UserStory/user-stories-and-epics.md',
  'ERD/README.md',
  'ERD/CONCEPTUAL ERD - DANH SÁCH ENTITY.md',
  'ERD/SaaS-Sentry-Conceptual-ERD.drawio',
  'ERD/SaaS-Sentry-Conceptual-ERD.drawio.png',
  'ERD/SaaS-Sentry-Conceptual-ERD.export-manifest.json',
  'ERD/logical/LOGICAL-ERD-S0.md',
  'ERD/logical/LOGICAL-ERD-S0.drawio',
  'ERD/logical/LOGICAL-ERD-S0.drawio.png',
  'ERD/logical/LOGICAL-ERD-S0.drawio.pdf',
  'ERD/logical/LOGICAL-ERD-S0.export-manifest.json',
  'ERD/tools/erd_drawio.py',
  'ERD/tools/generate-conceptual-erd.py',
  'ERD/tools/check-erd-consistency.py',
  'ERD/tools/test_check_erd_consistency.py',
  'ERD/tools/export-erd-png.py',
  'ERD/tools/generate-logical-erd-s0.py',
  'ERD/tools/check-logical-erd-s0.py',
  'ERD/tools/test_check_logical_erd_s0.py',
  'Diagrams/context-diagram/index.md',
  'Diagrams/context-diagram/SaaS-Sentry-Context-Diagram.drawio',
  'Diagrams/context-diagram/SaaS-Sentry-Context-Diagram.drawio.png',
  'Diagrams/context-diagram/context-diagram-drawing-notes.md',
  'Diagrams/context-diagram/context-diagram-eight-entity-data-flows.md',
  'Diagrams/context-diagram/tools/build_context_diagram.py',
  'Diagrams/context-diagram/tools/check_context_diagram.py',
  'ERD/proposed-simplified/README.md',
  'Diagrams/workflows-activity-diagram/workflow-reading-guide.md',
  'Diagrams/workflows-activity-diagram/workflow-walkthrough-index.md',
  'Diagrams/workflows-activity-diagram/SaaS-Sentry-Activity-Diagrams.drawio',
  'Diagrams/workflows-activity-diagram/artifact-manifest.json',
  'Diagrams/workflows-activity-diagram/png/WF-03.png',
  'Diagrams/workflows-activity-diagram/drawio/WF-07.drawio',
  'Diagrams/workflows-activity-diagram/png/WF-07.png',
  // 05/10/2026: the WF PNGs deleted by Docs commit 2462d75 were restored (Owner decision); untracked, so they travel here
  'Diagrams/workflows-activity-diagram/png/WF-01.png',
  'Diagrams/workflows-activity-diagram/png/WF-02.png',
  'Diagrams/workflows-activity-diagram/png/WF-04.png',
  'Diagrams/workflows-activity-diagram/png/WF-05.png',
  'Diagrams/workflows-activity-diagram/png/WF-06.png',
  'Diagrams/workflows-activity-diagram/png/WF-08.png',
  'Diagrams/workflows-activity-diagram/png/WF-09.png',
  'Diagrams/workflows-activity-diagram/png/WF-09a.png',
  'Diagrams/workflows-activity-diagram/png/WF-10.png',
  'Diagrams/workflows-activity-diagram/png/WF-11.png',
  'Diagrams/workflows-activity-diagram/png/WF-12.png',
  'Diagrams/workflows-activity-diagram/png/WF-12a.png',
  'Diagrams/workflows-activity-diagram/png/WF-13.png',
  'Diagrams/workflows-activity-diagram/png/WF-13a.png',
  'Diagrams/workflows-activity-diagram/png/WF-14.png',
  'Diagrams/workflows-activity-diagram/png/WF-15.png',
  'Diagrams/workflows-activity-diagram/png/WF-16.png',
  'Diagrams/workflows-activity-diagram/png/WF-17.png',
  'Diagrams/workflows-activity-diagram/png/WF-17a.png',
  'Diagrams/workflows-activity-diagram/png/WF-18.png',
  'Diagrams/user-flows/drawio/UF-09.drawio',
  'Diagrams/main-workflows-activity-diagram/index.md',
  'Diagrams/main-workflows-activity-diagram/05-offboarding-access-reclaim.drawio',
  'Diagrams/main-workflows-activity-diagram/main-workflows-reading-script.md',
  'Diagrams/main-workflows-activity-diagram/tools/specs_main_flows.py',
  'Diagrams/use-case-diagram/saas-sentry-use-case-diagram-edited.drawio',
  'Diagrams/use-case-diagram/use-case-specification.md',
  'Diagrams/use-case-diagram/use-case-drawing-guide.md',
  'Diagrams/use-case-diagram/tools/layouts.json',
  'Diagrams/use-case-diagram/tools/usecase_model.py',
  'Diagrams/use-case-diagram/tools/usecase_trace.py',
  'Diagrams/use-case-diagram/tools/check_edited_use_case.py',
  'Diagrams/user-flows/index.md',
  'Diagrams/user-flows/drawio/UF-17.drawio',
  'Diagrams/user-flows/SaaS-Sentry-User-Flows.pdf',
  'Diagrams/user-flows/SaaS-Sentry-User-Flows.export-manifest.json',
  'Diagrams/user-flows/SaaS-Sentry-Luong-man-hinh.html',
  'Diagrams/workflows-activity-diagram/index.md',
  'Diagrams/workflows-activity-diagram/drawio/WF-03.drawio',
];

// Session reports of the Docs repository. Docs/.gitignore ignores Reviews/, so a checkout never has them: they
// travel only in the bundle. Informational (what was done and checked), never a source of business rules.
const DOCS_REPORTS = [
  'Reviews/native-handover-sync-2026-10-05.md',
  'Reviews/native-handoff-finalization-2026-10-05.md',
  'Reviews/native-handoff-completion-2026-10-04.md',
];

function git(root, args) {
  try {
    const out = execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return { ok: true, out };
  } catch (error) {
    const err = (error.stderr ? error.stderr.toString() : error.message).trim().split('\n')[0];
    return { ok: false, err, code: error.status ?? error.code };
  }
}

// A git failure is reported with git's own message; it never turns into "skip the Docs files".
function gitFailure(root, args, res) {
  const msg =
    `cannot read the git state of ${root}: git ${args[0]} failed (exit ${res.code}): ${res.err}\n` +
    'Typical causes: git not on PATH, "detected dubious ownership" (add the folder to safe.directory), ' +
    'a stale .git/index.lock, or a checkout that is not a git repository.';
  if (check) {
    console.error(
      `note: ${msg}\nnote: gitState is not needed for --check; the SHA-256 of every listed file is still verified.`,
    );
    return null;
  }
  console.error(
    `${msg}\nThe manifest records gitState, so --write/--bundle stop here (exit 3); fix git and run again.`,
  );
  process.exit(3);
}

function gitStates(root, files) {
  if (!existsSync(join(root, '.git'))) return null;
  const states = new Map();
  // Limited to the listed paths (literal pathspecs): a whole-repository --ignored listing includes node_modules.
  const specs = ['--', ...files.map((f) => `:(literal)${f}`)];
  const lsArgs = ['ls-files', '-z', ...specs];
  const ls = git(root, lsArgs);
  if (!ls.ok) return gitFailure(root, lsArgs, ls);
  const tracked = new Set(ls.out.split('\0'));
  const stArgs = ['status', '--porcelain=v1', '-z', '--ignored', '--untracked-files=all', ...specs];
  const st = git(root, stArgs);
  if (!st.ok) return gitFailure(root, stArgs, st);
  const status = st.out;
  const flagged = new Map();
  for (const rec of status.split('\0')) if (rec.length > 3) flagged.set(rec.slice(3), rec.slice(0, 2));
  for (const file of files) {
    const code = flagged.get(file);
    if (code === '!!') states.set(file, 'ignored');
    else if (code === '??') states.set(file, 'untracked');
    else if (code) states.set(file, tracked.has(file) ? 'tracked-modified' : 'untracked');
    else states.set(file, tracked.has(file) ? 'tracked-unchanged' : 'absent');
  }
  return states;
}

function entries(root, files, optional) {
  const states = gitStates(root, files);
  return files.map((file) => {
    const abs = join(root, file);
    if (!existsSync(abs)) return { path: file, sha256: null, status: optional ? 'absent' : 'MISSING' };
    const bytes = readFileSync(abs);
    const entry = {
      path: file,
      sha256: digest(abs, bytes),
      bytes: bytes.length,
      status: 'present',
    };
    if (states) entry.gitState = states.get(file);
    return entry;
  });
}

function baseline(root) {
  if (!existsSync(join(root, '.git'))) return null;
  const res = git(root, ['rev-parse', 'HEAD']);
  if (!res.ok) return gitFailure(root, ['rev-parse', 'HEAD'], res);
  return { head: res.out.trim() };
}

const built = {
  schema: 'native-handoff-manifest/3',
  note: 'Checksums of the documents a developer needs. Generated by docs/guides/tools/build-native-handoff-manifest.mjs over the files as they exist on disk (SHA-256 of text files is taken over LF-normalized bytes, CRLF -> LF, so a checkout with core.autocrlf=true matches; binary files are hashed raw); nothing here is committed, signed or approved by GVHD. A mismatch means your copy differs from the one the hand-over was prepared with. gitState = the file in the preparing workspace relative to the baseline HEAD (tracked-unchanged files are byte-identical to that HEAD).',
  authority:
    'Owner decisions through the 2026-10-04 and 2026-10-05 prompts (Docs QĐ-47, QĐ-48); not a GVHD confirmation. Documents only: nothing is implemented, committed or verified.',
  baseline: { backend: baseline(backendRoot), docsRepository: baseline(docsRoot) },
  backend: entries(backendRoot, BACKEND_FILES, false),
  docsRepository: entries(docsRoot, DOCS_FILES, true),
  docsReports: entries(docsRoot, DOCS_REPORTS, true),
};

function sha(path) {
  return digest(path);
}

if (check) {
  if (!existsSync(manifestPath)) {
    console.error('manifest missing:', relative(backendRoot, manifestPath));
    process.exit(1);
  }
  const stored = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const problems = [];
  for (const section of ['backend', 'docsRepository', 'docsReports']) {
    const have = new Map(built[section].map((e) => [e.path, e]));
    const storedPaths = new Set((stored[section] ?? []).map((e) => e.path));
    for (const now of built[section])
      if (!storedPaths.has(now.path))
        problems.push(`${section}: ${now.path} listed by the tool but not in the manifest`);
    for (const old of stored[section] ?? []) {
      const now = have.get(old.path);
      if (!now) problems.push(`${section}: ${old.path} not in the current list`);
      else if (now.status === 'absent' && section !== 'backend') continue;
      else if (now.sha256 !== old.sha256)
        problems.push(`${section}: ${old.path} differs (${old.sha256?.slice(0, 12)} -> ${now.sha256?.slice(0, 12)})`);
    }
  }
  const missing = built.backend.filter((e) => e.status === 'MISSING').map((e) => e.path);
  if (missing.length) problems.push(`backend files missing: ${missing.join(', ')}`);
  // A check that silently skips absent Docs files would print 'manifest matches' for an empty Docs root.
  const absentDocs = built.docsRepository.filter((e) => e.status === 'absent').map((e) => e.path);
  if (!backendOnly && !existsSync(docsRoot))
    problems.push(
      `Docs root does not exist: ${docsRoot} (pass --docs <Docs root>, or --backend-only to check the BE files alone)`,
    );
  else if (!backendOnly && absentDocs.length)
    problems.push(`Docs files absent under ${docsRoot}: ${absentDocs.join(', ')} (or pass --backend-only)`);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  const present = (s) => built[s].filter((e) => e.status === 'present').length;
  console.log(
    backendOnly
      ? `manifest matches for the ${built.backend.length} backend files; Docs NOT checked (--backend-only)`
      : `manifest matches (${built.backend.length} backend files, ${present('docsRepository')}/${DOCS_FILES.length} Docs files present, ${present('docsReports')}/${DOCS_REPORTS.length} session reports present — reports are optional, git-ignored in Docs)`,
  );
} else if (bundleDir) {
  if (!existsSync(manifestPath)) {
    console.error('manifest missing; run the tool without flags first');
    process.exit(1);
  }
  if (existsSync(bundleDir)) {
    console.error('refusing to bundle: target exists:', bundleDir);
    process.exit(1);
  }
  const stored = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const sections = [
    ['backend', backendRoot, BE_DIR, true],
    ['docsRepository', docsRoot, 'Docs', true],
    ['docsReports', docsRoot, 'Docs', true],
  ];
  const counts = {};
  for (const [section, root, sub, required] of sections) {
    counts[section] = 0;
    for (const entry of stored[section] ?? []) {
      if (entry.status !== 'present' || !existsSync(join(root, entry.path))) {
        if (required) {
          console.error(`refusing to bundle: ${section} ${entry.path} is not present; a bundle never ships without it`);
          process.exit(1);
        }
        continue;
      }
      if (sha(join(root, entry.path)) !== entry.sha256) {
        console.error(`refusing to bundle: ${section} ${entry.path} differs from the manifest; regenerate first`);
        process.exit(1);
      }
      const target = join(bundleDir, sub, entry.path);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(root, entry.path), target);
      counts[section] += 1;
    }
  }
  copyFileSync(manifestPath, join(bundleDir, BE_DIR, 'docs', 'guides', 'native-handoff-manifest.json'));
  const payload = counts.backend + counts.docsRepository + counts.docsReports;
  const b = stored.baseline ?? {};
  writeFileSync(
    join(bundleDir, 'BUNDLE-README.md'),
    [
      '# Native identity hand-off bundle — documents only',
      '',
      `Payload: ${payload} files (${counts.backend} BE, ${counts.docsRepository} Docs, ${counts.docsReports} session reports) + the manifest + this README. No product code, schema, migration or test result is in here.`,
      '',
      '## What it applies to',
      '',
      `- BE repository, baseline HEAD \`${b.backend?.head ?? 'unknown'}\` — files under \`${BE_DIR}/\`.`,
      `- Docs repository, baseline HEAD \`${b.docsRepository?.head ?? 'unknown'}\` — files under \`Docs/\`.`,
      '- What the bundle guarantees: every relative link in a **required-reading** file (all BE markdown files listed, and the Docs decision log, BRD, Scope, User Stories, ERD README, entity list and Logical ERD md) resolves to a file in this bundle or to a file that is unchanged in the baseline commit above, except the named exceptions in `check-handoff-links.py`. Supporting diagram files are shipped as context; links **from** them may reach files that differ from the baseline (the link checker lists them as INFO). It makes no claim about other files of your checkout.',
      '- `gitState` in the manifest tells, per file, whether it was tracked-unchanged, tracked-modified, untracked or ignored in the preparing workspace.',
      '- `Docs/Reviews/` is git-ignored in the Docs repository: the two reports in it exist only in this bundle. They describe what was done and checked; business rules live in the decision log, BRD and User Stories.',
      '',
      '## Before copying anything (never copy blind)',
      '',
      `1. Check the bundle itself: from \`${BE_DIR}\` run \`node docs/guides/tools/build-native-handoff-manifest.mjs --check\` (Docs default to \`../../Docs\`, i.e. the bundle's Docs).`,
      `2. Compare with your checkouts, read-only: \`node docs/guides/tools/build-native-handoff-manifest.mjs --compare <your BE checkout> <your Docs checkout>\`. Each file is SAME, NEW (absent in your checkout), DIFFERENT, or DIFFERENT+LOCAL (your checkout has uncommitted changes to it).`,
      `   Optional link check (needs Python 3 and the two git checkouts as baseline): \`python -B ${BE_DIR}/docs/guides/tools/check-handoff-links.py --root . --files-from-manifest ${BE_DIR}/docs/guides/native-handoff-manifest.json --baseline-be <your BE checkout> --baseline-docs <your Docs checkout>\` (exit 0 = every required-reading link resolves to the bundle or to an unchanged baseline file; named exceptions are listed in the script).`,
      '3. For DIFFERENT files run `git diff --no-index <your file> <bundle file>` and read the change. For DIFFERENT+LOCAL files merge by hand — copying would destroy your work.',
      '4. Copy only after that, then from your BE checkout run `--check --docs <your Docs checkout>`; it must exit 0 and print `manifest matches (…, N/N Docs files present, …)` with N = every Docs file of the manifest — an absent Docs file or Docs root is an error. `--backend-only` checks the BE files alone and says so.',
      '',
      'Nothing here is committed, signed or approved by GVHD; see the manifest "authority".',
      '',
    ].join('\n'),
  );
  console.log(`bundled ${payload} payload files into ${bundleDir} (+ manifest + BUNDLE-README.md)`);
} else if (compareTargets) {
  if (!existsSync(manifestPath)) {
    console.error('manifest missing:', relative(backendRoot, manifestPath));
    process.exit(1);
  }
  const stored = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const [beTarget, docsTarget] = compareTargets;
  for (const root of compareTargets)
    if (!existsSync(root)) {
      console.error(`--compare: checkout does not exist: ${root}`);
      process.exit(2);
    }
  const tally = {};
  for (const [section, root, target] of [
    ['backend', backendRoot, beTarget],
    ['docsRepository', docsRoot, docsTarget],
    ['docsReports', docsRoot, docsTarget],
  ]) {
    const local = gitStates(
      target,
      (stored[section] ?? []).map((e) => e.path),
    );
    for (const entry of stored[section] ?? []) {
      if (entry.status !== 'present' || !existsSync(join(root, entry.path))) continue;
      const theirs = join(target, entry.path);
      let verdict;
      if (!existsSync(theirs)) verdict = 'NEW';
      else if (sha(theirs) === entry.sha256) verdict = 'SAME';
      else {
        const state = local?.get(entry.path);
        verdict = state === 'tracked-modified' || state === 'untracked' ? 'DIFFERENT+LOCAL' : 'DIFFERENT';
      }
      tally[verdict] = (tally[verdict] ?? 0) + 1;
      if (verdict !== 'SAME') console.log(`${verdict.padEnd(16)} ${section}: ${entry.path}`);
    }
  }
  console.log(`summary: ${JSON.stringify(tally)} (read-only; nothing was copied)`);
} else {
  const missing = built.backend.filter((e) => e.status === 'MISSING');
  if (missing.length) {
    console.error('refusing to write: missing backend files:', missing.map((e) => e.path).join(', '));
    process.exit(1);
  }
  writeFileSync(manifestPath, JSON.stringify(built, null, 2) + '\n');
  console.log('wrote', relative(backendRoot, manifestPath));
}
