import type { RegistryEvent } from './api-collection-registry';

/** Nested-array registry events added in W4 C-VIEW. */
export const W4_C_VIEW_REGISTRY_EVENTS: readonly RegistryEvent[] = [
  {
    registry: 'nested',
    key: 'requestTicketGet#ticket.items',
    change: 'added',
    to: 'bounded',
    bound: 'MAX_TICKET_ITEMS',
    finding: 'LD-14',
    item: 'b03-my-requests',
    date: '2026-11-28',
    reason: 'The ticket detail response includes only the visible subset of at most MAX_TICKET_ITEMS (6) items.',
  },
];
