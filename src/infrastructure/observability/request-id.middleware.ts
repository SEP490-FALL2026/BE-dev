import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { EnvironmentVariables } from '../config/env-schema';
import { RequestContextService } from './request-context.service';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly trustInbound: boolean;

  constructor(
    private readonly requestContext: RequestContextService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    // Read once at construction: whether a trusted proxy sits in front of this process is
    // a deployment fact, not something a request can assert.
    this.trustInbound = config.get('TRUST_PROXY_HOPS', { infer: true }) > 0;
  }

  use(request: Request, response: Response, next: NextFunction): void {
    const requestId = resolveRequestId(request.header(REQUEST_ID_HEADER), { trustInbound: this.trustInbound });
    response.setHeader(REQUEST_ID_HEADER, requestId);
    this.requestContext.run(requestId, next);
  }
}
