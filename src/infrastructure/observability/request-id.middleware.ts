import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextService } from './request-context.service';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const requestId = resolveRequestId(request.header(REQUEST_ID_HEADER));
    response.setHeader(REQUEST_ID_HEADER, requestId);
    this.requestContext.run(requestId, next);
  }
}
