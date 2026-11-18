const base = require('./jest.base.cjs');

// End-to-end smoke: a few business journeys through HTTP, a real PostgreSQL and the worker loops. Runs in band.
module.exports = {
  ...base,
  roots: ['<rootDir>/test/e2e'],
  testRegex: '\.e2e-spec\.ts$',
  testTimeout: 60000,
  // Measures each beforeAll for the timing report.
  testEnvironment: '<rootDir>/test/config/timing-environment.cjs',
  globalSetup: '<rootDir>/test/config/integration-global-setup.ts',
  globalTeardown: '<rootDir>/test/config/integration-global-teardown.ts',
  setupFilesAfterEnv: ['<rootDir>/test/config/integration-setup.cjs'],
  reporters: ['default', ['<rootDir>/test/config/timing-reporter.cjs', { runner: 'e2e' }]],
};
