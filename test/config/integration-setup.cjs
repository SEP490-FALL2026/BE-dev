// Runs before each integration/e2e spec file (setupFilesAfterEnv). Jest gives every file its own copy of process.env.
// OD-T3: the suites under test/integration/identity-access/ prove the production Argon2 parameters; every other suite
// signs people in with the cheapest ones (test/support/fast-password-hasher.ts).
const testPath = expect.getState().testPath.split('\\').join('/');
process.env.TEST_PASSWORD_HASHER = testPath.includes('/test/integration/identity-access/') ? 'production' : 'fast';
// A loaded runner can take seconds to open the first connection to a freshly cloned database or to answer one query.
// The client-side production limits (3 s connect, 2 s transaction wait, 8 s query) belong only to the suites that prove
// them, and those pass their own values (*.timing-spec.ts).
process.env.DB_CONNECT_TIMEOUT_MS ??= '15000';
process.env.DB_TRANSACTION_MAX_WAIT_MS ??= '15000';
process.env.DB_QUERY_TIMEOUT_MS ??= '30000';
