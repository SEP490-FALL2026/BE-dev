/** The Idempotency-Key of a batch was used before for another batch (another list of recommendations or another note): a key names one request. */
export class GhostSeatEscalationKeyReusedError extends Error {
  constructor() {
    super('The Idempotency-Key was used for another batch of recommendations.');
    this.name = 'GhostSeatEscalationKeyReusedError';
  }
}
