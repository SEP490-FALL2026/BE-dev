const integration = require('./jest.integration.cjs');

// Integration files whose outcome hangs on short wall-clock limits (a call ends within a configured timeout of a few
// seconds, plus a small slack). Beside other workers the CPU is shared and the limit measures the load, not the code: they
// live with their module as *.timing-spec.ts and always run in band, after the parallel files (see package.json).
module.exports = {
  ...integration,
  testRegex: '\\.timing-spec\\.ts$',
  reporters: ['default', ['<rootDir>/test/config/timing-reporter.cjs', { runner: 'integration-timing' }]],
};
