import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { currentStateOf } from '../access-request/access-request.policy';
import type { TicketRef } from '../access-request/access-request.types';
import type { RequestTicketItemRawView, RequestTicketRawView } from './request-ticket.types';

const SELECT_TICKET_VIEW = {
  id: true,
  requesterEmployeeId: true,
  departmentId: true,
  submittedAt: true,
  items: {
    orderBy: { ticketPosition: 'asc' },
    select: {
      id: true,
      ticketPosition: true,
      state: true,
      termMonths: true,
      routingMode: true,
      planId: true,
      replies: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: {
          kind: true,
          note: true,
          authorEmployeeId: true,
          createdAt: true,
        },
      },
    },
  },
} satisfies Prisma.RequestTicketSelect;

type TicketViewRow = Prisma.RequestTicketGetPayload<{ select: typeof SELECT_TICKET_VIEW }>;

interface TicketRefRow {
  request_id: string;
  ticket_id: string;
  ticket_position: number;
  item_count: number;
}

function toTicketItemRawView(item: TicketViewRow['items'][number]): RequestTicketItemRawView {
  if (item.ticketPosition === null || item.planId === null || item.state === 'DRAFT') {
    throw new Error(`Ticket item ${item.id} has invalid ticket state or missing metadata.`);
  }
  const reply = item.replies[0] ?? null;

  return {
    position: item.ticketPosition,
    requestId: item.id,
    planId: item.planId,
    state: currentStateOf(item.state),
    termMonths: item.termMonths,
    routingMode: item.routingMode,
    latestReply: reply
      ? {
          kind: reply.kind,
          note: reply.note,
          authorEmployeeId: reply.authorEmployeeId,
          createdAt: reply.createdAt,
        }
      : null,
  };
}

function toTicketRawView(row: TicketViewRow): RequestTicketRawView {
  return {
    id: row.id,
    requesterEmployeeId: row.requesterEmployeeId,
    departmentId: row.departmentId,
    submittedAt: row.submittedAt,
    items: row.items.map(toTicketItemRawView),
  };
}

/** Sole writer of `request_tickets` and repository for ticket views and ticket references. */
@Injectable()
export class RequestTicketRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(
    tx: DbTx,
    input: { organizationId: string; requesterEmployeeId: string; departmentId: string; submittedAt: Date },
  ): Promise<{ id: string }> {
    const created = await tx.requestTicket.create({
      data: {
        organizationId: input.organizationId,
        requesterEmployeeId: input.requesterEmployeeId,
        departmentId: input.departmentId,
        submittedAt: input.submittedAt,
      },
      select: { id: true },
    });

    return { id: created.id };
  }

  async summaryWithItems(
    tx: DbTx,
    ticketId: string,
  ): Promise<{ id: string; requesterEmployeeId: string; items: { requestId: string; position: number }[] } | null> {
    const row = await tx.requestTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        requesterEmployeeId: true,
        items: { select: { id: true, ticketPosition: true }, orderBy: { ticketPosition: 'asc' } },
      },
    });
    if (!row) return null;

    return {
      id: row.id,
      requesterEmployeeId: row.requesterEmployeeId,
      items: row.items.map((item) => {
        if (item.ticketPosition === null) {
          throw new Error(`Ticket item ${item.id} is missing ticketPosition.`);
        }
        return { requestId: item.id, position: item.ticketPosition };
      }),
    };
  }

  async itemsOf(tx: DbTx, ticketId: string): Promise<{ requestId: string; position: number }[]> {
    const rows = await tx.accessRequest.findMany({
      where: { ticketId },
      select: { id: true, ticketPosition: true },
      orderBy: { ticketPosition: 'asc' },
    });

    return rows.map((row) => {
      if (row.ticketPosition === null) {
        throw new Error(`Ticket item ${row.id} is missing ticketPosition.`);
      }
      return { requestId: row.id, position: row.ticketPosition };
    });
  }

  /** Reads a ticket with raw IDs and each item's latest reply without cross-module joins or N+1 fan-out. */
  async view(tx: DbTx, ticketId: string): Promise<RequestTicketRawView | null> {
    const row = await tx.requestTicket.findUnique({
      where: { id: ticketId },
      select: SELECT_TICKET_VIEW,
    });

    return row ? toTicketRawView(row) : null;
  }

  /** Fetches ticket references (id, position, itemCount) for a page of requestIds in one SQL statement. */
  async refsOf(requestIds: readonly string[], tx?: DbTx): Promise<Map<string, TicketRef>> {
    if (requestIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).$queryRaw<TicketRefRow[]>`
      WITH target AS (
        SELECT id, ticket_id, ticket_position
        FROM access_requests
        WHERE id = ANY(${[...requestIds]}::uuid[])
          AND ticket_id IS NOT NULL
      ),
      ticket_counts AS (
        SELECT ticket_id, COUNT(*)::int AS item_count
        FROM access_requests
        WHERE ticket_id IN (SELECT DISTINCT ticket_id FROM target)
        GROUP BY ticket_id
      )
      SELECT
        t.id AS request_id,
        t.ticket_id,
        t.ticket_position,
        tc.item_count
      FROM target t
      JOIN ticket_counts tc ON tc.ticket_id = t.ticket_id`;

    return new Map(
      rows.map((row) => [
        row.request_id,
        { id: row.ticket_id, position: row.ticket_position, itemCount: row.item_count },
      ]),
    );
  }
}
