import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

/**
 * Integration files run in parallel on one PostgreSQL cluster, each in a database of its own (test/README.md). These rules
 * keep a file from seeing or touching what another file does at the same time:
 * - a query of `pg_locks` counts only the locks of its own database (`current_database()`) or of one backend (`pid = $n`);
 *   a lock wait of another file must never release a barrier;
 * - only test/integration/_serial (run in band) acts on the whole cluster: H7 roles, the bootstrap superuser;
 * - no test listens on a fixed TCP port (port 0 lets the system choose);
 * - a wall-clock bound (`expect(elapsed).toBeLessThan(...)`) is asserted only in a *.timing-spec.ts, which runs in band:
 *   beside other workers it measures the load of the machine, not the code.
 */
const projectRoot = process.cwd();
const SCANNED = ['test/integration', 'test/e2e', 'test/http', 'test/support'];
const SERIAL = 'test/integration/_serial/';
const CLUSTER_HELPERS = ['test/support/role-separated-database.ts', 'test/support/role-database-prepare.ts'];

interface TestFile {
  path: string;
  source: string;
}

function listFiles(directory: string): string[] {
  return readdirSync(join(projectRoot, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return listFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

/** The string and template literals of a source; comments are not code and do not count. */
function literals(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ' ');
  return [...code.matchAll(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g)].map((match) => match[0]);
}

function unscopedLockQueries(files: TestFile[]): string[] {
  return files.flatMap(({ path, source }) =>
    literals(source)
      .filter((literal) => /\bpg_locks\b/.test(literal))
      .filter((literal) => !/current_database\(\)|\bpid\s*=\s*\$\d/.test(literal))
      .map(() => path),
  );
}

function clusterActionsOutsideSerial(files: TestFile[]): string[] {
  return files
    .filter(({ path }) => !path.startsWith(SERIAL) && !CLUSTER_HELPERS.includes(path))
    .filter(
      ({ source }) =>
        /from\s+['"][./]*(?:support\/)?role-(?:separated-database|database-prepare)['"]/.test(source) ||
        /\bTEST_DATABASE_BOOTSTRAP_URL\b/.test(source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ' ')),
    )
    .map(({ path }) => path);
}

const WALL_CLOCK_BOUND = /expect\(\s*(?:elapsed\b|(?:Date|performance)\.now\(\)\s*-)[^;]*?\)\s*\.toBeLessThan/;

function wallClockBoundsOutsideTiming(files: TestFile[]): string[] {
  return files
    .filter(({ path }) => !path.endsWith('.timing-spec.ts'))
    .filter(({ source }) => WALL_CLOCK_BOUND.test(source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ' ')))
    .map(({ path }) => path);
}

function fixedPorts(files: TestFile[]): string[] {
  return files.filter(({ source }) => /\.listen\(\s*[1-9]\d*/.test(source)).map(({ path }) => path);
}

describe('parallel safety of the integration and e2e suites', () => {
  const files: TestFile[] = SCANNED.flatMap(listFiles).map((path) => ({
    path: path.split(sep).join('/'),
    source: readFileSync(join(projectRoot, path), 'utf8'),
  }));

  it('reads the test files', () => {
    expect(files.filter(({ path }) => path.startsWith('test/integration/')).length).toBeGreaterThan(0);
  });

  it('scopes every pg_locks query to its own database or one backend', () => {
    expect(unscopedLockQueries(files)).toEqual([]);
  });

  it('acts on the whole cluster (H7 roles, the bootstrap superuser) only from test/integration/_serial', () => {
    expect(clusterActionsOutsideSerial(files)).toEqual([]);
  });

  it('never listens on a fixed TCP port', () => {
    expect(fixedPorts(files)).toEqual([]);
  });

  it('bounds wall-clock time only in *.timing-spec.ts (run in band)', () => {
    expect(wallClockBoundsOutsideTiming(files)).toEqual([]);
  });
});

describe('parallel safety rules on synthetic files', () => {
  const file = (path: string, source: string): TestFile => ({ path, source });

  it('flags a cluster-wide pg_locks count and accepts the scoped forms, ignoring comments', () => {
    expect(
      unscopedLockQueries([
        file('test/integration/a.integration-spec.ts', "sql.query('SELECT count(*) FROM pg_locks WHERE NOT granted')"),
        file(
          'test/integration/b.integration-spec.ts',
          'sql.query(`SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid\n WHERE a.datname = current_database()`)',
        ),
        file('test/support/c.ts', "sql.query('SELECT 1 FROM pg_locks WHERE pid = $1 AND NOT granted')"),
        file('test/support/d.ts', '// counts pg_locks of every database'),
      ]),
    ).toEqual(['test/integration/a.integration-spec.ts']);
  });

  it('allows cluster actions in _serial and the two helpers only', () => {
    expect(
      clusterActionsOutsideSerial([
        file('test/integration/x/a.integration-spec.ts', "import { x } from '../../support/role-separated-database';"),
        file('test/integration/_serial/b.integration-spec.ts', 'process.env.TEST_DATABASE_BOOTSTRAP_URL'),
        file('test/support/role-separated-database.ts', 'process.env.TEST_DATABASE_BOOTSTRAP_URL'),
        file('test/integration/x/c.integration-spec.ts', '// TEST_DATABASE_BOOTSTRAP_URL is not read here'),
      ]),
    ).toEqual(['test/integration/x/a.integration-spec.ts']);
  });

  it('flags a fixed port and accepts port 0', () => {
    expect(
      fixedPorts([
        file('test/support/a.ts', 'server.listen(2525)'),
        file('test/support/b.ts', 'server.listen(0, "127.0.0.1")'),
      ]),
    ).toEqual(['test/support/a.ts']);
  });

  it('flags an elapsed-time bound outside a timing spec and ignores other upper bounds', () => {
    expect(
      wallClockBoundsOutsideTiming([
        file('test/integration/a/a.integration-spec.ts', 'expect(Date.now() - started).toBeLessThan(2000 + 1500);'),
        file('test/integration/a/b.integration-spec.ts', 'expect(elapsed).toBeLessThan(QUERY_TIMEOUT_MS + SLACK_MS);'),
        file('test/integration/a/c.timing-spec.ts', 'expect(elapsed).toBeLessThan(QUERY_TIMEOUT_MS + SLACK_MS);'),
        file('test/integration/a/d.integration-spec.ts', 'expect(rows.length).toBeLessThan(10);'),
        file('test/integration/a/e.integration-spec.ts', '// expect(elapsed).toBeLessThan(1000) was too tight'),
      ]),
    ).toEqual(['test/integration/a/a.integration-spec.ts', 'test/integration/a/b.integration-spec.ts']);
  });
});
