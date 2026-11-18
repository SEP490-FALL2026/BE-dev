import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { RUNTIME_SEQUENCE_EXCEPTIONS } from '../../src/infrastructure/database/database-role-judgement';

/**
 * H7-SEQ gate: the privileges that `ops:db-roles` grants the runtime role on sequences (`RUNTIME_SEQUENCE_EXCEPTIONS`, the one
 * policy the grant and the verifier both read) are exactly what the SQL of the application needs — no sequence the code reads or
 * lifts is left on the default USAGE, and no sequence holds a privilege no statement uses. PostgreSQL 17: `SELECT … FROM <seq>`
 * needs SELECT, `setval` needs UPDATE (docs/rules/database-business.md, "Vai PostgreSQL (H7)"). Read from the source text.
 *
 * What the scan recognises, in the text of every non-spec file of `src/` (generated code left out):
 * - `FROM <name>_seq`, with or without `public.` and double quotes: the sequence is read, so it needs SELECT;
 * - `setval('<name>'`, a string literal that names the sequence, with or without `public.` and quotes: it is lifted, so it needs UPDATE.
 *
 * What it does NOT recognise, so a statement of that shape is invisible to this gate:
 * - `pg_sequence_last_value('<name>')` and the other functions of the catalog that read a sequence;
 * - a sequence whose name does not end in `_seq` (an explicit `CREATE SEQUENCE bm_number`), for the `FROM` form;
 * - SQL put together at run time: `$queryRawUnsafe` / `$executeRawUnsafe` with an interpolated name, or a name held in a variable
 *   (`setval(${name}`), and any SQL kept outside `src/` (a migration, a script).
 *
 * The backstops for those: the verifier of `ops:db-roles` (`verify`, `reconcile`) judges the privileges that the database really
 * holds against `RUNTIME_SEQUENCE_EXCEPTIONS`, and the `_serial` integration tests run the numbering statements as the runtime role
 * (`test/integration/_serial/database-runtime-sequences.integration-spec.ts` and the `database-runtime-role-*-write` specs): a
 * statement this gate cannot see fails there with `permission denied for sequence`.
 */
const sourceRoot = join(__dirname, '..', '..', 'src');

function applicationFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : applicationFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

/** The privilege each sequence named in the SQL of `src` needs, and the files that say so. */
function sequenceNeeds(): Map<string, { privileges: Set<string>; files: Set<string> }> {
  const needs = new Map<string, { privileges: Set<string>; files: Set<string> }>();
  const note = (name: string, privilege: string, file: string): void => {
    const entry = needs.get(name) ?? { privileges: new Set<string>(), files: new Set<string>() };
    entry.privileges.add(privilege);
    entry.files.add(relative(sourceRoot, file).split(sep).join('/'));
    needs.set(name, entry);
  };
  for (const file of applicationFiles(sourceRoot)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/\bsetval\(\s*'(?:public\.)?"?([a-z][a-z0-9_]*)"?'/g))
      note(match[1], 'UPDATE', file);
    for (const match of text.matchAll(/\bFROM\s+(?:public\.)?"?([a-z][a-z0-9_]*_seq)\b"?/g))
      note(match[1], 'SELECT', file);
  }
  return needs;
}

// H7-SEQ
describe('the runtime privileges on sequences match the SQL of the application', () => {
  const needs = sequenceNeeds();

  it('finds the two numbering statements of BM-09 and BM-11 (the scan itself is alive)', () => {
    expect([...needs.keys()].sort()).toEqual(expect.arrayContaining(['personnel_notice_seq', 'saas_issue_seq']));
    expect([...(needs.get('saas_issue_seq')?.files ?? [])]).toEqual([
      'modules/licensing/saas-issue/saas-issue.repo.ts',
    ]);
    expect([...(needs.get('personnel_notice_seq')?.files ?? [])]).toEqual(['modules/personnel/notice/notice.repo.ts']);
  });

  it('lists every sequence that the SQL reads or lifts, with exactly the privileges its statements need', () => {
    const wanted = Object.fromEntries([...needs].map(([name, need]) => [name, [...need.privileges].sort()]));
    const declared = Object.fromEntries(
      Object.entries(RUNTIME_SEQUENCE_EXCEPTIONS).filter(([name]) => needs.has(name)),
    );

    expect(
      Object.fromEntries(Object.entries(declared).map(([name, privileges]) => [name, [...privileges].sort()])),
    ).toEqual(wanted);
  });

  it('keeps no sequence in the policy that no statement reads or lifts', () => {
    expect(Object.keys(RUNTIME_SEQUENCE_EXCEPTIONS).filter((name) => !needs.has(name))).toEqual([]);
  });
});
