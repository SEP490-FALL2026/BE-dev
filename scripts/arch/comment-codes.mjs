// `node scripts/arch/comment-codes.mjs [--module <m>] [--summary] [--kept]`: prints the internal codes that comments of `src` carry
// (Task 6.3 of be-architecture-readability-hardening). It prints and exits 0: it is not a gate, because a code that looks like a finding
// can be a business code (`G1`-`G5`, `K1`-`K5`, `T1`-`T6`), so a person reads each line.
//
// A comment says why the code is what it is. The codes it may keep name a requirement or a rule of the business: `US-xx-yy`, `AC-n`,
// `QĐ-n`, `FR-n`, `INV-n`, `SoD-n`, `ADR-n`, `BR-n`, `BM-nn`, `OI-nn`, and the business groups `G1`-`G5`, `K1`-`K5`, `T1`-`T6`.
// The codes it must not keep name a finding, a slice or a prompt of the work that wrote it (`F13`, `T-11`, `E1`, `P23-RV`, `GATE.2`,
// `H6.4`...): a reader of the code has no way to resolve them, so the comment gives the reason in a sentence instead.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, sep } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const args = process.argv.slice(2);
const moduleIndex = args.indexOf('--module');
const only = moduleIndex === -1 ? null : args[moduleIndex + 1];
const showKept = args.includes('--kept');
const summaryOnly = args.includes('--summary');
const srcRoot = join(process.cwd(), 'src');

/** Codes a comment may keep: a requirement, a rule or a business code. */
export const KEPT = [
  /\bUS-\d{2}-\d{2}\b/g,
  /\bAC-\d+\b/g,
  /\bQĐ-\d+[a-z]*(?:\([^)]*\))?/g,
  /\bFR-\d+(?:\.\d+)*\b/g,
  /\bNFR-[\w.-]+\b/g,
  /\bINV-\d+\b/g,
  /\bSoD-\d+\b/g,
  /\bADR-\d{4}\b/g,
  /\bBR-\d+(?:\.\d+)*\b/g,
  /\bBM-\d{2}\b/g,
  /\bOI-\d+[a-z]?\b/g,
  /\bG[1-5]\b/g,
  /\bK[1-5]\b/g,
  /\bT[1-6]\b/g,
];

/** Codes a comment must not keep: a finding, a slice, a review item, a prompt or a gate of the work. */
export const WORK_CODES = [
  /\b(?:F-?|LD-R|LD-|OD-R|OD-A|AR-|AT-|TG-|D-|H|CP|RV-|OQ-)\d+[a-z]?(?:[.-][A-Za-z0-9]+)*\b/g,
  // an Owner decision of the work (`E3 = C`, `Owner decision E4`); a bare `E1` is usually the code of a person in a fixture
  /\bE\d{1,2}\b(?=\s*=\s*[A-Z]\b)/g,
  /\b(?:Owner decision|decision) E\d{1,2}\b/g,
  // a slice or a prompt (P28-07, P23-RV-01); the four-digit codes of Prisma (P2002) are not
  /\bP\d{2}(?:-[A-Za-z]*\d*)*\b/g,
  /\bT-\d+\b/g,
  /\b[A-Z]{1,6}\d?-RV-\d+\b/g,
  /\bR-\d+\b/g,
  /\bA4-\d+\b/g,
  /\b(?:GATE|ROOT|ROOT-HARDEN|TEST-HARDEN|BEH|DB|API-DOC|API-LIST-DETAIL|OPENAPI-EXAMPLE|INF|AUTH)\.\d+(?:-[A-Z0-9]+)?\b/g,
  /\bOPENAPI-EXAMPLE\.\d+(?:-F\d)?\b/g,
  /\bH7-[A-Z]+(?:-[A-Z]*\d+)?\b/g,
  /\bL\.\d+\b/g,
  /\bspec\s+[A-L]\b/g,
  /\b(?:Prompt|prompt)\s+\d+[A-Z]?\b/g,
  /\b(?:Wave|Slice|slice)\s+\d+[a-z]?\b/g,
  /\bTask\s+\d+\.\d+[a-z]?\b/g,
];

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === 'generated' ? [] : sourceFiles(path);

    return path.endsWith('.ts') ? [path] : [];
  });
}

/** Every comment of a file with the line it starts on. */
function commentsOf(text) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text);
  const found = [];
  let kind = scanner.scan();
  while (kind !== ts.SyntaxKind.EndOfFileToken) {
    if (kind === ts.SyntaxKind.SingleLineCommentTrivia || kind === ts.SyntaxKind.MultiLineCommentTrivia) {
      found.push({ pos: scanner.getTokenStart(), text: scanner.getTokenText() });
    }
    kind = scanner.scan();
  }

  return found;
}

const lineOf = (text, pos) => text.slice(0, pos).split('\n').length;

const flagged = [];
const kept = new Map();
const perModule = new Map();
for (const file of sourceFiles(srcRoot)) {
  const path = relative(srcRoot, file).split(sep).join('/');
  const parts = path.split('/');
  const module = parts[0] === 'modules' ? parts[1] : parts[0];
  if (only && module !== only) continue;
  const text = readFileSync(file, 'utf8');
  for (const comment of commentsOf(text)) {
    const startLine = lineOf(text, comment.pos);
    comment.text.split(/\r?\n/).forEach((line, index) => {
      const keptHere = KEPT.flatMap((pattern) => [...line.matchAll(pattern)].map((match) => match[0]));
      for (const code of keptHere) kept.set(code, (kept.get(code) ?? 0) + 1);
      // what a kept pattern covers is not read again as a work code (`QĐ-87a` holds `D-87a` as a substring)
      const rest = KEPT.reduce((value, pattern) => value.replace(pattern, ' '), line);
      const codes = WORK_CODES.flatMap((pattern) => [...rest.matchAll(pattern)].map((match) => match[0]));
      if (codes.length === 0) return;
      flagged.push({
        path: `${path}:${startLine + index}`,
        codes: [...new Set(codes)],
        line: line.trim().slice(0, 140),
      });
      perModule.set(module, (perModule.get(module) ?? 0) + codes.length);
    });
  }
}

if (!summaryOnly) for (const entry of flagged) console.log(`${entry.path}: [${entry.codes.join(', ')}] ${entry.line}`);
if (showKept) for (const [code, count] of [...kept].sort((a, b) => b[1] - a[1])) console.log(`kept ${code} x${count}`);
const total = [...perModule.values()].reduce((sum, count) => sum + count, 0);
console.log(`${total} work code(s) in ${flagged.length} comment line(s)${only ? ` of module ${only}` : ''}`);
if (!only)
  for (const [module, count] of [...perModule].sort((a, b) => b[1] - a[1])) console.log(`  ${module}: ${count}`);
