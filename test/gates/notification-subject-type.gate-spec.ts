import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { isUpperSnakeSubjectType } from '../../src/modules/notifications/inbox/notification-target.policy';

/**
 * The `subject.type` of a notice is `UPPER_SNAKE` on the wire (`SPEC-5B` A6). The inbox does not refuse a notice for a type in another
 * shape (that would turn a business transaction into a 500), it only normalises the four old spellings and logs the rest; this gate is
 * what stops a new spelling from being written: it reads every `subject: { type: '…'` and `SUBJECT = '…'` of `src` outside the specs.
 * The Audit Trail has its own vocabulary (`resource_type` `'LicenseAssignment'`, `'ProvisioningTask'`) and is not read here.
 */
const ROOT = process.cwd();
const SUBJECT_LITERAL =
  /\bsubject\??\s*[:=]\s*\{\s*type:\s*(['"])([^'"\n]*)\1|\bSUBJECT(?:_TYPE)?\s*=\s*(['"])([^'"\n]*)\3/g;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === 'generated' ? [] : sourceFiles(path);

    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

/** `path: 'type'` of every literal subject type of the files that is not `UPPER_SNAKE`, and how many literals were read. */
function subjectTypeLiterals(files: Readonly<Record<string, string>>): { all: number; wrong: string[] } {
  let all = 0;
  const wrong: string[] = [];
  for (const [path, text] of Object.entries(files)) {
    for (const match of text.matchAll(SUBJECT_LITERAL)) {
      const type = match[2] ?? match[4] ?? '';
      all += 1;
      if (!isUpperSnakeSubjectType(type)) wrong.push(`${path}: '${type}'`);
    }
  }

  return { all, wrong };
}

describe('the type of the subject of a notification', () => {
  it('is written in UPPER_SNAKE everywhere in src', () => {
    const files = Object.fromEntries(
      sourceFiles(join(ROOT, 'src')).map((path) => [
        relative(ROOT, path).split(sep).join('/'),
        readFileSync(path, 'utf8'),
      ]),
    );
    const { all, wrong } = subjectTypeLiterals(files);

    expect(all).toBeGreaterThan(40);
    expect(wrong).toEqual([]);
  });

  it('names a literal in another shape, and passes the canonical ones', () => {
    const files = {
      'bad.ts': "const a = { subject: { type: 'LicenseAssignment', id } };\nconst SUBJECT = 'ghost_seat';\n",
      'multi-line.ts': "const b = {\n  subject: {\n    type: 'ProvisioningTask',\n    id,\n  },\n};\n",
      'good.ts':
        "const c = { subject: { type: 'ACCESS_REQUEST', id } };\nconst SUBJECT = 'GHOST_SEAT_RECOMMENDATION';\n",
    };

    expect(subjectTypeLiterals(files)).toEqual({
      all: 5,
      wrong: ["bad.ts: 'LicenseAssignment'", "bad.ts: 'ghost_seat'", "multi-line.ts: 'ProvisioningTask'"],
    });
  });
});
