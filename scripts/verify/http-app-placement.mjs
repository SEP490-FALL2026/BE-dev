// TEST-R1 (C1): an HTTP contract spec builds its Nest application once per file or describe, never per test case.
// Flags a call to Test.createTestingModule / createHttpContractApp, or to a function of the same file that makes one,
// when it runs inside it/test (and .each), beforeEach or afterEach. Used by `pnpm test:discovery`.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const BUILDERS = new Set(['createTestingModule', 'createHttpContractApp']);
const PER_TEST = new Set(['it', 'test', 'beforeEach', 'afterEach']);

/** Name of the jest hook/test a call expression is (`it`, `it.each(...)`, `test.only` …), or null. */
function jestCallName(node) {
  let callee = node.expression;
  if (ts.isCallExpression(callee)) callee = callee.expression; // it.each(table)(name, fn)
  while (ts.isPropertyAccessExpression(callee)) {
    if (ts.isIdentifier(callee.expression)) return callee.expression.text;
    callee = callee.expression;
  }
  return ts.isIdentifier(callee) ? callee.text : null;
}

function calledName(node) {
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}

export function perTestAppProblems(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  // Functions of this file that build an application (one level of indirection, e.g. `appFor`, `startApp`).
  const builders = new Set(BUILDERS);
  const visitDecl = (node) => {
    const name =
      (ts.isFunctionDeclaration(node) && node.name?.text) ||
      (ts.isVariableDeclaration(node) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) &&
        ts.isIdentifier(node.name) &&
        node.name.text);
    if (name) {
      let builds = false;
      const scan = (n) => {
        if (ts.isCallExpression(n) && BUILDERS.has(calledName(n) ?? '')) builds = true;
        ts.forEachChild(n, scan);
      };
      scan(node);
      if (builds) builders.add(name);
    }
    ts.forEachChild(node, visitDecl);
  };
  visitDecl(source);

  const problems = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && builders.has(calledName(node) ?? '')) {
      for (let up = node.parent; up; up = up.parent) {
        if (!ts.isCallExpression(up)) continue;
        const hook = jestCallName(up);
        if (hook === 'beforeAll' || hook === 'afterAll' || hook === 'describe') break;
        if (hook && PER_TEST.has(hook)) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart());
          problems.push(`${file}:${line + 1}: ${calledName(node)}() runs inside ${hook}(); build the app in beforeAll`);
          break;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return problems;
}
