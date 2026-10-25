import type { ReviewRefusal, SubmitRefusal } from './service-account-request.policy';

/** A request for a service account cannot be sent: the reason says why (`US-05-21`). */
export class ServiceAccountSubmitRefusedError extends Error {
  constructor(readonly reason: SubmitRefusal) {
    super(`The request for a service account cannot be sent: ${reason}.`);
    this.name = 'ServiceAccountSubmitRefusedError';
  }
}

/** The IT Admin cannot give a verdict on the boundary of the request now: the reason says why (`US-05-21` AC-3). */
export class ServiceAccountReviewRefusedError extends Error {
  constructor(readonly reason: ReviewRefusal) {
    super(`The boundary of the service account cannot be decided: ${reason}.`);
    this.name = 'ServiceAccountReviewRefusedError';
  }
}
