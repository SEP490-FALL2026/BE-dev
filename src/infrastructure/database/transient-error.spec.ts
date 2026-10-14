import { TransientDatabaseError, toTransientError } from './transaction-runner';

describe('toTransientError — client-side connectivity failures', () => {
  // node-postgres reports a dead or silent server with plain Error objects: no SQLSTATE, no Prisma code.
  it.each([
    'Connection terminated due to connection timeout',
    'Connection terminated unexpectedly',
    'Query read timeout',
    'timeout exceeded when trying to connect',
  ])('treats "%s" as retryable', (message) => {
    const mapped = toTransientError(new Error(message));
    expect(mapped).toBeInstanceOf(TransientDatabaseError);
    expect(mapped?.sqlState).toBeUndefined();
  });

  it.each(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE'])('treats a socket error %s as retryable', (code) => {
    const error = Object.assign(new Error(`connect ${code} 127.0.0.1:5432`), { code });
    expect(toTransientError(error)).toBeInstanceOf(TransientDatabaseError);
  });

  it('does not hide programming or data errors behind a retryable 503', () => {
    expect(toTransientError(new Error('column "nope" does not exist'))).toBeUndefined();
    expect(toTransientError(new TypeError('Cannot read properties of undefined'))).toBeUndefined();
    expect(toTransientError('Query read timeout')).toBeUndefined();
  });
});
