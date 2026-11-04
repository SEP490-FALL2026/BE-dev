import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import * as ts from 'typescript';

/*
 * BEH.1 (A4-11) gate: a shared business policy has one owner. "Shared validation" means sharing the semantic decision;
 * where a reason is shown (form field, file column) and the reasons of one workflow stay with each adapter
 * (docs/rules/module-structure.md). This gate ratchets that: the reason literals of the policy are written in the
 * policy alone, the policy stays pure and exactly the registered adapters consume it. This file is the one registry of
 * the shared policies (dependency-cruiser only checks that other modules reach them through `public/`). Read with the
 * TypeScript parser.
 */

const sourceRoot = join(__dirname, '..', '..', 'src');
const modulesRoot = join(sourceRoot, 'modules');

interface PolicyContract {
  /** Why it is public: who shares the decision. */
  reason: string;
  /** The function each consumer must call. */
  entry: string;
  /** The exact non-spec files that import it, paths relative to src/modules. */
  consumers: readonly string[];
}

/** The exact public policy files another module shares, with their consumers: the single registry of shared policies. */
const PUBLIC_ROOT_POLICY_FILES: ReadonlyMap<string, PolicyContract> = new Map([
  [
    'organization/public/employee-placement.policy.ts',
    {
      reason:
        'manual entry, the import preview and the correction of a record (also the controlled procedure for the record of the Super Admin) share whether a department and a job title can take a person in',
      entry: 'placementReasons',
      consumers: [
        'data-import/employee-import/row-validation/employee-import-row-validation.policy.ts',
        'organization/employee/employee-correction.policy.ts',
        'organization/employee/employee-row.policy.ts',
        'personnel/super-admin-event/profile-correction.policy.ts',
        'personnel/transfer/transfer.policy.ts',
      ],
    },
  ],
  [
    'budgets/public/budget-year-lock-key.policy.ts',
    {
      reason:
        'the budget of one Cost Center and year is serialised by one advisory lock that budgets takes in its repos and requests takes for the budget check of a request: both must name the same key',
      entry: 'budgetYearLockKey',
      consumers: ['budgets/budget/budget-year-lock.repo.ts', 'requests/spend/budget-check.repo.ts'],
    },
  ],
]);

/** The reasons the placement policy decides; written as literals here so the gate does not trust the policy. */
const PLACEMENT_REASON_CODES: ReadonlySet<string> = new Set([
  'DEPARTMENT_NOT_FOUND',
  'DEPARTMENT_INACTIVE',
  'JOB_TITLE_TOO_LONG',
]);

/**
 * Files outside the policy that write one of those literals for a different decision, with the exact codes. Each
 * entry must still hold; a new file is a copied judgement until it is reviewed and listed here.
 */
const OTHER_DECISIONS: ReadonlyMap<string, { codes: readonly string[]; reason: string }> = new Map([
  [
    'installation/dev-seed/dev-seed-plan.policy.ts',
    {
      codes: ['DEPARTMENT_INACTIVE'],
      reason: 'dev:seed compares an existing fixture item with the fixture (P23-RV-01 SeedConflict), not a row',
    },
  ],
  [
    'installation/public/dev-seed.types.ts',
    { codes: ['DEPARTMENT_INACTIVE'], reason: 'the SeedConflict type of the same comparison' },
  ],
  [
    'organization/public/cost-center-direction.errors.ts',
    {
      codes: ['DEPARTMENT_NOT_FOUND'],
      reason: 'the refusal of `ops:cost-center-direction link` for a department code that names none (spec L.11)',
    },
  ],
  [
    'organization/public/cost-center-direction.api.ts',
    { codes: ['DEPARTMENT_NOT_FOUND'], reason: 'raises that refusal' },
  ],
]);

function listSources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return listSources(path);

    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

const toModulePath = (file: string): string => relative(modulesRoot, file).split(sep).join('/');

const parse = (fileName: string, source: string): ts.SourceFile =>
  ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

/** The string literals (and literal types) of `codes` written in `source`, each once, sorted. Comments do not count. */
export function reasonLiterals(fileName: string, source: string, codes: ReadonlySet<string>): string[] {
  const found = new Set<string>();
  const visit = (node: ts.Node): void => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && codes.has(node.text)) {
      found.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(fileName, source));

  return [...found].sort();
}

/** The relative module specifiers `source` imports or re-exports, resolved to absolute `.ts` paths. */
function importedFiles(file: string, source: string): string[] {
  return parse(file, source)
    .statements.flatMap((statement) =>
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier)
        ? [statement.moduleSpecifier.text]
        : [],
    )
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => `${resolve(dirname(file), specifier)}.ts`);
}

/** What makes a policy file impure: a class, a decorator, or a value import from outside `src/core`. */
export function impurities(fileName: string, source: string, coreRoot: string): string[] {
  const problems: string[] = [];
  const file = parse(fileName, source);
  for (const statement of file.statements) {
    if (ts.isClassDeclaration(statement)) problems.push(`class ${statement.name?.text ?? '(anonymous)'}`);
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    if (statement.importClause?.isTypeOnly === true) continue;
    const target = specifier.startsWith('.') ? resolve(dirname(fileName), specifier) : specifier;
    if (!target.startsWith(coreRoot + sep)) problems.push(`imports ${specifier}`);
  }
  const visit = (node: ts.Node): void => {
    if (ts.isDecorator(node)) problems.push('decorator');
    ts.forEachChild(node, visit);
  };
  visit(file);

  return problems;
}

/** Whether `source` calls the function `entry` (by its own name). */
export function callsEntry(fileName: string, source: string, entry: string): boolean {
  let called = false;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === entry) called = true;
    ts.forEachChild(node, visit);
  };
  visit(parse(fileName, source));

  return called;
}

// BEH.1, A4-11
describe('a shared business policy has one owner', () => {
  const sources = listSources(modulesRoot).map((file) => ({ file, source: readFileSync(file, 'utf8') }));

  it('writes the placement reasons in the policy alone; any other file is a registered different decision', () => {
    const written = new Map(
      sources
        .map(({ file, source }) => [toModulePath(file), reasonLiterals(file, source, PLACEMENT_REASON_CODES)] as const)
        .filter(([, codes]) => codes.length > 0),
    );
    const expected = new Map<string, string[]>([
      ['organization/public/employee-placement.policy.ts', [...PLACEMENT_REASON_CODES].sort()],
      ...[...OTHER_DECISIONS].map(([file, entry]) => [file, [...entry.codes].sort()] as [string, string[]]),
    ]);

    expect(Object.fromEntries([...written].sort())).toEqual(Object.fromEntries([...expected].sort()));
  });

  it.each([...PUBLIC_ROOT_POLICY_FILES])('%s is pure: no class, decorator or value import outside src/core', (path) => {
    const file = join(modulesRoot, ...path.split('/'));

    expect(impurities(file, readFileSync(file, 'utf8'), join(sourceRoot, 'core'))).toEqual([]);
  });

  it.each([...PUBLIC_ROOT_POLICY_FILES])('%s is imported by exactly its registered consumers', (path, contract) => {
    const policy = join(modulesRoot, ...path.split('/'));
    const importers = sources
      .filter(({ file, source }) => importedFiles(file, source).includes(policy))
      .map(({ file }) => toModulePath(file))
      .sort();

    expect(importers).toEqual([...contract.consumers].sort());
  });

  it.each([...PUBLIC_ROOT_POLICY_FILES])('%s: every consumer calls the shared decision', (_path, contract) => {
    const silent = contract.consumers.filter((consumer) => {
      const file = join(modulesRoot, ...consumer.split('/'));

      return !callsEntry(file, readFileSync(file, 'utf8'), contract.entry);
    });

    expect(silent).toEqual([]);
  });

  describe('self-test', () => {
    it('finds a copied reason switch, in values and in literal types, and ignores comments and other text', () => {
      const copied = `
        // DEPARTMENT_INACTIVE in a comment does not count
        type Code = 'JOB_TITLE_TOO_LONG' | 'OTHER';
        const label = 'DEPARTMENT_INACTIVE_SOON';
        if (!department.active) errors.push({ column: 'department_code', code: \`DEPARTMENT_INACTIVE\` });
      `;

      expect(reasonLiterals('copy.ts', copied, PLACEMENT_REASON_CODES)).toEqual([
        'DEPARTMENT_INACTIVE',
        'JOB_TITLE_TOO_LONG',
      ]);
    });

    it('calls an impure policy impure, and a type-only or core import pure', () => {
      const root = join(sourceRoot, 'modules', 'organization');
      const impure = `
        import { Injectable } from '@nestjs/common';
        import { OrganizationRepo } from './organization.repo';
        @Injectable() export class Policy {}
      `;
      const pure = `
        import type { JobTitleStatus } from './job-title/job-title.types';
        import { isBusinessDate } from '../../core/business-date';
        export function decide(): boolean { return isBusinessDate('2026-10-20'); }
      `;

      expect(impurities(join(root, 'x.policy.ts'), impure, join(sourceRoot, 'core'))).toEqual([
        'imports @nestjs/common',
        'imports ./organization.repo',
        'class Policy',
        'decorator',
      ]);
      expect(impurities(join(root, 'x.policy.ts'), pure, join(sourceRoot, 'core'))).toEqual([]);
    });

    it('does not count an import or a mention as a call of the shared decision', () => {
      expect(
        callsEntry('a.ts', `import { placementReasons } from './p'; void placementReasons;`, 'placementReasons'),
      ).toBe(false);
      expect(callsEntry('a.ts', `const r = placementReasons(facts);`, 'placementReasons')).toBe(true);
    });
  });
});
