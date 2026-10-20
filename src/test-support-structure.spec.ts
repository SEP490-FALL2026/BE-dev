import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import * as ts from 'typescript';

/**
 * TEST-HARDEN.1 (test/README.md, docs/rules/module-structure.md): every `test/support/**\/*.ts` is a fixture, builder,
 * fake or harness. At most 400 physical lines, no ledger or exception; no test registration or assertion of its own.
 * Read with the TypeScript parser, not by substring, so SuperTest `.expect(...)`, `RegExp#test`, a method named `it`,
 * strings and comments are allowed.
 */
const projectRoot = process.cwd();
const supportRoot = join(projectRoot, 'test', 'support');
const MAX_SUPPORT_LINES = 400;

/** Jest/Vitest globals that register tests, hooks or assertions, focused and skipped variants included. */
const TEST_GLOBALS = new Set([
  'describe',
  'it',
  'test',
  'expect',
  'beforeAll',
  'beforeEach',
  'afterAll',
  'afterEach',
  'fdescribe',
  'fit',
  'xdescribe',
  'xit',
  'xtest',
  'suite',
  'bench',
]);
/** Modules that register tests or assert. */
const TEST_MODULES = new Set([
  '@jest/globals',
  'vitest',
  '@vitest/expect',
  'chai',
  'assert',
  'assert/strict',
  'node:assert',
  'node:assert/strict',
  'node:test',
  'expect',
  'jest-each',
  'should',
  'power-assert',
]);
const GLOBAL_OBJECTS = new Set(['globalThis', 'global', 'window', 'self']);
/** File names the test runners would discover, or that read as a spec. */
const SPEC_LIKE_NAME = /(?:[.-](?:spec|test)|\.e2e-spec|\.integration-spec)\.[cm]?[jt]sx?$/;

/** True for an identifier that names something (a property, a declaration, a type) rather than referring to a value. */
function isNameOnly(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
  if (ts.isQualifiedName(parent) || ts.isTypeReferenceNode(parent) || ts.isTypeQueryNode(parent)) return true;
  if (ts.isBindingElement(parent)) return parent.propertyName === node || parent.name === node;
  if (ts.isPropertyAssignment(parent)) return parent.name === node;
  if (
    (ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isVariableDeclaration(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isEnumMember(parent) ||
      ts.isEnumDeclaration(parent)) &&
    parent.name === node
  )
    return true;
  return (
    ts.isImportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    ts.isNamespaceImport(parent) ||
    ts.isExportSpecifier(parent)
  );
}

const moduleOf = (node: ts.Node): string | null => {
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) return node.moduleSpecifier.text;
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    const expression = node.moduleReference.expression;
    return ts.isStringLiteral(expression) ? expression.text : null;
  }
  if (
    ts.isCallExpression(node) &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
    node.arguments[0] &&
    ts.isStringLiteralLike(node.arguments[0])
  )
    return node.arguments[0].text;
  return null;
};

/** Every reason this support source breaks the rule, with its line; empty when it is a clean fixture/harness. */
export function supportViolations(fileName: string, source: string): string[] {
  const found: string[] = [];
  const lines = source.split(/\r?\n/).length - (source.endsWith('\n') ? 1 : 0);
  if (lines > MAX_SUPPORT_LINES) found.push(`${lines} lines (max ${MAX_SUPPORT_LINES})`);
  if (SPEC_LIKE_NAME.test(basename(fileName))) found.push('named like a spec');

  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const at = (node: ts.Node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  // A name this file binds itself (a parameter, a destructured field, a variable, a function) is not the test global;
  // only free references are. File-wide on purpose: a local binding can never register a test.
  const declared = new Set<string>();
  const collect = (node: ts.Node): void => {
    if (
      (ts.isParameter(node) ||
        ts.isBindingElement(node) ||
        ts.isVariableDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    )
      declared.add(node.name.text);
    ts.forEachChild(node, collect);
  };
  collect(file);
  const visit = (node: ts.Node): void => {
    const module = moduleOf(node);
    if (module !== null && TEST_MODULES.has(module)) found.push(`line ${at(node)}: imports ${module}`);

    if (ts.isIdentifier(node) && TEST_GLOBALS.has(node.text) && !declared.has(node.text) && !isNameOnly(node))
      found.push(`line ${at(node)}: uses the test global ${node.text}`);
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      GLOBAL_OBJECTS.has(node.expression.text) &&
      TEST_GLOBALS.has(node.name.text)
    )
      found.push(`line ${at(node)}: uses the test global ${node.name.text} through ${node.expression.text}`);
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      GLOBAL_OBJECTS.has(node.expression.text) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      TEST_GLOBALS.has(node.argumentExpression.text)
    )
      found.push(
        `line ${at(node)}: uses the test global ${node.argumentExpression.text} through ${node.expression.text}`,
      );

    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function listSupportFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return listSupportFiles(path);
    return /\.[cm]?[jt]sx?$/.test(entry) ? [path] : [];
  });
}

describe('TEST-HARDEN.1: test/support holds fixtures and harnesses only', () => {
  it('finds the support files it checks', () => {
    expect(listSupportFiles(supportRoot).length).toBeGreaterThan(0);
  });

  it('keeps every support file at or under 400 lines, without a test, hook, assertion or spec-like name', () => {
    const findings = listSupportFiles(supportRoot)
      .map((path) => ({
        file: relative(projectRoot, path).split(sep).join('/'),
        violations: supportViolations(path, readFileSync(path, 'utf8')),
      }))
      .filter((finding) => finding.violations.length > 0);

    expect(findings).toEqual([]);
  });

  it('keeps support files out of every test runner pattern', async () => {
    const configs = await Promise.all(
      ['jest.e2e.cjs', 'jest.integration.cjs'].map(async (name) => {
        const config = (await import(join(projectRoot, 'test', 'config', name))) as { testRegex: string | string[] };
        return config.testRegex;
      }),
    );
    const unit = (
      JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { jest: { testRegex: string } }
    ).jest.testRegex;
    const patterns = [unit, ...configs].flat().map((pattern) => new RegExp(pattern));

    const discovered = listSupportFiles(supportRoot)
      .map((path) => relative(projectRoot, path).split(sep).join('/'))
      .filter((file) => patterns.some((pattern) => pattern.test(file)));
    expect(discovered).toEqual([]);
  });

  describe('the check itself', () => {
    const check = (source: string, name = 'harness.ts') => supportViolations(join(supportRoot, name), source);

    it('accepts SuperTest .expect, RegExp#test, a method or property named it, strings, comments and fakes', () => {
      expect(
        check(
          [
            "import request from 'supertest';",
            '// describe(), it() and expect() in a comment are fine',
            "const text = 'describe it test expect';",
            'export const login = (app: unknown) => request(app as never).post("/x").expect(200);',
            'export const isCode = (value: string) => /^[A-Z]+$/.test(value);',
            'export class Probe { it(): number { return 1; } }',
            'export interface Fixture { test: boolean; expect: string; it: number }',
            'export const fixture = { test: true, it: 1 };',
            'export const probe = new Probe().it();',
            'export const fake = jest.fn();',
            'export function build({ test }: { test: boolean }) { return test; }',
          ].join('\n'),
        ),
      ).toEqual([]);
    });

    it.each([
      ['a describe block', "describe('x', () => undefined);", 'uses the test global describe'],
      ['a focused test', "it.only('x', () => undefined);", 'uses the test global it'],
      ['a parameterised test', "test.each([1])('x', () => undefined);", 'uses the test global test'],
      ['an assertion', 'expect(1).toBe(1);', 'uses the test global expect'],
      ['a hook', 'afterAll(() => undefined);', 'uses the test global afterAll'],
      ['a skipped variant', "xit('x', () => undefined);", 'uses the test global xit'],
      ['an imported assertion library', "import { strict } from 'node:assert';", 'imports node:assert'],
      ['Jest globals imported', "import { expect } from '@jest/globals';", 'imports @jest/globals'],
      ['a required assertion library', "const chai = require('chai');", 'imports chai'],
    ])('rejects %s', (_case, source, reason) => {
      expect(check(source).join('\n')).toContain(reason);
    });

    it.each([
      ['an alias of a global', 'const register = it; register("x", () => undefined);'],
      ['a global passed as a value', 'export const runner = [describe];'],
      ['a shorthand property', 'export const api = { it };'],
      ['access through globalThis', 'globalThis.describe("x", () => undefined);'],
      ['access through global by name', 'global["it"]("x", () => undefined);'],
    ])('rejects the workaround %s', (_case, source) => {
      expect(check(source)).not.toEqual([]);
    });

    it('rejects a support file named like a spec, and one over 400 lines', () => {
      expect(check('export const x = 1;', 'helper.spec.ts')).toEqual(['named like a spec']);
      expect(check('export const x = 1;', 'helper.integration-spec.ts')).toEqual(['named like a spec']);
      expect(check(`${'// line\n'.repeat(400)}export const x = 1;\n`)).toEqual(['401 lines (max 400)']);
      expect(check(`${'// line\n'.repeat(399)}export const x = 1;\n`)).toEqual([]);
    });
  });
});
