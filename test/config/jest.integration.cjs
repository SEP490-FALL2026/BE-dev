const base = require('./jest.base.cjs');

// Real PostgreSQL (and later S3-compatible storage). Never mocks the boundary under test.
module.exports = {
  ...base,
  roots: ['<rootDir>/test/integration'],
  testRegex: '\\.integration-spec\\.ts$',
  testTimeout: 30000,
};
