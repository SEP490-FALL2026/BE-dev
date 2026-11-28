/**
 * Reorder items so entries belonging to the same ticket occupy their existing slots in ascending ticket position,
 * while standalone entries keep their original slots (`QĐ-117k`).
 */
export function orderByTicketPosition<T extends { ticket: { id: string; position: number } | null }>(
  items: readonly T[],
): T[] {
  const grouped = new Map<string, { item: T; position: number }[]>();
  for (const item of items) {
    if (item.ticket === null) continue;
    const list = grouped.get(item.ticket.id) ?? [];
    list.push({ item, position: item.ticket.position });
    grouped.set(item.ticket.id, list);
  }

  const queues = new Map<string, T[]>();
  for (const [ticketId, list] of grouped) {
    // Sort descending so pop() yields ascending ticket positions in O(1).
    list.sort((a, b) => b.position - a.position);
    queues.set(
      ticketId,
      list.map((entry) => entry.item),
    );
  }

  return items.map((item) => {
    if (item.ticket === null) return item;
    return queues.get(item.ticket.id)?.pop() ?? item;
  });
}

/** Order spend batch request IDs for budget checking using `orderByTicketPosition` (§7.7). */
export function processingOrder(
  items: readonly { requestId: string; ticket: { id: string; position: number } | null }[],
): string[] {
  return orderByTicketPosition(items).map((item) => item.requestId);
}

/** Restore rows produced in processing order back to the caller's original request body order. */
export function restoreBodyOrder<T extends { requestId: string }>(bodyIds: readonly string[], rows: readonly T[]): T[] {
  const byId = new Map(rows.map((row) => [row.requestId, row]));
  const ordered: T[] = [];

  for (const id of bodyIds) {
    const row = byId.get(id);
    if (row !== undefined) ordered.push(row);
  }

  return ordered;
}
