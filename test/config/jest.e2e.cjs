const base = require('./jest.base.cjs');

// HTTP contract through the real Nest application, with external ports stubbed.
module.exports = {
  ...base,
  roots: ['<rootDir>/test/e2e'],
  testRegex: '\\.e2e-spec\\.ts$',
};
