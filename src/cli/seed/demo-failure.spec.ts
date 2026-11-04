import { Prisma } from '../../generated/prisma/client';
import { TransientDatabaseError, toTransientError } from '../../infrastructure/database/transaction-runner';
import { DemoRunClock, describeDemoFailure } from './demo-failure';

const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('Transaction API error: secret-host:5432 user=slm_runtime', {
    code,
    clientVersion: '7.9.1',
    meta,
  });

describe('the failure line of ops:seed', () => {
  // A failure reported by its name alone cannot tell a transaction over its time budget from a connection that stopped answering.
  it('names the Prisma code of a transaction that ran out of time, never its message', () => {
    const wrapped = toTransientError(prismaError('P2028'));

    expect(wrapped).toBeInstanceOf(TransientDatabaseError);
    expect(describeDemoFailure(wrapped)).toBe(
      'TransientDatabaseError code=P2028 retryable=true cause=PrismaClientKnownRequestError',
    );
    expect(describeDemoFailure(wrapped)).not.toMatch(/secret-host|slm_runtime/);
  });

  it('adds the SQLSTATE that the driver adapter nested in a Prisma error', () => {
    const timeout = prismaError('P2010', { driverAdapterError: { cause: { originalCode: '57014' } } });

    expect(describeDemoFailure(toTransientError(timeout))).toBe(
      'TransientDatabaseError code=P2010 sqlState=57014 retryable=true cause=PrismaClientKnownRequestError',
    );
  });

  it('names a socket error by its code, never by its message (which carries the host)', () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED 10.0.0.7:5432'), { code: 'ECONNREFUSED' });

    expect(describeDemoFailure(refused)).toBe('Error code=ECONNREFUSED retryable=true');
    expect(describeDemoFailure(refused)).not.toMatch(/10\.0\.0\.7/);
  });

  it('names the fixed node-postgres message of a client-side query timeout, not only "Error"', () => {
    // What a Prisma call outside TransactionRunner (the production runtime-role check at start-up) throws when the
    // database does not answer within DB_QUERY_TIMEOUT_MS: a plain Error, after the pool retired the connection.
    expect(describeDemoFailure(new Error('Query read timeout'))).toBe('Error retryable=true pg="Query read timeout"');
  });

  it('names the pg message under a TransientDatabaseError too', () => {
    const wrapped = new TransientDatabaseError(undefined, new Error('Query read timeout'));

    expect(describeDemoFailure(wrapped)).toBe(
      'TransientDatabaseError retryable=true cause=Error pg="Query read timeout"',
    );
  });

  it('never prints the message of any other error', () => {
    const leaky = new Error('connect to postgresql://slm_runtime:hunter2@postgres:5432/db failed');

    expect(describeDemoFailure(leaky)).toBe('Error retryable=false');
  });

  it('says in which phase the run failed and how long that phase and the run lasted', () => {
    let now = 1_000;
    const clock = new DemoRunClock(() => now);
    now = 1_100;
    clock.enter('startup');
    now = 2_600;

    expect(clock.failureLine(new Error('Query read timeout'))).toBe(
      'The demo dataset run failed in phase startup after 1500 ms (run 1600 ms): Error retryable=true pg="Query read timeout"',
    );
  });
});
