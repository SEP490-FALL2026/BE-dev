import { DatabaseError } from 'pg';

/**
 * PostgreSQL puts the name of a constraint in the message of a CHECK or a unique index it refuses, but a trigger that raises with
 * `USING CONSTRAINT = '...'` carries the name only in the `constraint` field of the error response, and the Prisma driver adapter
 * forwards the message, the SQLSTATE, `detail`, `hint` and `column` but not that field (observed with @prisma/adapter-pg 7.9: the
 * P2039 of a refused seat change holds code 23514 and the trigger's own text, nothing else). The pool therefore says the name in
 * the message, once, so that `isCheckViolation` / `isUniqueViolation` find it wherever the error ends up.
 */
export function namedByConstraint<T>(error: T): T {
  if (!(error instanceof DatabaseError) || !error.constraint) return error;
  if (!error.message.includes(error.constraint)) error.message = `${error.message} [constraint "${error.constraint}"]`;

  return error;
}
