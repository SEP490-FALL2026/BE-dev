/**
 * The storage could not answer (the network, a timeout, a refusal of the service): not a defect of the caller, and not a
 * file that is missing. The HTTP layer answers it with a 503 so the client retries, as it does for the database.
 */
export class ObjectStorageUnavailableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('The object storage is temporarily unavailable.', options);
    this.name = 'ObjectStorageUnavailableError';
  }
}
