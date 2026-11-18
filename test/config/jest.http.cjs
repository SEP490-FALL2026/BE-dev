const base = require('./jest.base.cjs');

// HTTP contract through the real Nest application, with external ports stubbed and no database.
// One application per file (test/support/http-contract-app.ts); files run in parallel.
module.exports = {
  ...base,
  roots: ['<rootDir>/test/http'],
  testRegex: '\.http-spec\.ts$',
  testTimeout: 30000,
  reporters: ['default', ['<rootDir>/test/config/timing-reporter.cjs', { runner: 'http' }]],
};
