// The test taxonomy: one entry per runner. This is the only place that says which directory and
// file suffix belong to which kind of test. `pnpm test:discovery` enforces it and
// test/README.md explains it to people.

export const RUNNERS = [
  {
    name: 'unit',
    roots: ['src'],
    suffix: '.spec.ts',
    config: null,
    command: 'pnpm test',
    jest: true,
    needs: [],
    proves: 'policies, use cases, mappers, pure functions (co-located with the code)',
  },
  {
    name: 'gates',
    roots: ['test/gates'],
    suffix: '.gate-spec.ts',
    config: 'test/config/jest.gates.cjs',
    command: 'pnpm test:gates',
    jest: true,
    needs: [],
    proves: 'static rules over source, OpenAPI, Compose and migrations; never starts the application',
  },
  {
    name: 'http',
    roots: ['test/http'],
    suffix: '.http-spec.ts',
    config: 'test/config/jest.http.cjs',
    command: 'pnpm test:http',
    jest: true,
    needs: [],
    proves: 'HTTP contract through the real Nest app: guards, Zod, envelope, errors, OpenAPI; no database',
  },
  {
    name: 'integration-serial',
    roots: ['test/integration/_serial'],
    suffix: '.integration-spec.ts',
    config: 'test/config/jest.integration-serial.cjs',
    command: 'pnpm test:integration:serial',
    jest: true,
    needs: ['PostgreSQL on localhost; cluster-wide roles, process.env or shared CLI resources (runs in band)'],
    proves: 'H7 database roles, environment isolation and CLI processes that cannot share the cluster with others',
  },
  {
    name: 'integration',
    roots: ['test/integration'],
    exclude: ['test/integration/_serial'],
    suffix: '.integration-spec.ts',
    config: 'test/config/jest.integration.cjs',
    command: 'pnpm test:integration',
    jest: true,
    needs: ['PostgreSQL on localhost (a disposable database is created per file)'],
    proves: 'real PostgreSQL constraints, transactions, locks and races; adapters against real services',
  },
  {
    // Shares the integration directories, told apart by its suffix (ownerOf in test-layout.mjs).
    name: 'integration-timing',
    roots: ['test/integration'],
    exclude: ['test/integration/_serial'],
    suffix: '.timing-spec.ts',
    config: 'test/config/jest.integration-timing.cjs',
    command: 'pnpm test:integration:timing',
    jest: true,
    needs: ['PostgreSQL on localhost; no other test file running (runs in band, after the parallel files)'],
    proves:
      'a call ends within its configured timeout of a few seconds (wall-clock limits: stalls, unavailability, runner timeouts)',
  },
  {
    name: 'e2e',
    roots: ['test/e2e'],
    suffix: '.e2e-spec.ts',
    config: 'test/config/jest.e2e.cjs',
    command: 'pnpm test:e2e',
    jest: true,
    needs: ['PostgreSQL on localhost'],
    proves: 'a few business journeys end to end: HTTP, PostgreSQL and the worker loops together',
  },
  {
    name: 'flows',
    roots: ['test/flows'],
    suffix: '.flow-spec.ts',
    config: 'test/config/jest.flows.cjs',
    command: 'pnpm test:flows',
    jest: true,
    needs: ['PostgreSQL on localhost (one seeded template per run, a clone per file; runs in band)'],
    proves:
      'the five main flows through the real API: a real sign-in per role, the demo dataset and a clock the test controls',
  },
];

// Directories under test/ that hold helpers or configuration and must contain no spec files.
export const SUPPORT_DIRS = ['test/config', 'test/support'];

// A deleted or renamed file in this list fails the discovery check .
export const REQUIRED_SPECS = ['test/http/platform/api-inventory.http-spec.ts'];
