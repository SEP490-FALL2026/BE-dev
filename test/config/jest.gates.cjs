const base = require('./jest.base.cjs');

// Static gates: read source, OpenAPI, Compose and migrations to block a rule violation; never start the application.
module.exports = {
  ...base,
  roots: ['<rootDir>/test/gates'],
  testRegex: '\.gate-spec\.ts$',
  testTimeout: 60000,
  reporters: ['default', ['<rootDir>/test/config/timing-reporter.cjs', { runner: 'gates' }]],
};
