/* The refusals of the AI summary of a queue. Each maps to one stable code and one HTTP status in the HTTP layer. */

/** `AI.DISABLED`: the switch of the AI or of this feature is OFF; nothing was read and the model was not called. */
export class AiDisabledError extends Error {
  constructor() {
    super('The AI summary of the queue is switched off.');
    this.name = 'AiDisabledError';
  }
}

/** `AI.PROVIDER_UNAVAILABLE`: the MODEL mode with no AI service configured; nothing was written. */
export class AiProviderUnavailableError extends Error {
  constructor() {
    super('No AI service is available.');
    this.name = 'AiProviderUnavailableError';
  }
}

/** `AI.NO_ASSIGNED_STEPS`: no step waits for the person; the model was not called (AC-9). */
export class NoAssignedStepsError extends Error {
  constructor() {
    super('No approval step waits for this person.');
    this.name = 'NoAssignedStepsError';
  }
}

/** `AI.SOURCE_STALE`: the queue the person sees is not the queue now; they read it again before asking. */
export class SummarySourceStaleError extends Error {
  constructor() {
    super('The queue changed since it was read.');
    this.name = 'SummarySourceStaleError';
  }
}

/** `AI.NOT_FOUND`: no such summary, or it is somebody else's. */
export class SummaryNotFoundError extends Error {
  constructor() {
    super('No such summary.');
    this.name = 'SummaryNotFoundError';
  }
}
