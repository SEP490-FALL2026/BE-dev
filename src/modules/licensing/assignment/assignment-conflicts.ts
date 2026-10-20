import { isCheckViolation } from '../../../infrastructure/database/unique-violation';
import { readSqlState } from '../../../infrastructure/database/transaction-runner';
import type { Prisma } from '../../../generated/prisma/client';
import { AssignmentConflictError, SeatBaselineClosedError } from '../licensing.errors';

/**
 * Turns what the database said about an assignment it refused into the error of the rule that was broken, or returns
 * null for any other failure. The rules are the ones of the migration: one person once at a time (`23P01`), one account
 * identifier at a time (`23P01`), the seats bought (`23514`), the expected end date of time-limited staff (`23514`) and
 * the closed baseline (`55000`). A trigger that raises `23514` names no constraint in the error, only its message, so
 * those two are told apart by what the message says.
 */
export function toAssignmentFailure(error: unknown, index: number): Error | null {
  const state = readSqlState(error);
  if (state === '23P01') {
    const haystack = JSON.stringify((error as Prisma.PrismaClientKnownRequestError).meta ?? {});

    return new AssignmentConflictError(haystack.includes('identifier') ? 'IDENTIFIER_IN_USE' : 'OVERLAP', index);
  }
  if (isCheckViolation(error, 'seats of the subscription')) return new AssignmentConflictError('SEAT_CAPACITY', index);
  if (isCheckViolation(error, 'needs an expected end date')) {
    return new AssignmentConflictError('EXPECTED_END_REQUIRED', index);
  }
  if (
    state === '55000' &&
    JSON.stringify((error as Prisma.PrismaClientKnownRequestError).meta ?? {}).includes('baseline is closed')
  ) {
    return new SeatBaselineClosedError();
  }

  return null;
}
