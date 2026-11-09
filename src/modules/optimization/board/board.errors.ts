/** The recommendation (or the run) is not in the organization of the caller, or does not exist. */
export class GhostSeatNotFoundError extends Error {
  constructor() {
    super('The recommendation or the run does not exist.');
    this.name = 'GhostSeatNotFoundError';
  }
}

/** Only a `G2` that is open can be reclaimed by the IT Admin: a `G1` has no seat, a decided or closed `G2` is already taken care of. */
export class GhostSeatNotReclaimableError extends Error {
  constructor() {
    super('Only an open recommendation about the seat of a person who left can be reclaimed.');
    this.name = 'GhostSeatNotReclaimableError';
  }
}

/** The gate of the revocation (`SBF-18`) refused the seat: it is a service account, has ended, or its kind has no revocation. */
export class GhostSeatSeatNotRevocableError extends Error {
  constructor(readonly problem: string) {
    super(`The seat cannot be revoked: ${problem}.`);
    this.name = 'GhostSeatSeatNotRevocableError';
  }
}

/** The period asked for `KPI-5` is empty or goes backwards. */
export class GhostSeatPeriodInvalidError extends Error {
  constructor() {
    super('The period of KPI-5 must start on or before the day it ends.');
    this.name = 'GhostSeatPeriodInvalidError';
  }
}
