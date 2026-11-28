import type { TicketItemRefusal } from './request-ticket.types';

/** The ticket does not exist, or the caller cannot view any of its items. */
export class RequestTicketNotFoundError extends Error {
  constructor() {
    super('The request ticket does not exist.');
    this.name = 'RequestTicketNotFoundError';
  }
}

/** Only the requester of the ticket may withdraw the ticket as a whole. */
export class RequestTicketNotRequesterError extends Error {
  constructor() {
    super('Only the requester of the ticket may withdraw it.');
    this.name = 'RequestTicketNotRequesterError';
  }
}

/** The ticket exceeds the maximum number of items allowed in one submission. */
export class RequestTicketTooManyItemsError extends Error {
  constructor(readonly count: number) {
    super(`A request ticket may contain at most 6 items (received ${count}).`);
    this.name = 'RequestTicketTooManyItemsError';
  }
}

/** One or more items in the ticket failed pre-submission validation; nothing was written. */
export class RequestTicketItemsRefusedError extends Error {
  constructor(readonly items: readonly TicketItemRefusal[]) {
    super('One or more items in the request ticket were refused.');
    this.name = 'RequestTicketItemsRefusedError';
  }
}
