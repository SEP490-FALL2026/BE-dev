const base = require('./jest.base.cjs');

// Main-flow suite (E2E-FLOWS-01): the five main flows through the real HTTP API, a real sign-in per role, a PostgreSQL of its own
// seeded once per run with the demo dataset, and a Date the test controls. Runs in band: the clock is the Date of the process and
// one cluster serves every file. Not part of `pnpm check` and not run on every PR: it runs in the `flows` job of .github/workflows/nightly.yml
// (Sunday 02:00 Vietnam time, or by hand) and locally (spec e2e-main-flows-suite, OQ-E2E-1).
module.exports = {
  ...base,
  roots: ['<rootDir>/test/flows'],
  testRegex: '\.flow-spec\.ts$',
  testTimeout: 120000,
  testEnvironment: '<rootDir>/test/config/timing-environment.cjs',
  globalSetup: '<rootDir>/test/config/flows-global-setup.ts',
  globalTeardown: '<rootDir>/test/config/flows-global-teardown.ts',
  setupFilesAfterEnv: ['<rootDir>/test/config/integration-setup.cjs'],
  reporters: ['default', ['<rootDir>/test/config/timing-reporter.cjs', { runner: 'flows' }]],
};
