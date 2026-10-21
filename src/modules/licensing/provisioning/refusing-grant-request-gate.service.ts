import { Injectable } from '@nestjs/common';
import type { GrantRequestAnswer, GrantRequestGate } from '../licensing.types';

/**
 * The gate until the module of requests exists: no request is known, so no seat is granted. The module that owns requests
 * replaces it by providing `GRANT_REQUEST_GATE` with its own implementation.
 */
@Injectable()
export class RefusingGrantRequestGate implements GrantRequestGate {
  check(): Promise<GrantRequestAnswer> {
    return Promise.resolve({ status: 'NOT_FOUND' });
  }
}
