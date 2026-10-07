const base = require('./jest.base.cjs');

// Whole stack against real services. A missing prerequisite must fail the run, never skip it.
module.exports = {
  ...base,
  roots: ['<rootDir>/test/live'],
  testRegex: '\\.live-spec\\.ts$',
  testTimeout: 60000,
};
