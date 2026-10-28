import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/**
 * Gate of docs/rules/operational-commands.md: what can be checked in the source of the out-of-HTTP commands. The Nest
 * graphs are checked in module-graph.spec.ts (rules 1 and 3); each command's tests prove its guards and output.
 */
const projectRoot = process.cwd();
const sourceRoot = join(projectRoot, 'src');
const installationRoot = join(sourceRoot, 'modules', 'installation');
const databaseRolesRoot = join(sourceRoot, 'infrastructure', 'database', 'roles');

/** The entry points of the operational commands, and the capability folders of the commands that are not legacy. */
const COMMAND_ENTRIES = [
  'installation-cli.ts',
  'recovery-cli.ts',
  'inspect-cli.ts',
  'dev-seed-cli.ts',
  'migration-preflight-cli.ts',
  'database-roles-cli.ts',
  // F02 (g0-g6-final-business-baseline-remediation): the one way an existing subscription gets its owner department.
  'subscription-owner-assignment-cli.ts',
  // F01 (g0-g6-final-business-baseline-remediation, Task 1.1a): the activation and the link of a Cost Center to its department.
  'cost-center-direction-cli.ts',
  // F19 (g0-g6-final-business-baseline-remediation, Task 5.5): the controlled procedure for an event about the Super Admin.
  'super-admin-event-cli.ts',
];
const COMMAND_FOLDERS = [
  'modules/installation/inspect',
  'modules/installation/dev-seed',
  'modules/installation/migration-preflight',
  'modules/catalog/subscription-owner-assignment',
  'modules/organization/cost-center-direction',
  'modules/personnel/super-admin-event',
  // H7: `pnpm ops:db-roles` administers PostgreSQL roles; the API and the worker share only the pure judgement beside
  // their start-up check (infrastructure/database/database-role-judgement.ts), never the provisioning.
  'infrastructure/database/roles',
];
/** Files no API or worker import may reach (rule 3). */
const COMMAND_ONLY_FILES = [
  ...COMMAND_ENTRIES,
  'modules/identity-access/identity-access-inspection-facade.module.ts',
  'modules/installation/inspect/inspection.module.ts',
  'modules/identity-access/identity-access-local-seed-facade.module.ts',
  'modules/installation/dev-seed/dev-seed.module.ts',
  'modules/installation/migration-preflight/migration-preflight.module.ts',
  'subscription-owner-assignment-cli.module.ts',
  'modules/catalog/subscription-owner-assignment/subscription-owner-assignment.module.ts',
  'cost-center-direction-cli.module.ts',
  'modules/organization/cost-center-direction/cost-center-direction.module.ts',
  'super-admin-event-cli.module.ts',
  'modules/personnel/super-admin-event/super-admin-event.module.ts',
];
/** Known weak defaults that must never appear in product code, scripts or the environment template (rule 5). */
const WEAK_DEFAULTS = [/Password123/i, /changeme/i, /admin123/i, /P@ssw0rd/i, /correct horse battery staple/i];

const toPath = (file: string): string => relative(sourceRoot, file).split(sep).join('/');

function listFiles(directory: string, accept: (file: string) => boolean): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === 'generated' ? [] : listFiles(path, accept);
    return accept(path) ? [path] : [];
  });
}

const isSource = (file: string): boolean => file.endsWith('.ts') && !file.endsWith('.spec.ts');

/** Relative module specifiers: `from '…'`, side-effect `import '…'`, dynamic `import('…')` and `require('…')`. */
function relativeSpecifiers(source: string): RegExpMatchArray[] {
  return [...source.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\brequire\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)];
}

/** Every source file a TypeScript import chain from `entry` reaches, static and dynamic imports alike. */
function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    if (file.includes(`${sep}generated${sep}`)) continue;
    const source = readFileSync(file, 'utf8');
    for (const match of relativeSpecifiers(source)) {
      const target = resolve(dirname(file), match[1]);
      pending.push(existsSync(`${target}.ts`) ? `${target}.ts` : join(target, 'index.ts'));
    }
  }
  return new Set([...seen].map(toPath));
}

/** Direct persistence in a file: the Prisma service, raw SQL, a transaction or a model delegate. */
function persistenceIn(source: string): string[] {
  const found: string[] = [];
  if (/\bPrismaService\b/.test(source)) found.push('PrismaService');
  if (/\$(?:queryRaw|executeRaw)(?:Unsafe)?\b/.test(source)) found.push('raw SQL');
  if (/\.\$transaction\(/.test(source)) found.push('$transaction');
  if (
    /\b(?:tx|prisma|client)\.[a-z]\w*\.(?:find\w*|create\w*|update\w*|delete\w*|upsert|count|groupBy|aggregate)\(/.test(
      source,
    )
  )
    found.push('model delegate');
  return found;
}

/** A password-like name given a literal value: `password = '…'`, `credential: "…"`. */
function passwordLiterals(source: string): string[] {
  // A non-empty literal value: `'Password: '` (a prompt ending at its own quote) is not one.
  return [...source.matchAll(/\b(\w*(?:password|passphrase|credential)\w*)\s*[:=]\s*['"`][^'"`\n]+['"`]/gi)].map(
    (match) => match[1],
  );
}

describe('operational commands (docs/rules/operational-commands.md)', () => {
  it('knows every entry point and capability folder it checks', () => {
    for (const entry of COMMAND_ENTRIES)
      expect({ entry, exists: existsSync(join(sourceRoot, entry)) }).toEqual({ entry, exists: true });
    for (const folder of COMMAND_FOLDERS)
      expect({ folder, exists: existsSync(join(sourceRoot, folder)) }).toEqual({ folder, exists: true });
  });

  it('rule 3: no import chain from the API or the worker reaches a command entry, graph or command-only contract', () => {
    for (const root of ['main.ts', 'worker.ts']) {
      const reachable = reachableFrom(join(sourceRoot, root));

      expect({ root, reached: COMMAND_ONLY_FILES.filter((file) => reachable.has(file)) }).toEqual({
        root,
        reached: [],
      });
      expect({
        root,
        reached: [...reachable].filter((file) => COMMAND_FOLDERS.some((folder) => file.startsWith(`${folder}/`))),
      }).toEqual({ root, reached: [] });
    }
  });

  it('rule 4: keeps Prisma, raw SQL and transactions out of command entries and orchestration files', () => {
    const files = [
      ...COMMAND_ENTRIES.map((entry) => join(sourceRoot, entry)),
      ...listFiles(installationRoot, (file) => isSource(file) && !file.endsWith('.repo.ts')),
    ];
    const findings = files
      .map((file) => ({ file: toPath(file), persistence: persistenceIn(readFileSync(file, 'utf8')) }))
      .filter((finding) => finding.persistence.length > 0);

    expect(findings).toEqual([]);
  });

  it('rule 2: offers no --force or other bypass option on any command', () => {
    const argumentFiles = [
      ...listFiles(installationRoot, (file) => isSource(file) && file.endsWith('.arguments.ts')),
      join(sourceRoot, 'modules', 'identity-access', 'recovery', 'recovery.arguments.ts'),
      join(databaseRolesRoot, 'database-roles.arguments.ts'),
    ];
    const findings = argumentFiles.filter((file) =>
      /['"`-](?:force|yes|skip-checks?|unsafe)['"`:\s]/i.test(readFileSync(file, 'utf8')),
    );

    expect(findings.map(toPath)).toEqual([]);
  });

  it('rule 2: the seed checks its three local guards before it opens any transaction', () => {
    const service = readFileSync(join(installationRoot, 'dev-seed', 'dev-seed.service.ts'), 'utf8');
    const guard = readFileSync(join(installationRoot, 'dev-seed', 'local-seed.guard.ts'), 'utf8');
    const seedBody = service.slice(service.indexOf('async seed('));

    expect(seedBody.indexOf('checkLocalSeedGuards(')).toBeGreaterThan(-1);
    expect(seedBody.indexOf('checkLocalSeedGuards(')).toBeLessThan(seedBody.indexOf('this.runner.run('));
    expect(seedBody.indexOf('if (refusal !== null) return')).toBeLessThan(seedBody.indexOf('this.runner.run('));
    // Each guard is its own check on a parsed value, not a substring of the URL.
    expect(guard).toMatch(/LOCAL_ENVIRONMENTS\.has\(input\.nodeEnv\)/);
    expect(guard).toMatch(/classifyDatabaseUrl\(input\.databaseUrl\)/);
    expect(guard).toMatch(/input\.confirmLocal \? null/);
    expect(guard).not.toMatch(/\.includes\(['"]localhost/);
  });

  it('rule 5: commits no password literal in command code, and no known weak default anywhere it could ship', () => {
    const commandFiles = [
      ...COMMAND_ENTRIES.map((entry) => join(sourceRoot, entry)),
      ...listFiles(installationRoot, isSource),
      ...listFiles(databaseRolesRoot, isSource),
    ];
    expect(
      commandFiles
        .map((file) => ({ file: toPath(file), names: passwordLiterals(readFileSync(file, 'utf8')) }))
        .filter((finding) => finding.names.length > 0),
    ).toEqual([]);

    const shipped = [
      ...listFiles(sourceRoot, isSource),
      ...listFiles(join(projectRoot, 'scripts'), (file) => /\.(?:m?js|ts)$/.test(file) && !/\.test\.m?js$/.test(file)),
      join(projectRoot, '.env.example'),
      join(projectRoot, 'package.json'),
    ];
    const weak = shipped.filter((file) => WEAK_DEFAULTS.some((pattern) => pattern.test(readFileSync(file, 'utf8'))));
    expect(weak.map((file) => relative(projectRoot, file).split(sep).join('/'))).toEqual([]);
  });

  it('rule 8: starts child processes in tests only through test/support/cli-process.ts', () => {
    // migration-deploy.ts: the harness's one Prisma CLI runner (H7-RUN-01), split from disposable-database.ts.
    const allowed = new Set([
      'test/support/cli-process.ts',
      'test/support/disposable-database.ts',
      'test/support/migration-deploy.ts',
    ]);
    const tests = [
      ...listFiles(join(projectRoot, 'test'), (file) => file.endsWith('.ts')),
      ...listFiles(sourceRoot, (file) => file.endsWith('.spec.ts')),
    ];
    const findings = tests
      .map((file) => relative(projectRoot, file).split(sep).join('/'))
      .filter((file) => !allowed.has(file))
      .filter((file) => /['"](?:node:)?child_process['"]/.test(readFileSync(join(projectRoot, file), 'utf8')));

    expect(findings).toEqual([]);
  });

  it('rule 8: the process helper records each child and directory before use and removes them on exit', () => {
    const helper = readFileSync(join(projectRoot, 'test', 'support', 'cli-process.ts'), 'utf8');

    expect(helper).toMatch(/process\.once\('exit'/);
    expect(helper.indexOf('running.add(child)')).toBeGreaterThan(helper.indexOf('spawn('));
    expect(helper.indexOf('running.add(child)')).toBeLessThan(helper.indexOf("child.on('close'"));
    expect(helper).toMatch(/directories\.add\(directory\);\s*return directory;/);
  });

  describe('the checks themselves', () => {
    it('follows every import form, side-effect and require included', () => {
      const source = [
        "import { A } from './a';",
        "import './b';",
        "const { C } = await import('./c');",
        "const d = require('../d');",
        "import { E } from '@nestjs/common';",
      ].join('\n');

      expect(relativeSpecifiers(source).map((match) => match[1])).toEqual(['./a', './b', './c', '../d']);
    });

    it('finds direct persistence in a sample, and none in plain orchestration', () => {
      expect(persistenceIn('constructor(private readonly prisma: PrismaService) {}')).toEqual(['PrismaService']);
      expect(persistenceIn('await tx.$executeRaw`SELECT 1`')).toEqual(['raw SQL']);
      expect(persistenceIn('await tx.employee.create({ data })')).toEqual(['model delegate']);
      expect(persistenceIn('await this.organization.createDepartment(tx, input)')).toEqual([]);
    });

    it('finds a password literal, and not a prompt or a generated value', () => {
      expect(passwordLiterals("const password = 'Password123!';")).toEqual(['password']);
      expect(passwordLiterals("{ defaultCredential: 'x' }")).toEqual(['defaultCredential']);
      expect(passwordLiterals("readHiddenLine(stdin, stdout, 'Password: ')")).toEqual([]);
      expect(passwordLiterals("readHiddenLine(stdin, stdout, 'Repeat password: ');")).toEqual([]);
      expect(passwordLiterals('const password = generate();')).toEqual([]);
    });
  });
});
