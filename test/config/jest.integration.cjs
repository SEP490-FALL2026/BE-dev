const base = require('./jest.base.cjs');

// Real PostgreSQL (and later S3-compatible storage). Never mocks the boundary under test.
// H7-RUN-01: the committed migrations are deployed once per run into a template that every suite copies.
module.exports = {
  ...base,
  roots: ['<rootDir>/test/integration'],
  testRegex: '\\.integration-spec\\.ts$',
  testTimeout: 30000,
  globalSetup: '<rootDir>/test/config/integration-global-setup.ts',
  globalTeardown: '<rootDir>/test/config/integration-global-teardown.ts',
};
