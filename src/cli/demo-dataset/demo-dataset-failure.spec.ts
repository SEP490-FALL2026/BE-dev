import { Prisma } from '../../generated/prisma/client';
import { TransientDatabaseError, toTransientError } from '../../infrastructure/database/transaction-runner';
import { databaseCauseOf, failureLine } from './demo-dataset-failure';
import { DemoAccountsChangedError } from '../../modules/installation/public/installation.errors';
import { exitCodeOf, runDemoSteps } from './demo-dataset-runner';
import type { DemoRunContext } from './demo-run.types';

const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('Transaction API error: secret-host:5432 user=slm_runtime', {
    code,
    clientVersion: '7.9.1',
    meta,
  });

/**
 * A-04: a failed run used to be reported by the error's name alone ("TransientDatabaseError"), which cannot tell a
 * transaction over its time budget (P2028) from a connection that stopped answering ("Query read timeout").
 */
describe('the database cause of a failed demo dataset run', () => {
  it('names the Prisma code of a transaction that ran out of time, never its message', () => {
    const wrapped = toTransientError(prismaError('P2028'));
    expect(wrapped).toBeInstanceOf(TransientDatabaseError);
    expect(databaseCauseOf(wrapped)).toBe('P2028');
    expect(failureLine(wrapped)).toBe('The demo dataset run failed: TransientDatabaseError [P2028]');
    expect(failureLine(wrapped)).not.toMatch(/secret-host|slm_runtime/);
  });

  it('adds the SQLSTATE that the driver adapter nested in a Prisma error', () => {
    const timeout = prismaError('P2010', { driverAdapterError: { cause: { originalCode: '57014' } } });
    expect(databaseCauseOf(toTransientError(timeout))).toBe('P2010 57014');
  });

  it("keeps node-postgres's fixed message for a connection that stopped answering", () => {
    expect(databaseCauseOf(toTransientError(new Error('Query read timeout')))).toBe('Query read timeout');
    expect(databaseCauseOf(new Error('Connection terminated unexpectedly'))).toBe('Connection terminated unexpectedly');
  });

  it('names a socket error by its code, never by its message (which carries the host)', () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED 10.0.0.7:5432'), { code: 'ECONNREFUSED' });
    expect(databaseCauseOf(toTransientError(refused))).toBe('ECONNREFUSED');
    expect(failureLine(refused)).toBe('The demo dataset run failed: Error [ECONNREFUSED]');
  });

  it('puts the cause in square brackets after the name of the error, and nothing when there is none', () => {
    expect(failureLine(toTransientError(new Error('Query read timeout')))).toBe(
      'The demo dataset run failed: TransientDatabaseError [Query read timeout]',
    );
    expect(
      failureLine(toTransientError(prismaError('P2010', { driverAdapterError: { cause: { originalCode: '57014' } } }))),
    ).toBe('The demo dataset run failed: TransientDatabaseError [P2010 57014]');
    expect(failureLine(new DemoAccountsChangedError())).toBe('The demo dataset run failed: DemoAccountsChangedError');
  });

  it('says nothing more for an error that is not a database failure', () => {
    expect(databaseCauseOf(new Error('postgresql://user:pw@host/db is wrong'))).toBeNull();
    expect(databaseCauseOf(new DemoAccountsChangedError())).toBeNull();
    expect(databaseCauseOf('Query read timeout')).toBeNull();
    expect(failureLine(new TypeError('boom'))).toBe('The demo dataset run failed: TypeError');
  });

  it('marks a transient error whose cause it cannot read as unclassified', () => {
    expect(databaseCauseOf(new TransientDatabaseError(undefined, undefined))).toBe('unclassified');
  });

  it('puts the cause in the detail of the step that failed, and the run still exits 1', async () => {
    const reports = await runDemoSteps({ mode: 'apply' } as DemoRunContext, [
      {
        key: 'org.accounts',
        title: 'org.accounts',
        needs: [],
        run: () => Promise.reject(toTransientError(prismaError('P2028')) ?? new Error('not a transient error')),
      },
    ]);
    expect(reports[0]).toMatchObject({
      status: 'failed',
      detail: 'The database could not complete the transaction. Retry shortly. [P2028]',
    });
    expect(exitCodeOf('apply', reports)).toBe(1);
  });
});
