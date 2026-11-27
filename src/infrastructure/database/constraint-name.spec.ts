import { DatabaseError } from 'pg';
import { namedByConstraint } from './constraint-name';

/** An error as node-postgres builds it from an ErrorResponse (the fields PostgreSQL sends), not a hand-made look-alike. */
function pgError(message: string, fields: { code: string; constraint?: string }): DatabaseError {
  const error = new DatabaseError(message, message.length, 'error');
  error.severity = 'ERROR';
  error.code = fields.code;
  error.constraint = fields.constraint;

  return error;
}

describe('namedByConstraint', () => {
  it('says the constraint in the message of a refusal that raised it by name only (a trigger: RAISE ... USING CONSTRAINT)', () => {
    const error = pgError('The seats of the line fall below the seats taken on 2026-11-27', {
      code: '23514',
      constraint: 'seat_changes_below_occupancy',
    });

    expect(namedByConstraint(error)).toBe(error);
    expect(error.message).toBe(
      'The seats of the line fall below the seats taken on 2026-11-27 [constraint "seat_changes_below_occupancy"]',
    );
  });

  it('leaves a message that already names the constraint (a CHECK or a unique index of the table) as it is', () => {
    const message = 'duplicate key value violates unique constraint "currencies_pkey"';
    const error = pgError(message, { code: '23505', constraint: 'currencies_pkey' });

    namedByConstraint(error);

    expect(error.message).toBe(message);
  });

  it('leaves alone an error with no constraint, and anything that is not a database error', () => {
    const plain = pgError('deadlock detected', { code: '40P01' });
    const timeout = new Error('Query read timeout');

    namedByConstraint(plain);
    namedByConstraint(timeout);
    namedByConstraint(undefined);

    expect(plain.message).toBe('deadlock detected');
    expect(timeout.message).toBe('Query read timeout');
  });

  it('names the constraint once, however often the same error passes through', () => {
    const error = pgError('refused', { code: '23514', constraint: 'seat_changes_line_has_ledger' });

    namedByConstraint(namedByConstraint(error));

    expect(error.message).toBe('refused [constraint "seat_changes_line_has_ledger"]');
  });
});
