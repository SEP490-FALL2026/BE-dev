import {
  AssignmentNotFoundError,
  AssignmentNotOpenError,
  RevocationRefusedError,
  SeatTargetNotFoundError,
} from '../../licensing/public/licensing.errors';

/** What is wrong with one recommendation of a batch: the id and the reason, as the wire names it. */
export type DecisionItemCode =
  | 'NOT_FOUND'
  | 'NOT_DECIDER'
  | 'PAUSED'
  | 'NOT_DECIDABLE'
  | 'SEAT_NOT_REVOCABLE'
  | 'EXEMPTION_REQUIRED'
  | 'EXEMPTION_TOO_LONG';

export interface DecisionItemProblem {
  recommendationId: string;
  code: DecisionItemCode;
}

/**
 * A batch of decisions was refused, all of it (`Q-94`: all or nothing): each recommendation that is wrong is named in `items`. The first
 * of them says which answer the batch gets (`NOT_DECIDER` 403, `NOT_FOUND` 404, a state 409, an exemption 422).
 */
export class GhostSeatDecisionRefusedError extends Error {
  constructor(readonly items: readonly DecisionItemProblem[]) {
    super(`The decision was refused for ${items.length} recommendation(s); nothing was saved.`);
    this.name = 'GhostSeatDecisionRefusedError';
  }
}

/** The recommendation or the department of the caller does not exist in the organization of the caller. */
export class GhostSeatDecisionNotFoundError extends Error {
  constructor() {
    super('The recommendation does not exist.');
    this.name = 'GhostSeatDecisionNotFoundError';
  }
}

/** The IT Admin may return only a reclaim of `G3`/`G4` the head decided (`G2` has none, a returned or ended one has nothing to return). */
export class GhostSeatNotReturnableError extends Error {
  constructor() {
    super('Only a reclaim the head decided on a recommendation of unused or idle seats can be returned.');
    this.name = 'GhostSeatNotReturnableError';
  }
}

/** The IT Admin returns a recommendation at most once (`OI-02`). */
export class GhostSeatAlreadyReturnedError extends Error {
  constructor() {
    super('The recommendation was returned to the head once already.');
    this.name = 'GhostSeatAlreadyReturnedError';
  }
}

/** Another IT Admin is working the task: only they can close it, so the recommendation cannot be returned now. */
export class GhostSeatTaskInProgressError extends Error {
  constructor() {
    super('Another IT Admin is working the revocation task; close it first.');
    this.name = 'GhostSeatTaskInProgressError';
  }
}

/** Whether an error of the gate of the revocation (`SBF-18`) means the seat cannot be revoked. */
export const isSeatNotRevocable = (error: unknown): boolean =>
  error instanceof RevocationRefusedError ||
  error instanceof AssignmentNotFoundError ||
  error instanceof AssignmentNotOpenError ||
  error instanceof SeatTargetNotFoundError;
