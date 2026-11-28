import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { LatestReplyRow, ReplyKind, ReturnFacts, ReturnStepFact } from './request-reply.types';

function groupStepsByRequest(rows: readonly (ReturnStepFact & { requestId: string })[]): Map<string, ReturnStepFact[]> {
  const map = new Map<string, ReturnStepFact[]>();
  for (const row of rows) {
    const list = map.get(row.requestId) ?? [];
    list.push(row);
    map.set(row.requestId, list);
  }
  return map;
}

function groupRepliedStepIds(
  rows: readonly { requestId: string; returnedStepId: string | null }[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.returnedStepId === null) continue;
    const set = map.get(row.requestId) ?? new Set<string>();
    set.add(row.returnedStepId);
    map.set(row.requestId, set);
  }
  return map;
}

@Injectable()
export class RequestReplyRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(
    tx: DbTx,
    input: {
      organizationId: string;
      requestId: string;
      kind: ReplyKind;
      returnedStepId: string | null;
      note: string;
      authorEmployeeId: string;
    },
  ): Promise<{ id: string }> {
    return tx.accessRequestReply.create({
      data: {
        organizationId: input.organizationId,
        requestId: input.requestId,
        kind: input.kind,
        returnedStepId: input.returnedStepId,
        note: input.note,
        authorEmployeeId: input.authorEmployeeId,
      },
      select: { id: true },
    });
  }

  async latestOf(requestId: string, tx?: DbTx): Promise<LatestReplyRow | null> {
    return (await this.latestOfMany([requestId], tx)).get(requestId) ?? null;
  }

  async latestOfMany(requestIds: readonly string[], tx?: DbTx): Promise<Map<string, LatestReplyRow>> {
    const result = new Map<string, LatestReplyRow>();
    if (requestIds.length === 0) return result;

    const rows = await (tx ?? this.prisma).accessRequestReply.findMany({
      where: { requestId: { in: [...new Set(requestIds)] } },
      orderBy: [{ requestId: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
      distinct: ['requestId'],
      select: {
        requestId: true,
        kind: true,
        note: true,
        authorEmployeeId: true,
        createdAt: true,
      },
    });

    for (const row of rows) {
      result.set(row.requestId, {
        kind: row.kind,
        note: row.note,
        authorEmployeeId: row.authorEmployeeId,
        createdAt: row.createdAt,
      });
    }
    return result;
  }

  /** Loads raw step histories and replied returnedStepIds for each requestId in two batch queries. */
  async returnFactsOf(requestIds: readonly string[], tx?: DbTx): Promise<Map<string, ReturnFacts>> {
    const result = new Map<string, ReturnFacts>();
    if (requestIds.length === 0) return result;
    const uniqueIds = [...new Set(requestIds)];
    const db = tx ?? this.prisma;

    // Sequential queries avoid Promise.all over the same Prisma transaction client (R2).
    const stepRows = await db.accessRequestStep.findMany({
      where: { requestId: { in: uniqueIds } },
      orderBy: [{ requestId: 'asc' }, { sequence: 'asc' }],
      select: {
        requestId: true,
        id: true,
        kind: true,
        sequence: true,
        state: true,
        createdAt: true,
        decidedAt: true,
        approvalRecord: { select: { decision: true, decidedAt: true } },
        spendDecision: { select: { decision: true, decidedAt: true } },
      },
    });
    const replyRows = await db.accessRequestReply.findMany({
      where: { requestId: { in: uniqueIds }, returnedStepId: { not: null } },
      select: { requestId: true, returnedStepId: true },
    });

    const stepsByRequest = groupStepsByRequest(stepRows);
    const repliedByRequest = groupRepliedStepIds(replyRows);

    for (const requestId of uniqueIds) {
      result.set(requestId, {
        steps: stepsByRequest.get(requestId) ?? [],
        repliedStepIds: repliedByRequest.get(requestId) ?? new Set<string>(),
      });
    }

    return result;
  }
}
