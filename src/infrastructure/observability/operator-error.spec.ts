import { Prisma } from '../../generated/prisma/client';
import { JsonColumnShapeError } from '../database/json-column.errors';
import { TransientDatabaseError } from '../database/transaction-runner';
import { describeForOperator, traceForOperator } from './operator-error';

const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('Invalid `prisma.appUser.create()` invocation: email ana@example.com', {
    code,
    clientVersion: 'test',
    ...(meta ? { meta } : {}),
  });

/** A refusal as Prisma 7 with the pg adapter reports it: the SQLSTATE nested in the driver adapter error. */
const adapterRefusal = (state: string) =>
  prismaError('P2010', { driverAdapterError: { cause: { originalCode: state, message: 'deadlock detected' } } });

/** A business error whose message names a person, as many of the `*.errors.ts` classes do. */
class AccessRequestNotFoundError extends Error {
  constructor() {
    super('Request 7 of ana@example.com was not found');
    this.name = 'AccessRequestNotFoundError';
  }
}

describe('describeForOperator', () => {
  it('names a deadlock the database reported: kind, SQLSTATE, that it can be retried, and what Prisma said', () => {
    const error = new TransientDatabaseError('40P01', adapterRefusal('40P01'));

    expect(describeForOperator(error)).toBe(
      'TransientDatabaseError code=P2010 sqlState=40P01 retryable=true cause=PrismaClientKnownRequestError',
    );
  });

  it('names a unique violation by its Prisma code, not retryable, and never says which value collided', () => {
    const summary = describeForOperator(prismaError('P2002', { target: ['email'] }));

    expect(summary).toBe('PrismaClientKnownRequestError code=P2002 retryable=false');
    expect(summary).not.toContain('ana@example.com');
    expect(summary).not.toContain('email');
  });

  it('names a business error by its class only: the message may carry a name or an address', () => {
    const summary = describeForOperator(new AccessRequestNotFoundError());

    expect(summary).toBe('AccessRequestNotFoundError retryable=false');
    expect(summary).not.toContain('ana@example.com');
  });

  it('names a plain Error by its name only: the message may carry a connection string', () => {
    const summary = describeForOperator(new Error('postgresql://user:s3cr3t@db.internal:5432/app'));

    expect(summary).toBe('Error retryable=false');
    expect(summary).not.toContain('s3cr3t');
  });

  it('calls a raw connectivity or lock failure retryable although nothing wrapped it', () => {
    expect(describeForOperator(adapterRefusal('55P03'))).toBe(
      'PrismaClientKnownRequestError code=P2010 sqlState=55P03 retryable=true',
    );
    expect(
      describeForOperator(Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), { code: 'ECONNREFUSED' })),
    ).toBe('Error code=ECONNREFUSED retryable=true');
  });

  it('names a transient error that has no SQLSTATE by the Prisma code of its reason', () => {
    const error = new TransientDatabaseError(undefined, prismaError('P2028'));

    expect(describeForOperator(error)).toBe(
      'TransientDatabaseError code=P2028 retryable=true cause=PrismaClientKnownRequestError',
    );
  });

  it('names the table and column of a JSON column of the wrong shape, and neither where in the value nor what was in it', () => {
    const error = new JsonColumnShapeError('access_requests', 'policy', [
      { path: ['chain', 0], code: 'invalid_value' },
    ]);

    expect(describeForOperator(error)).toBe('JsonColumnShapeError column=access_requests.policy retryable=false');
  });

  it('adds the name of the cause, one level deep, and not its message', () => {
    const error = new Error('outer', { cause: new RangeError('inner detail with s3cr3t') });

    expect(describeForOperator(error)).toBe('Error retryable=false cause=RangeError');
  });

  it('describes a thrown value that is not an Error by its type, never by its content', () => {
    expect(describeForOperator('postgresql://user:s3cr3t@db/x')).toBe('NonError(string) retryable=false');
    expect(describeForOperator(undefined)).toBe('NonError(undefined) retryable=false');
    expect(describeForOperator({ message: 's3cr3t' })).toBe('NonError(object) retryable=false');
  });

  it('keeps a name that is not an identifier out of the line', () => {
    const odd = Object.assign(new Error('x'), { name: 'Bad name with s3cr3t\nand a new line' });

    expect(describeForOperator(odd)).toBe('Error retryable=false');
  });

  it('with `stack` appends the frames of the stack on the next lines, still without the message', () => {
    const error = new TypeError('Cannot read s3cr3t of undefined');

    const described = describeForOperator(error, { stack: true });
    const [summary, ...frames] = described.split('\n');

    expect(summary).toBe('TypeError retryable=false');
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((line) => /^\s+at /.test(line))).toBe(true);
    expect(described).not.toContain('s3cr3t');
  });

  it('with `stack` on a value that has no stack returns the line alone', () => {
    expect(describeForOperator('boom', { stack: true })).toBe('NonError(string) retryable=false');
  });
});

describe('traceForOperator', () => {
  it('gives the frames of an error nobody expected, without its message', () => {
    const trace = traceForOperator(new SyntaxError('postgresql://user:s3cr3t@db/x'));

    expect(trace).toBeDefined();
    expect(trace).toMatch(/^\s+at /);
    expect(trace).not.toContain('s3cr3t');
  });

  it('cuts the header of a class that sets its name after super(), where the stack still says Error', () => {
    const trace = traceForOperator(new AccessRequestNotFoundError());

    expect(trace).toMatch(/^\s+at /);
    expect(trace).not.toContain('ana@example.com');
  });

  it('cuts the header of an error with an empty message', () => {
    expect(traceForOperator(new Error(''))).toMatch(/^\s+at /);
  });

  it('gives nothing for a database that could only be unavailable: the line says it all', () => {
    expect(traceForOperator(new TransientDatabaseError('40P01', adapterRefusal('40P01')))).toBeUndefined();
    expect(traceForOperator(adapterRefusal('57014'))).toBeUndefined();
  });

  it('gives nothing for a thrown value that is not an Error', () => {
    expect(traceForOperator('boom')).toBeUndefined();
    expect(traceForOperator(null)).toBeUndefined();
  });

  it('gives the frames even when the message spans several lines, and never a line of the message', () => {
    const trace = traceForOperator(new Error('first line\n    at s3cr3t (fake.ts:1:1)\nthird line'));

    expect(trace).not.toContain('s3cr3t');
    expect(trace).not.toContain('third line');
  });
});
