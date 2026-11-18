import type { PeriodRefusal } from './subscription-period.types';

/** The catalog refused to record the period a renewal makes; nothing is written. */
export class SubscriptionPeriodRefusedError extends Error {
  constructor(readonly reason: PeriodRefusal) {
    super(`The new period of the subscription was refused: ${reason}.`);
    this.name = 'SubscriptionPeriodRefusedError';
  }
}
