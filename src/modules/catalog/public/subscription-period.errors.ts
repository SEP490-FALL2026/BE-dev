import type { PeriodRefusal } from './subscription-period.types';

/** The catalog refused to record the period a renewal makes; nothing is written. */
export class SubscriptionPeriodRefusedError extends Error {
  /** `planId` names the plan whose application is retired when the refusal is `APPLICATION_RETIRED`. */
  constructor(
    readonly reason: PeriodRefusal,
    readonly planId?: string,
  ) {
    super(`The new period of the subscription was refused: ${reason}.`);
    this.name = 'SubscriptionPeriodRefusedError';
  }
}
