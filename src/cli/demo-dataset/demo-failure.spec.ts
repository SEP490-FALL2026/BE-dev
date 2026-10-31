import { TransientDatabaseError } from '../../infrastructure/database/transaction-runner';
import { DemoRunClock, describeDemoFailure } from './demo-failure';

describe('the failure line of ops:demo-dataset', () => {
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
