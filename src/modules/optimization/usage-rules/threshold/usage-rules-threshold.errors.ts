/** The days do not rise (`monitor < review < action`) or leave 1 to 365 (`FR-4.13`). */
export class GhostSeatThresholdOrderError extends Error {
  constructor() {
    super('The thresholds must rise (watch < review < action) and stay within 1 to 365 days.');
    this.name = 'GhostSeatThresholdOrderError';
  }
}

/** Internal software has no usage evidence, so no threshold (`FR-4.9` gate 1). */
export class GhostSeatThresholdApplicationInternalError extends Error {
  constructor() {
    super('An internal application has no thresholds of unused days.');
    this.name = 'GhostSeatThresholdApplicationInternalError';
  }
}

export class GhostSeatThresholdApplicationNotFoundError extends Error {
  constructor() {
    super('The application does not exist.');
    this.name = 'GhostSeatThresholdApplicationNotFoundError';
  }
}
