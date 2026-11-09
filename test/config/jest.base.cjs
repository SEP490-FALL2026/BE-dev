// Shared by every non-unit runner. Each runner config only chooses its directory and suffix.
// The same directory/suffix pairs are declared in scripts/verify/runners.mjs, and
// `pnpm test:discovery` fails when the two disagree or when a spec file is claimed by no runner.
module.exports = {
  rootDir: '../..',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
};
