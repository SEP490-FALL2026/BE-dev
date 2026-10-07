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
    name: 'e2e',
    roots: ['test/e2e'],
    suffix: '.e2e-spec.ts',
    config: 'test/config/jest.e2e.cjs',
    command: 'pnpm test:e2e',
    jest: true,
    needs: [],
    proves: 'HTTP contract through the real Nest app: guards, Zod, envelope, errors, OpenAPI; external ports stubbed',
  },
  {
    name: 'integration',
    roots: ['test/integration'],
    suffix: '.integration-spec.ts',
    config: 'test/config/jest.integration.cjs',
    command: 'pnpm test:integration',
    jest: true,
    needs: ['PostgreSQL on localhost (a disposable database is created per run)'],
    proves: 'real PostgreSQL constraints, transactions, locks and races; adapters against real services',
  },
];

// Directories under test/ that hold helpers or configuration and must contain no spec files.
export const SUPPORT_DIRS = ['test/config', 'test/support'];

// A deleted or renamed file in this list fails the discovery check .
export const REQUIRED_SPECS = ['test/e2e/api-inventory.e2e-spec.ts'];
