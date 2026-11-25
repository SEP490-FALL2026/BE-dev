import type { BusinessDate } from '../../../core/business-date';

/** The workspace already has a live line of this plan (C1, `QĐ-116ag`): the seats of one plan in one workspace are held in one subscription. */
export class SubscriptionLineLiveTakenError extends Error {
  constructor() {
    super('The workspace already has a live line of this plan: add the seats to that subscription.');
    this.name = 'SubscriptionLineLiveTakenError';
  }
}

/** The period already has a line of this plan. */
export class SubscriptionLinePlanTakenError extends Error {
  constructor() {
    super('The subscription already has a line of this plan.');
    this.name = 'SubscriptionLinePlanTakenError';
  }
}

/** The plan of the line is not a plan of seats of the vendor of its workspace (C2), or the line is not in the workspace of its period. */
export class SubscriptionLineMismatchError extends Error {
  constructor(readonly rule: 'WORKSPACE' | 'PLAN_NOT_SEATS' | 'PLAN_VENDOR') {
    super(
      'The line does not fit its subscription: its plan is a plan of seats of the vendor of the workspace of the period.',
    );
    this.name = 'SubscriptionLineMismatchError';
  }
}

/** The line does not exist. */
export class SubscriptionLineNotFoundError extends Error {
  constructor() {
    super('The subscription line does not exist.');
    this.name = 'SubscriptionLineNotFoundError';
  }
}

/** The ledger would fall below the seats taken (or below zero) on a day: `SEAT_LEDGER.BELOW_OCCUPANCY`. */
export class SeatLedgerBelowOccupancyError extends Error {
  constructor() {
    super('The seats of the line would fall below the seats already taken.');
    this.name = 'SeatLedgerBelowOccupancyError';
  }
}

/** The item awaiting a grant already took its seat from the ledger (`QĐ-116aw`): one top-up per item. */
export class SeatLedgerItemGrantedError extends Error {
  constructor() {
    super('This item already took a seat from the ledger.');
    this.name = 'SeatLedgerItemGrantedError';
  }
}

/** The line takes no row of the ledger on that day: it has no ledger (a draft or a past period) or the day is out of its service. */
export class SeatLedgerClosedError extends Error {
  constructor(readonly rule: 'NO_LEDGER' | 'OUT_OF_SERVICE') {
    super('The ledger of this line takes no row on that day.');
    this.name = 'SeatLedgerClosedError';
  }
}

export class SubscriptionLineNotResponsibleError extends Error {
  constructor() {
    super('Only the IT Admin responsible for this subscription may change its lines.');
    this.name = 'SubscriptionLineNotResponsibleError';
  }
}

export class SubscriptionLineStaleError extends Error {
  constructor(readonly currentUpdatedAt: Date) {
    super('The subscription line has changed since it was last read; reload and try again.');
    this.name = 'SubscriptionLineStaleError';
  }
}

export class SubscriptionLineClosedError extends Error {
  constructor() {
    super('The subscription line is closed and can no longer be changed.');
    this.name = 'SubscriptionLineClosedError';
  }
}

export class SubscriptionLineQuantityViaPurchaseError extends Error {
  constructor() {
    super('The seat baseline phase is closed: add seats through a seat purchase on the line.');
    this.name = 'SubscriptionLineQuantityViaPurchaseError';
  }
}

export class SubscriptionLinePeriodNotFoundError extends Error {
  constructor() {
    super('The subscription period was not found.');
    this.name = 'SubscriptionLinePeriodNotFoundError';
  }
}

export class SubscriptionLinePeriodStaleError extends Error {
  constructor(readonly currentUpdatedAt: Date | null) {
    super('The subscription period has changed since it was last read; reload and try again.');
    this.name = 'SubscriptionLinePeriodStaleError';
  }
}

export class SubscriptionLineWorkspaceMovedError extends Error {
  constructor(readonly currentUpdatedAt: Date) {
    super('The subscription moved to another workspace while acquiring locks.');
    this.name = 'SubscriptionLineWorkspaceMovedError';
  }
}

export class SubscriptionLinePeriodNotTermError extends Error {
  constructor() {
    super('Only term subscriptions have seat lines.');
    this.name = 'SubscriptionLinePeriodNotTermError';
  }
}

export class SubscriptionLinePlanNotK2Error extends Error {
  constructor() {
    super('Only seat-managed K2 plans can be added as subscription lines.');
    this.name = 'SubscriptionLinePlanNotK2Error';
  }
}

export class SubscriptionLinePriceNotVndError extends Error {
  constructor(readonly currency: string) {
    super('Subscription line prices must be entered in dong (VND).');
    this.name = 'SubscriptionLinePriceNotVndError';
  }
}

export class SubscriptionLineUpdateEmptyError extends Error {
  constructor() {
    super('Provide monthlyUnitPrice or minimumSeats when updating a subscription line.');
    this.name = 'SubscriptionLineUpdateEmptyError';
  }
}

/** Manual ledger entry effective date falls in a month before the current business month (`SEAT_LEDGER.EFFECTIVE_IN_CLOSED_MONTH`). */
export class SeatLedgerEffectiveInClosedMonthError extends Error {
  constructor(readonly earliestOn: BusinessDate) {
    super(`The effective date cannot be before the start of the current month (${earliestOn}).`);
    this.name = 'SeatLedgerEffectiveInClosedMonthError';
  }
}
