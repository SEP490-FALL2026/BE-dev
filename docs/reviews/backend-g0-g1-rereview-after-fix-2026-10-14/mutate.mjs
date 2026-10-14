// Targeted mutations against the a8ba88f fixes, on an isolated clone only.
// Usage: node mutate.mjs <cloneRoot> <adminUrl> <outJson>
// Each mutation: copy original -> apply one textual change -> run the named tests -> restore the exact
// bytes and verify the hash. A mutation that leaves every named test green is a coverage finding.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const [root, adminUrl, outFile] = process.argv.slice(2);
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const AUTH_INT = 'test/integration/auth-http.integration-spec.ts';
const ACC_INT = 'test/integration/account-management-http.integration-spec.ts';

const mutations = [
  {
    id: 'R1', file: 'package.json', finding: 'R-01',
    from: 'pnpm prisma:validate && pnpm prisma:generate && pnpm lint', to: 'pnpm lint && pnpm prisma:validate && pnpm prisma:generate',
    what: 'check lints before generating the Prisma client again',
    tests: [['scripts', 'scripts/verify/check-script-order.test.mjs']],
  },
  {
    id: 'R2a', file: 'src/infrastructure/database/transaction-runner.ts', finding: 'R-02',
    from: "  'Query read timeout',\n", to: '',
    what: '"Query read timeout" no longer recognised as transient',
    tests: [['unit', 'src/infrastructure/database'], ['integration', 'test/integration/database-unavailable.integration-spec.ts']],
  },
  {
    id: 'R2b', file: 'src/infrastructure/database/prisma.service.ts', finding: 'R-02',
    from: "      query_timeout: config.get('DB_QUERY_TIMEOUT_MS', { infer: true }),\n", to: '',
    what: 'pool built without query_timeout',
    tests: [['integration', 'test/integration/database-unavailable.integration-spec.ts']],
  },
  {
    id: 'R2c', file: 'src/modules/identity-access/account-management.http-errors.ts', finding: 'R-02',
    from: 'if (error instanceof TransientDatabaseError || toTransientError(error)) {', to: 'if (error instanceof TransientDatabaseError) {',
    what: 'admin routes no longer map a raw driver timeout to 503',
    tests: [['unit', 'src/modules/identity-access/account-management.http-errors.spec.ts']],
  },
  {
    id: 'R3a', file: 'src/modules/identity-access/account-management.service.ts', finding: 'R-03',
    from: 'if (matches.length < CANDIDATE_PAGE_SIZE) break;', to: 'break;',
    what: 'candidates read a single page again',
    tests: [['integration', 'test/integration/account-candidates.integration-spec.ts']],
  },
  {
    id: 'R3b', file: 'src/modules/identity-access/account-management.service.ts', finding: 'R-03',
    from: 'after = matches[matches.length - 1].employeeCode;', to: 'after = matches[matches.length - 2]?.employeeCode;',
    what: 'keyset cursor lags one row (pages overlap)',
    tests: [['integration', 'test/integration/account-candidates.integration-spec.ts']],
  },
  {
    id: 'R4a', file: 'src/modules/identity-access/token.service.ts', finding: 'R-04',
    from: 'if (!isUuid(payload.sub) || !isUuid(payload.sid)) throw new InvalidAccessTokenError();',
    to: "if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') throw new InvalidAccessTokenError();",
    what: 'claims checked as strings only (pre-fix)',
    tests: [['unit', 'src/modules/identity-access/token.service.spec.ts'], ['integration', AUTH_INT]],
  },
  {
    id: 'R4b', file: 'src/modules/identity-access/jwt-access-token.verifier.ts', finding: 'R-04',
    from: 'if (toTransientError(error)) throw new TokenVerificationUnavailableError(error);\n      throw error;',
    to: 'throw new TokenVerificationUnavailableError(error);',
    what: 'verifier turns every error into 503 again (pre-fix)',
    tests: [['unit', 'src/modules/identity-access/jwt-access-token.verifier.spec.ts']],
  },
  {
    id: 'R5a', file: 'src/modules/identity-access/account-management.service.ts', finding: 'R-05',
    from: '    return this.employeeHasNotLeft(employeeId);\n  }', to: '    return true;\n  }',
    what: 'dispatcher callback ignores a TERMINATED employee',
    tests: [['integration', ACC_INT]],
  },
  {
    id: 'R5b', file: 'src/modules/identity-access/account-management.service.ts', finding: 'R-05',
    from: '          token.expiresAt > new Date() &&\n          (await this.employeeHasNotLeft(record.employeeId)),',
    to: '          token.expiresAt > new Date(),',
    what: 'detail usable ignores a TERMINATED employee',
    tests: [['integration', ACC_INT]],
  },
  {
    id: 'R6a', file: 'src/modules/identity-access/auth.service.ts', finding: 'R-06',
    from: '      await this.recordFailure(organization.id, keyHash);\n      throw new InvalidCredentialsError();',
    to: '      throw new InvalidCredentialsError();',
    what: 'wrong attempts are never counted',
    tests: [['integration', AUTH_INT]],
  },
  {
    id: 'R6b', file: 'src/modules/identity-access/auth.service.ts', finding: 'R-06',
    from: '    // Everything CPU-heavy happens before the transaction (lock protocol rule 3).\n',
    to: '    await this.recordFailure(organization.id, keyHash);\n',
    what: 'every attempt is counted before the password check (the pre-fix behaviour R-06 forbids)',
    tests: [['integration', AUTH_INT]],
  },
  {
    id: 'R6c', file: 'src/modules/identity-access/auth.service.ts', finding: 'R-06',
    from: '      await this.repo.clearThrottle(tx, organization.id, keyHash);\n', to: '',
    what: 'a successful sign-in no longer clears the counter',
    tests: [['integration', AUTH_INT]],
  },
  {
    id: 'R7a', file: 'src/infrastructure/security/rate-limit.options.ts', finding: 'R-07',
    from: "      limit: config.get('RATE_LIMIT_LIMIT', { infer: true }),",
    to: "      limit: config.get('RATE_LIMIT_LIMIT', { infer: true }),\n      generateKey: (_context, tracker) => tracker,",
    what: 'one budget per IP across all routes',
    tests: [['e2e', 'test/e2e/rate-limit.e2e-spec.ts']],
  },
  {
    id: 'R7b', file: 'src/bootstrap.ts', finding: 'R-07',
    from: "    config.get('TRUST_PROXY_HOPS', { infer: true }),\n  );", to: '    true,\n  );',
    what: 'X-Forwarded-For trusted without a configured proxy',
    tests: [['e2e', 'test/e2e/rate-limit.e2e-spec.ts']],
  },
  {
    id: 'R8', file: 'src/modules/identity-access/account-management.service.ts', finding: 'R-08',
    from: 'if (stopsLocking(await this.repo.effectiveRoles(appUserId, tx))) throw new SuperAdminHolderNotLockableError();',
    to: '/* mutated: SUPER_ADMIN holder check removed */',
    what: 'service no longer refuses to lock the SUPER_ADMIN holder (was M2, survived at 64073c4)',
    tests: [['unit', 'src/modules/identity-access'], ['integration', ACC_INT]],
  },
];

const configs = { unit: [], e2e: ['--config', './test/config/jest.e2e.cjs'], integration: ['--config', './test/config/jest.integration.cjs'] };
const out = [];
for (const m of mutations) {
  const path = join(root, m.file);
  const original = readFileSync(path);
  const text = original.toString('utf8').replace(/\r\n/g, '\n');
  if (!text.includes(m.from)) {
    out.push({ id: m.id, finding: m.finding, what: m.what, applied: false });
    console.log(`${m.id} NOT APPLIED (pattern missing)`);
    continue;
  }
  writeFileSync(path, text.replace(m.from, m.to));
  const runs = [];
  for (const [kind, target] of m.tests) {
    const started = Date.now();
    const r =
      kind === 'scripts'
        ? spawnSync(process.execPath, ['--test', target], { cwd: root, encoding: 'utf8' })
        : spawnSync(process.execPath, [join(root, 'node_modules/jest/bin/jest.js'), ...configs[kind], '--runInBand', target], {
            cwd: root, env: { ...process.env, TEST_DATABASE_ADMIN_URL: adminUrl }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 600000,
          });
    const all = `${r.stderr}${r.stdout}`;
    const tests = /Tests:\s+(.*)/.exec(all)?.[1] ?? /# fail (\d+)/.exec(all)?.[0] ?? 'n/a';
    const failed = [...all.matchAll(/✕ (.+?) \(\d+ ms\)/g)].map((x) => x[1]).slice(0, 4);
    runs.push({ kind, target, exit: r.status, tests, failed, seconds: Math.round((Date.now() - started) / 1000) });
  }
  writeFileSync(path, original);
  const restored = sha(readFileSync(path)) === sha(original);
  const killed = runs.some((r) => r.exit !== 0);
  out.push({ id: m.id, finding: m.finding, what: m.what, file: m.file, runs, killed, restored });
  console.log(`${m.id} ${killed ? 'KILLED' : 'SURVIVED'} restored=${restored} ${m.what} :: ${runs.map((r) => `${r.kind}:${r.exit}(${r.tests})`).join(' | ')}`);
}
writeFileSync(outFile, JSON.stringify(out, null, 2));
