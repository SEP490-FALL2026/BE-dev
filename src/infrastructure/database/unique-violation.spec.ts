import { Prisma } from '../../generated/prisma/client';
import { isCheckViolation, isUniqueViolation } from './unique-violation';

/**
 * The shapes below are what @prisma/adapter-pg 7.9.1 / Prisma 7.9.1 threw against PostgreSQL 17 (printed from a real refusal, redesign W3
 * audit D-1), not a guess: the adapter keeps SQLSTATE and message in `meta.driverAdapterError.cause`, and drops the `constraint` field of
 * the error response. The message of a trigger's refusal carries the constraint name because the pool says it there (constraint-name.ts).
 */
function refusal(code: string, meta: Record<string, unknown>): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Database error', { code, clientVersion: '7.9.1', meta });
}

const triggerRefusal = (): Prisma.PrismaClientKnownRequestError => {
  const message =
    'The seats of the line fall below the seats taken on 2026-11-27 [constraint "seat_changes_below_occupancy"]';

  return refusal('P2039', {
    modelName: 'SeatChange',
    driverAdapterError: {
      name: 'DriverAdapterError',
      cause: {
        originalCode: '23514',
        originalMessage: message,
        kind: 'postgres',
        code: '23514',
        severity: 'ERROR',
        message,
      },
    },
  });
};

const uniqueRefusal = (): Prisma.PrismaClientKnownRequestError =>
  refusal('P2002', {
    modelName: 'Currency',
    driverAdapterError: {
      name: 'DriverAdapterError',
      cause: {
        originalCode: '23505',
        originalMessage: 'duplicate key value violates unique constraint "currencies_pkey"',
        kind: 'UniqueConstraintViolation',
        constraint: { fields: ['code'] },
      },
    },
  });

describe('isCheckViolation', () => {
  it('names the constraint a trigger refused with, as the adapter delivers it', () => {
    expect(isCheckViolation(triggerRefusal(), 'seat_changes_below_occupancy')).toBe(true);
    expect(isCheckViolation(triggerRefusal(), 'seat_changes_line_has_ledger', 'seat_changes_below_occupancy')).toBe(
      true,
    );
  });

  it('is false for another constraint, true for any 23514 without a name to match, false for any other SQLSTATE', () => {
    expect(isCheckViolation(triggerRefusal(), 'seat_changes_line_has_ledger')).toBe(false);
    expect(isCheckViolation(triggerRefusal())).toBe(true);
    expect(isCheckViolation(uniqueRefusal(), 'currencies_pkey')).toBe(false);
    expect(isCheckViolation(new Error('boom'), 'seat_changes_below_occupancy')).toBe(false);
  });
});

describe('isUniqueViolation', () => {
  it('matches the constraint by the name in the message and by the columns, as the adapter delivers them', () => {
    expect(isUniqueViolation(uniqueRefusal(), 'currencies_pkey')).toBe(true);
    expect(isUniqueViolation(uniqueRefusal(), 'code')).toBe(true);
    expect(isUniqueViolation(uniqueRefusal(), 'other_key')).toBe(false);
  });

  it('is false for a refusal that is not P2002', () => {
    expect(isUniqueViolation(triggerRefusal(), 'seat_changes_below_occupancy')).toBe(false);
  });
});
