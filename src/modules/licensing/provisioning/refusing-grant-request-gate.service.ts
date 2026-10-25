import { Injectable } from '@nestjs/common';
import type { GrantRequestAnswer, GrantRequestGate } from '../licensing.types';

/**
 * The gate until the module of requests registers its own: no request is known, so no seat is granted and no outcome is
 * reported to anybody.
 */
@Injectable()
export class RefusingGrantRequestGate implements GrantRequestGate {
  check(): Promise<GrantRequestAnswer> {
    return Promise.resolve({ status: 'NOT_FOUND' });
  }

  claimForGrant(): Promise<GrantRequestAnswer> {
    return this.check();
  }

  reportOutcome(): Promise<void> {
    return Promise.resolve();
  }

  isWithdrawing(): Promise<boolean> {
    return Promise.resolve(false);
  }

  reportCancelled(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
