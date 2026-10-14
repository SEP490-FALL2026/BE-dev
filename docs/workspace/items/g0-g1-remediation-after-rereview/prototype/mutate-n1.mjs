// Mutations against the N-1/R-02/N-5 prototype (isolated clone only). Usage:
//   node mutate-n1.mjs <cloneRoot> <adminUrl> <out.json>
// Each mutation: apply one textual change -> run the named suites -> restore the exact bytes (hash checked).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const [root, adminUrl, outFile] = process.argv.slice(2);
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const STALL = 'test/integration/database-stall.integration-spec.ts';

const mutations = [
  {
    id: 'N1a', file: 'src/infrastructure/database/pg-pool.ts',
    from: 'return new Pool({ ...config, Client: RetireOnTimeoutClient });', to: 'return new Pool(config);',
    what: 'pool uses the plain pg Client (no retirement after a client-side timeout)',
    tests: [['integration', STALL]],
  },
  {
    id: 'N1b', file: 'src/infrastructure/database/pg-pool.ts',
    from: '      this.end().catch(() => undefined);', to: '      void 0;',
    what: 'a timed-out connection is not ended',
    tests: [['integration', STALL]],
  },
  {
    id: 'N2', file: 'src/infrastructure/database/prisma.service.ts',
    from: "      query_timeout: config.get('DB_QUERY_TIMEOUT_MS', { infer: true }),\n", to: '',
    what: 'pool built without query_timeout (the R-02 budget)',
    tests: [['integration', STALL]],
  },
  {
    id: 'N5', file: 'src/infrastructure/database/transaction-runner.ts',
    from: "  'Client was closed and is not queryable',\n", to: '',
    what: '"Client was closed and is not queryable" no longer transient',
    tests: [['unit', 'src/infrastructure/database']],
  },
  {
    id: 'IDLE', file: 'src/infrastructure/database/prisma.service.ts',
    from: "      idle_in_transaction_session_timeout: config.get('DB_IDLE_IN_TRANSACTION_TIMEOUT_MS', { infer: true }),\n", to: '',
    what: 'server-side idle-in-transaction backstop not sent',
    tests: [['integration', STALL]],
  },
  {
    id: 'DISP', file: 'src/infrastructure/database/prisma.service.ts',
    from: 'new PrismaPg(pool, { disposeExternalPool: true })', to: 'new PrismaPg(pool)',
    what: '$disconnect leaves the service-owned pool open',
    tests: [['integration', STALL]],
  },
  {
    id: 'R3x', file: 'src/modules/organization/organization.repo.ts',
    from: '         AND e.id <> ALL (${[...excludeEmployeeIds]}::uuid[])\n', to: '',
    what: 'candidate query ignores the exclusion list',
    tests: [['integration', 'test/integration/account-candidates.integration-spec.ts']],
  },
  {
    id: 'R3y', file: 'src/modules/organization/organization.repo.ts',
    from: "  return term.replace(/[\\\\%_]/g, (character) => `\\\\${character}`);", to: '  return term;',
    what: 'search term no longer escaped (% and _ act as wildcards again, N-6)',
    tests: [['integration', 'test/integration/rr-candidates-v2.integration-spec.ts']],
  },
  {
    id: 'R3z', file: 'src/modules/organization/organization.repo.ts',
    from: '       ORDER BY e.employee_code, e.id\n', to: '       ORDER BY e.id\n',
    what: 'candidates no longer sorted by employee code',
    tests: [['integration', 'test/integration/account-candidates.integration-spec.ts']],
  },
  {
    id: 'R15', file: 'src/modules/identity-access/me.controller.ts',
    from: '      throw toUnavailableApiException(error) ?? error;', to: '      throw error;',
    what: '/me no longer maps an unreachable database after the guard to 503',
    tests: [['unit', 'src/modules/identity-access/me.controller.spec.ts'], ['integration', 'test/integration/me-unavailable.integration-spec.ts']],
  },
  {
    id: 'R12', file: 'src/infrastructure/health/health.controller.ts',
    from: '      if (!(error instanceof ServiceUnavailableException)) throw error;\n', to: '      throw error;\n',
    what: 'readiness failure keeps the generic server-error code',
    tests: [['unit', 'src/infrastructure/health']],
  },
];

const configs = { unit: [], integration: ['--config', './test/config/jest.integration.cjs'] };
const only = process.env.MUT_ONLY?.split(',');
const out = [];
for (const m of mutations.filter((x) => !only || only.includes(x.id))) {
  const path = join(root, m.file);
  const original = readFileSync(path);
  const text = original.toString('utf8').replace(/\r\n/g, '\n');
  if (!text.includes(m.from)) {
    out.push({ id: m.id, what: m.what, applied: false });
    console.log(`${m.id} NOT APPLIED (pattern missing)`);
    continue;
  }
  writeFileSync(path, text.replace(m.from, m.to));
  const runs = [];
  for (const [kind, target] of m.tests) {
    const r = spawnSync(process.execPath, [join(root, 'node_modules/jest/bin/jest.js'), ...configs[kind], '--runInBand', '--no-color', target], {
      cwd: root, env: { ...process.env, TEST_DATABASE_ADMIN_URL: adminUrl }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 600000,
    });
    const all = `${r.stderr}${r.stdout}`;
    const failed = [...all.matchAll(/● .+? › (.+)/g)].map((x) => x[1].trim());
    runs.push({ kind, target, exit: r.status, tests: /Tests:\s+(.*)/.exec(all)?.[1] ?? 'n/a', failed: [...new Set(failed)] });
  }
  writeFileSync(path, original);
  const restored = sha(readFileSync(path)) === sha(original);
  const killed = runs.some((r) => r.exit !== 0);
  out.push({ id: m.id, what: m.what, file: m.file, runs, killed, restored });
  console.log(`${m.id} ${killed ? 'KILLED' : 'SURVIVED'} restored=${restored} ${m.what} :: ${runs.map((r) => `${r.kind}:${r.exit}(${r.tests}) ${r.failed.join(' | ')}`).join(' || ')}`);
}
writeFileSync(outFile, JSON.stringify(out, null, 2));
