import { Injectable } from '@nestjs/common';
import { RequestStatusProjection, type ProjectionResult } from './status/request-status-projector.service';

/**
 * What the worker's loop calls to tell the people who are concerned how their requests are going (`US-05-15`): one pass of the
 * projection of the audit events of the requests into the inbox. The work itself is the capability `status/`; this is the one entry
 * the composition root is given, so the loop does not reach into the context.
 */
@Injectable()
export class RequestStatusProjectorService {
  constructor(private readonly projection: RequestStatusProjection) {}

  /** One pass: writes the notices of the events old enough to be read and moves the cursor; `busy` when another worker is at it. */
  project(now: Date = new Date()): Promise<ProjectionResult> {
    return this.projection.project(now);
  }
}
