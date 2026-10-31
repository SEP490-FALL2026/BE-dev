const base = require('./jest.base.cjs');

// Real PostgreSQL (and later S3-compatible storage). Never mocks the boundary under test.
// H7-RUN-01: the committed migrations are deployed once per run into a template that every suite copies.
// Each file owns its own database, so files run in parallel; files that share cluster-wide state live in
// test/integration/_serial and run in band through jest.integration-serial.cjs; files that bound wall-clock time are
// *.timing-spec.ts and run in band through jest.integration-timing.cjs.
module.exports = {
  ...base,
  roots: ['<rootDir>/test/integration'],
  testRegex: '\.integration-spec\.ts$',
  testPathIgnorePatterns: ['/node_modules/', '/test/integration/_serial/'],
  testTimeout: 30000,
  // Measures each beforeAll for the timing report (inherited by the timing and _serial runners).
  testEnvironment: '<rootDir>/test/config/timing-environment.cjs',
  // Half the cores of a developer machine (the test server shares them); CI passes --maxWorkers=2.
  maxWorkers: '50%',
  globalSetup: '<rootDir>/test/config/integration-global-setup.ts',
  globalTeardown: '<rootDir>/test/config/integration-global-teardown.ts',
  setupFilesAfterEnv: ['<rootDir>/test/config/integration-setup.cjs'],
  reporters: ['default', ['<rootDir>/test/config/timing-reporter.cjs', { runner: 'integration' }]],
};
