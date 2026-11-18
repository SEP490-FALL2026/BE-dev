import { REQUIRED_SPECS, RUNNERS, SUPPORT_DIRS } from './runners.mjs';

const SPEC_LIKE = /(?:\.|-)spec\.ts$/;
const inside = (file, dir) => file === dir || file.startsWith(`${dir}/`);
const base = (file) => file.slice(file.lastIndexOf('/') + 1);

export const toPosix = (path) => path.replaceAll('\\', '/');

/**
 * The runner that owns a file because of where it lives, or undefined. Where two runners share a directory the suffix
 * decides; a file carrying neither suffix belongs to the first, which reports it.
 */
export function ownerOf(file, runners = RUNNERS) {
  const here = runners.filter((runner) => owns(runner, file));
  return here.find((runner) => file.endsWith(runner.suffix)) ?? here[0];
}

/** A runner owns the files under its roots, minus the directories it excludes (owned by another runner). */
function owns(runner, file) {
  return runner.roots.some((root) => inside(file, root)) && !(runner.exclude ?? []).some((dir) => inside(file, dir));
}

/** Specs that would exist on disk for a runner: inside its roots and carrying its suffix. */
export function expectedFor(runner, files) {
  return files.filter((file) => owns(runner, file) && file.endsWith(runner.suffix)).sort();
}

/**
 * Layout violations for the given repository-relative `.ts` paths. A spec that no runner will
 * pick up passes silently forever, so this is the check that makes the layout enforceable.
 */
export function layoutProblems(files, runners = RUNNERS, supportDirs = SUPPORT_DIRS) {
  const problems = [];
  for (const file of files) {
    const spec = SPEC_LIKE.test(file);
    const support = supportDirs.find((dir) => inside(file, dir));
    const owner = ownerOf(file, runners);

    if (spec && support) {
      problems.push(`${file}: spec file inside ${support}/ (helpers and configuration hold no specs)`);
    } else if (spec && !owner) {
      problems.push(`${file}: spec file outside every runner directory, so no runner will ever execute it`);
    } else if (spec && owner && !file.endsWith(owner.suffix)) {
      problems.push(`${file}: wrong suffix for the ${owner.name} runner (expected *${owner.suffix})`);
    } else if (!spec && owner && file.startsWith('test/') && !(owner.allow ?? []).includes(base(file))) {
      problems.push(`${file}: non-spec file inside the ${owner.name} runner directory (put helpers in test/support/)`);
    }
  }
  return problems;
}

/** Differences between what a runner lists and what the layout says it should run. */
export function listingProblems(runner, listed, files) {
  const expected = expectedFor(runner, files);
  const got = [...new Set(listed)].sort();
  const problems = [];
  for (const file of expected)
    if (!got.includes(file)) problems.push(`${runner.name}: ${file} is on disk but the runner does not list it`);
  for (const file of got)
    if (!expected.includes(file))
      problems.push(`${runner.name}: runner lists ${file} which the layout does not assign to it`);
  return problems;
}

export function missingRequired(files, required = REQUIRED_SPECS) {
  return required.filter((file) => !files.includes(file)).map((file) => `required spec is missing: ${file}`);
}
