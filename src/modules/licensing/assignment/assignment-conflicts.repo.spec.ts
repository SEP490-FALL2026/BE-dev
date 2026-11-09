import { Prisma } from '../../../generated/prisma/client';
import { AssignmentConflictError, SeatBaselineClosedError } from '../public/licensing.errors';
import { toAssignmentFailure } from './assignment-conflicts.repo';

/** A refusal of the database as Prisma reports it: the SQLSTATE nested in the driver adapter error. */
const refusal = (state: string, message: string, constraint?: string) =>
  new Prisma.PrismaClientKnownRequestError('The database refused the statement', {
    code: 'P2010',
    clientVersion: 'test',
    meta: { driverAdapterError: { cause: { originalCode: state, message, ...(constraint ? { constraint } : {}) } } },
  });

describe('toAssignmentFailure (what the database said about an assignment it refused)', () => {
  it('tells an overlap of one person from an account identifier already in use, both SQLSTATE 23P01', () => {
    const overlap = toAssignmentFailure(
      refusal(
        '23P01',
        'conflicting key value violates exclusion constraint',
        'license_assignments_personal_no_overlap',
      ),
      3,
    );
    const identifier = toAssignmentFailure(
      refusal(
        '23P01',
        'conflicting key value violates exclusion constraint',
        'license_assignments_identifier_no_overlap',
      ),
      4,
    );

    expect(overlap).toBeInstanceOf(AssignmentConflictError);
    expect(overlap).toMatchObject({ conflict: 'OVERLAP', index: 3 });
    expect(identifier).toMatchObject({ conflict: 'IDENTIFIER_IN_USE', index: 4 });
  });

  it('recognizes the seats all taken, and a subscription whose seats are not known, by what the trigger says', () => {
    expect(
      toAssignmentFailure(
        refusal('23514', 'The seats of the subscription are all taken: 11 assignments for 10 seats'),
        0,
      ),
    ).toMatchObject({
      conflict: 'SEAT_CAPACITY',
    });
    expect(
      toAssignmentFailure(refusal('23514', 'The number of seats of the subscription is not known'), 0),
    ).toMatchObject({
      conflict: 'SEAT_CAPACITY',
    });
  });

  it('recognizes time-limited staff without an expected end date', () => {
    expect(
      toAssignmentFailure(refusal('23514', 'A contractor, freelancer or intern needs an expected end date'), 2),
    ).toMatchObject({
      conflict: 'EXPECTED_END_REQUIRED',
      index: 2,
    });
  });

  it('recognizes a closed baseline, and nothing else that carries 55000', () => {
    expect(
      toAssignmentFailure(
        refusal('55000', 'The seat baseline is closed: an assignment without a request is no longer taken'),
        0,
      ),
    ).toBeInstanceOf(SeatBaselineClosedError);
    expect(toAssignmentFailure(refusal('55000', 'A license assignment is never deleted'), 0)).toBeNull();
  });

  it('leaves any other failure to the caller', () => {
    expect(toAssignmentFailure(refusal('23514', 'some other check'), 0)).toBeNull();
    expect(toAssignmentFailure(refusal('23503', 'foreign key'), 0)).toBeNull();
    expect(toAssignmentFailure(new Error('boom'), 0)).toBeNull();
  });
});
