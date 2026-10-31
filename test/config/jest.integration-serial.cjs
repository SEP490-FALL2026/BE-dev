const integration = require('./jest.integration.cjs');

// Integration files that must not run beside others: they create cluster-wide PostgreSQL roles, change
// process.env, or start CLI processes that share a resource. Always run in band (see package.json).
module.exports = {
  ...integration,
  roots: ['<rootDir>/test/integration/_serial'],
  testPathIgnorePatterns: ['/node_modules/'],
  reporters: ['default', ['<rootDir>/test/config/timing-reporter.cjs', { runner: 'integration-serial' }]],
};
