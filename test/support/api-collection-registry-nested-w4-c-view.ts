import type { NestedArrayEntry } from './api-collection-registry';

/** Nested arrays of the operations added in W4 C-VIEW. */
export const NESTED_ARRAYS_W4_C_VIEW: readonly NestedArrayEntry[] = [
  {
    key: 'requestTicketGet#ticket.items',
    classification: 'bounded',
    findings: [],
    owner: 'b03-my-requests',
    businessMaximum: {
      maxItems: 6,
      source: 'MAX_TICKET_ITEMS in request-ticket.policy.ts and CHECK access_requests_ticket_position_range',
    },
    rationale: 'A request ticket contains 1 to 6 software access request items.',
    removeWhen: 'Review when MAX_TICKET_ITEMS or ticket item pagination changes.',
  },
];
