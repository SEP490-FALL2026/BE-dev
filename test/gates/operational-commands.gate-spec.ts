import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { COMMANDS } from '../../src/cli/commands';

/**
 * Gate of docs/rules/operational-commands.md: what can be checked in the source of the out-of-HTTP commands. The Nest
 * graphs are checked in module-graph.spec.ts (rules 1 and 3); each command's tests prove its guards and output.
 */
const projectRoot = process.cwd();
const sourceRoot = join(projectRoot, 'src');
const cliRoot = join(sourceRoot, 'cli');
const installationRoot = join(sourceRoot, 'modules', 'installation');
const databaseRolesRoot = join(sourceRoot, 'infrastructure', 'database', 'roles');

/**
 * The entry points of the operational commands: the one command process `src/cli.ts` (`node dist/cli.js <command>`) and
 * each command of its table, in `src/cli/<name>/` (OD-A7). F02, F01 and F19 (g0-g6-final-business-baseline-remediation)
 * added assign-subscription-owner, cost-center-direction and record-super-admin-event.
 */
const COMMAND_ENTRIES = ['cli.ts', ...COMMANDS.map((command) => `cli/${command.name}/${command.name}.command.ts`)];
const COMMAND_FOLDERS = [
  // Everything under src/cli/ is command code: entries, arguments, reports, the password prompt, the CLI Nest modules.
  'cli',
  'modules/installation/inspect',
  'modules/installation/seed',
  'modules/installation/migration-preflight',
  'modules/catalog/subscription-owner-assignment',
  'modules/ai-assist/purge',
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
  'modules/installation/inspect/inspection-cli.module.ts',
  'modules/identity-access/identity-access-local-seed-facade.module.ts',
  'modules/installation/seed/seed-cli.module.ts',
  'modules/installation/migration-preflight/migration-preflight-cli.module.ts',
  'cli/assign-subscription-owner/assign-subscription-owner-cli.module.ts',
  'modules/catalog/subscription-owner-assignment/subscription-owner-assignment-cli.module.ts',
  'cli/ai-purge/ai-purge-cli.module.ts',
  'modules/ai-assist/purge/ai-assist-purge-cli.module.ts',
  'cli/cost-center-direction/cost-center-direction-cli.module.ts',
  'modules/organization/cost-center-direction/cost-center-direction-cli.module.ts',
  'cli/record-super-admin-event/record-super-admin-event-cli.module.ts',
  'modules/personnel/super-admin-event/super-admin-event-cli.module.ts',
];
/**
 * Where the old entries `dist/<alias>.js` are called inside images (OD-A7): every path named here must be an alias of the
 * command table, so no deploy, bootstrap or runbook step can name an entry the build no longer writes.
 */
const ALIAS_CALLERS = [
  'package.json',
  'Dockerfile',
  'docker-compose.prod.yml',
  'scripts/ops/deploy-release.sh',
  'scripts/ops/bootstrap-installation.sh',
  'docs/guides/containers.md',
  'docs/guides/bootstrap-installation.md',
  'docs/guides/seed.md',
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

  // rule 3
  it('no import chain from the API or the worker reaches a command entry, graph or command-only contract', () => {
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

  // rule 4
  it('keeps Prisma, raw SQL and transactions out of command entries and orchestration files', () => {
    const files = [
      join(sourceRoot, 'cli.ts'),
      ...listFiles(cliRoot, isSource),
      ...listFiles(installationRoot, (file) => isSource(file) && !file.endsWith('.repo.ts')),
    ];
    const findings = files
      .map((file) => ({ file: toPath(file), persistence: persistenceIn(readFileSync(file, 'utf8')) }))
      .filter((finding) => finding.persistence.length > 0);

    expect(findings).toEqual([]);
  });

  // rule 2
  it('offers no --force or other bypass option on any command', () => {
    const argumentFiles = listFiles(cliRoot, (file) => isSource(file) && file.endsWith('.arguments.ts'));
    expect(argumentFiles.map(toPath).sort()).toEqual(
      COMMANDS.map((command) => `cli/${command.name}/${command.name}.arguments.ts`).sort(),
    );
    const findings = argumentFiles.filter((file) =>
      /['"`-](?:force|yes|skip-checks?|unsafe)['"`:\s]/i.test(readFileSync(file, 'utf8')),
    );

    expect(findings.map(toPath)).toEqual([]);
  });

  // rule 2
  it('keeps database destruction out of Nest command and installation code', () => {
    const files = [...listFiles(cliRoot, isSource), ...listFiles(installationRoot, isSource)];
    const findings = files.filter((file) =>
      /migrate\s+reset|DROP\s+DATABASE|\bdropdb\b/i.test(readFileSync(file, 'utf8')),
    );
    expect(findings.map(toPath)).toEqual([]);
  });

  it('checks local environment and loopback host before any seed-local spawn', () => {
    const script = readFileSync(join(projectRoot, 'scripts/dev/seed-local.mjs'), 'utf8');
    // `main` alone: the child runner defined after it would put any spawn after the guard in the whole file.
    const start = script.indexOf('export async function main(');
    const main = script.slice(start, script.indexOf('\nclass Refusal', start));
    const guard = main.indexOf('validateLocalSettings(');
    expect(start).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(-1);
    // `main` spawns only through the runner, and creates the runner after the guard.
    expect(main).not.toMatch(/\bspawn(?:Sync)?\(/);
    expect(main.indexOf('createChildRunner')).toBeGreaterThan(guard);
    expect(main.indexOf('runner = ')).toBeGreaterThan(guard);
    expect(script).toContain("settings.NODE_ENV !== 'development'");
    expect(script).toContain("classifyDatabaseUrl(settings.DATABASE_URL) !== 'loopback'");
  });

  // rule 5
  it('commits no password literal in command code, and no known weak default anywhere it could ship', () => {
    const commandFiles = [
      join(sourceRoot, 'cli.ts'),
      ...listFiles(cliRoot, isSource),
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

  // OD-A7
  describe('one command process, and the old entries dist/<alias>.js written from its table', () => {
    const names = COMMANDS.map((command) => command.name);
    const aliases = COMMANDS.map((command) => command.alias);
    const read = (path: string): string => readFileSync(join(projectRoot, path), 'utf8');

    it('gives every command of the table one name, one description and one alias, none shared', () => {
      for (const command of COMMANDS) {
        expect({ name: command.name, valid: /^[a-z][a-z0-9-]*$/.test(command.name) }).toEqual({
          name: command.name,
          valid: true,
        });
        expect({ name: command.name, alias: /^[a-z][a-z0-9-]*-cli$/.test(command.alias) }).toEqual({
          name: command.name,
          alias: true,
        });
        expect({ name: command.name, described: command.description.length > 0 }).toEqual({
          name: command.name,
          described: true,
        });
      }
      expect(new Set(names).size).toBe(names.length);
      expect(new Set(aliases).size).toBe(aliases.length);
      expect(aliases.filter((alias) => names.includes(alias))).toEqual([]);
    });

    it('loads a runnable command for every row', async () => {
      for (const command of COMMANDS) {
        const loaded = await command.load();
        expect({ name: command.name, runnable: typeof loaded.run }).toEqual({
          name: command.name,
          runnable: 'function',
        });
      }
    });

    it('names a command of the table in every alias an image, a script or a runbook calls, and in every pnpm script', () => {
      const called = ALIAS_CALLERS.flatMap((path) =>
        [...read(path).matchAll(/\bdist\/([a-z][a-z0-9-]*-cli)(?:\.js)?\b/g)].map((match) => ({
          path,
          alias: match[1],
        })),
      );
      expect(called.length).toBeGreaterThan(0);
      expect(called.filter(({ alias }) => !aliases.includes(alias))).toEqual([]);

      const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
      const viaCli = Object.entries(scripts)
        .filter(([, script]) => /\bdist\/cli\b/.test(script))
        .map(([key, script]) => ({ key, command: /^node dist\/cli ([a-z][a-z0-9-]*)$/.exec(script)?.[1] }));
      expect(viaCli.filter(({ command }) => command === undefined || !names.includes(command))).toEqual([]);
      // `pnpm ops:<name>` (`pnpm ops:seed`) runs exactly its command; the names of the scripts did not change.
      const scriptOf = (name: string): string => `ops:${name}`;
      expect(names.map((name) => [scriptOf(name), scripts[scriptOf(name)]])).toEqual(
        names.map((name) => [scriptOf(name), `node dist/cli ${name}`]),
      );
    });

    it('writes every alias after nest build, from the table and nowhere else, in the image too', () => {
      const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
      expect(scripts.build).toMatch(/&& nest build && node scripts\/build\/emit-cli-aliases\.mjs$/);

      const emitter = read('scripts/build/emit-cli-aliases.mjs');
      expect(emitter).toContain("join(dist, 'cli', 'commands.js')");
      expect(emitter).toContain("require('./cli.js').run('${name}');");
      // No second list: no alias or command name is spelled in the emitter.
      expect([...names, ...aliases].filter((word) => emitter.includes(`'${word}'`))).toEqual([]);

      // The image build runs `pnpm build`, so its build stage has the emitter before it.
      const dockerfile = read('Dockerfile').replace(/\r\n/g, '\n');
      const buildStage = dockerfile.slice(dockerfile.search(/^FROM \S+ AS build$/m));
      expect(buildStage.indexOf('COPY scripts/build ./scripts/build')).toBeGreaterThan(-1);
      expect(buildStage.indexOf('COPY scripts/build ./scripts/build')).toBeLessThan(
        buildStage.indexOf('RUN pnpm build'),
      );
      // No alias file is kept in src/: the build writes them all.
      expect(aliases.filter((alias) => existsSync(join(sourceRoot, `${alias}.ts`)))).toEqual([]);
    });
  });

  // rule 8
  it('starts child processes in tests only through test/support/cli-process.ts', () => {
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

  // rule 8
  it('the process helper records each child and directory before use and removes them on exit', () => {
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
