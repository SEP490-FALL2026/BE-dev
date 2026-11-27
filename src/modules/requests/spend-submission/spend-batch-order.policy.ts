/**
 * Reorder batch items for budget processing so items belonging to the same ticket occupy their body slots
 * in ascending ticket position, while standalone items remain in their original slots.
 */
export function processingOrder(
  items: readonly { requestId: string; ticket: { id: string; position: number } | null }[],
): string[] {
  const grouped = new Map<string, { requestId: string; position: number }[]>();
  for (const item of items) {
    if (item.ticket === null) continue;
    const list = grouped.get(item.ticket.id) ?? [];
    list.push({ requestId: item.requestId, position: item.ticket.position });
    grouped.set(item.ticket.id, list);
  }

  const queues = new Map<string, string[]>();
  for (const [ticketId, list] of grouped) {
    // Sort descending so pop() yields ascending ticket positions in O(1).
    list.sort((a, b) => b.position - a.position);
    queues.set(
      ticketId,
      list.map((entry) => entry.requestId),
    );
  }

  return items.map((item) => {
    if (item.ticket === null) return item.requestId;
    return queues.get(item.ticket.id)?.pop() ?? item.requestId;
  });
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
