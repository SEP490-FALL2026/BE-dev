import type { TicketWire } from './request-ticket.dto';
import { orderByPosition, ticketStatusOf } from './request-ticket.policy';
import type { RequestTicketView } from './request-ticket.types';

/** Map a full ticket view to its wire payload, optionally filtering visible items while keeping ticket-wide status. */
export function toTicketWire(view: RequestTicketView, visibleRequestIds?: ReadonlySet<string>): TicketWire {
  const ordered = orderByPosition(view.items);
  const visible = visibleRequestIds ? ordered.filter((item) => visibleRequestIds.has(item.requestId)) : ordered;

  return {
    id: view.id,
    requester: view.requester,
    department: view.department,
    submittedAt: view.submittedAt.toISOString(),
    status: ticketStatusOf(view.items.map((item) => item.state)),
    items: visible.map((item) => ({
      position: item.position,
      requestId: item.requestId,
      plan: item.plan,
      state: item.state,
      termMonths: item.termMonths,
      routingMode: item.routingMode,
      latestReply: item.latestReply
        ? {
            kind: item.latestReply.kind,
            note: item.latestReply.note,
            author: item.latestReply.author,
            createdAt: item.latestReply.createdAt.toISOString(),
          }
        : null,
    })),
  };
}
