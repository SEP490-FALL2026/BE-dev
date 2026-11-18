/*
 * How a call to the AI service failed. No message carries the token, the address, a header or a body of the service: they name the
 * kind of failure and, for a refusal, the HTTP status and the code of the contract only.
 */

/** No AI service is configured (`AI_SERVICE_BASE_URL` is not set). */
export class AiServiceNotConfiguredError extends Error {
  constructor() {
    super('No AI service is configured.');
    this.name = 'AiServiceNotConfiguredError';
  }
}

/**
 * The AI service could not be reached or refused the call: `status` is its HTTP status (null when no answer came), `serviceCode`
 * the code of the contract it answered with (null when it gave none of them).
 */
export class AiServiceUnavailableError extends Error {
  constructor(
    readonly status: number | null,
    readonly serviceCode: string | null,
  ) {
    super(`The AI service did not answer the call (status=${status ?? 'none'} code=${serviceCode ?? 'none'}).`);
    this.name = 'AiServiceUnavailableError';
  }
}

/** The call, its retry included, did not end within the timeout, or the model ran out of time (504). */
export class AiServiceTimeoutError extends Error {
  constructor() {
    super('The AI service did not answer in time.');
    this.name = 'AiServiceTimeoutError';
  }
}

/** The AI service answered 200 with something that is not an answer of the contract for this call. */
export class AiServiceAnswerInvalidError extends Error {
  constructor(readonly reason: 'NOT_JSON' | 'SHAPE' | 'OTHER_INVOCATION') {
    super(`The AI service answered outside the contract (${reason}).`);
    this.name = 'AiServiceAnswerInvalidError';
  }
}
