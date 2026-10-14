// Targeted mutation testing on an isolated clone. Usage: node mutate.mjs <cloneRoot> <adminUrl>
// Each mutation: copy original -> apply one textual change -> run the named tests -> restore the exact bytes.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const [root, adminUrl] = process.argv.slice(2);
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);

const mutations = [
  {
    id: 'M1', file: 'src/modules/identity-access/jwt-access-token.verifier.ts',
    from: "employeeStatus === null ||\n      employeeStatus === 'TERMINATED'", to: 'employeeStatus === null',
    what: 'guard stops checking employee TERMINATED',
    tests: [['integration', 'test/integration/auth-http.integration-spec.ts']],
  },
  {
    id: 'M2', file: 'src/modules/identity-access/account-management.service.ts',
    from: 'if (stopsLocking(await this.repo.effectiveRoles(appUserId, tx))) throw new SuperAdminHolderNotLockableError();',
    to: '/* mutated: SUPER_ADMIN holder check removed */',
    what: 'service no longer refuses to lock the SUPER_ADMIN holder',
    tests: [['unit', 'src/modules/identity-access'], ['integration', 'test/integration/account-management-http.integration-spec.ts']],
  },
  {
    id: 'M3', file: 'src/modules/identity-access/jwt-access-token.verifier.ts',
    from: "context.status !== 'ACTIVE' ||", to: '',
    what: 'guard stops checking account LOCKED',
    tests: [['integration', 'test/integration/account-management-http.integration-spec.ts']],
  },
  {
    id: 'M4', file: 'src/modules/identity-access/auth.service.ts',
    from: 'if (token.consumedAt !== null) {', to: 'if (token.consumedAt === undefined) {',
    what: 'refresh replay no longer detected',
    tests: [['integration', 'test/integration/auth-http.integration-spec.ts']],
  },
  {
    id: 'M5', file: 'src/infrastructure/security/guards/authorization.guard.ts',
    from: '!required.some((role) => principal.roles.includes(role))', to: 'required.length === 0',
    what: 'RequireRoles accepts any signed-in caller',
    tests: [['e2e', 'test/e2e/app.e2e-spec.ts'], ['integration', 'test/integration/account-management-http.integration-spec.ts']],
  },
  {
    id: 'M6', file: 'src/modules/identity-access/account-policy.ts',
    from: 'return actorAppUserId === targetAppUserId;', to: 'return false;',
    what: 'self-change check disabled',
    tests: [['unit', 'src/modules/identity-access'], ['integration', 'test/integration/account-management-http.integration-spec.ts']],
  },
];

const configs = { unit: [], e2e: ['--config', './test/config/jest.e2e.cjs'], integration: ['--config', './test/config/jest.integration.cjs'] };
const out = [];
for (const m of mutations) {
  const path = join(root, m.file);
  const original = readFileSync(path);
  const text = original.toString('utf8').replace(/\r\n/g, '\n');
  if (!text.includes(m.from)) {
    out.push({ ...m, applied: false });
    console.log(`${m.id} NOT APPLIED (pattern missing)`);
    continue;
  }
  writeFileSync(path, text.replace(m.from, m.to));
  const runs = [];
  for (const [kind, target] of m.tests) {
    const r = spawnSync(process.execPath, [join(root, 'node_modules/jest/bin/jest.js'), ...configs[kind], '--runInBand', target], {
      cwd: root, env: { ...process.env, TEST_DATABASE_ADMIN_URL: adminUrl }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    const tests = /Tests:\s+(.*)/.exec(r.stderr + r.stdout)?.[1] ?? 'n/a';
    runs.push({ kind, target, exit: r.status, tests });
  }
  writeFileSync(path, original);
  const restored = sha(readFileSync(path)) === sha(original);
  const killed = runs.some((r) => r.exit !== 0);
  out.push({ id: m.id, what: m.what, file: m.file, runs, killed, restored });
  console.log(`${m.id} ${killed ? 'KILLED' : 'SURVIVED'} restored=${restored} ${m.what} :: ${runs.map((r) => `${r.kind}:${r.exit}(${r.tests})`).join(' | ')}`);
}
writeFileSync(join(root, '..', 'logs', 'mutation-results.json'), JSON.stringify(out, null, 2));
