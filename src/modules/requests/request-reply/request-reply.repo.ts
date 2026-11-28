import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { pendingHumanReturn } from './request-reply.policy';
import type { HumanReturn, LatestReplyRow, ReplyKind } from './request-reply.types';

interface StepRow {
  id: string;
  kind: string;
  state: string;
  decidedAt: Date | null;
  approvalRecord: { decision: string; decidedAt: Date } | null;
  spendDecision: { decision: string; decidedAt: Date } | null;
}

function spendReturnAt(step: StepRow): Date | null {
  if (step.approvalRecord?.decision === 'RETURNED') return step.decidedAt ?? step.approvalRecord.decidedAt;
  if (step.spendDecision?.decision === 'RETURNED') return step.decidedAt ?? step.spendDecision.decidedAt;
  return null;
}

function toHumanReturn(step: StepRow): HumanReturn | null {
  if (step.state !== 'CLOSED') return null;
  if (step.kind === 'NEED' && step.approvalRecord?.decision === 'RETURNED') {
    return { kind: 'NEED', stepId: step.id, closedAt: step.decidedAt ?? step.approvalRecord.decidedAt };
  }
  if (step.kind !== 'SPEND_APPROVAL') return null;
  const closedAt = spendReturnAt(step);
  return closedAt ? { kind: 'SPEND', stepId: step.id, closedAt } : null;
}

function extractHumanReturns(steps: readonly StepRow[]): HumanReturn[] {
  const returns: HumanReturn[] = [];
  let lastAssessment: StepRow | undefined;

  for (const step of steps) {
    if (step.kind === 'IT_ASSESSMENT') lastAssessment = step;
    const mapped = toHumanReturn(step);
    if (mapped) returns.push(mapped);
  }

  // Only a CLOSED IT_ASSESSMENT step sent the proposal back; COMPLETED does not require a reply note.
  if (lastAssessment?.state === 'CLOSED' && lastAssessment.decidedAt !== null) {
    returns.push({ kind: 'IT_ASSESSMENT', stepId: lastAssessment.id, closedAt: lastAssessment.decidedAt });
  }
  return returns;
}

function groupStepsByRequest(rows: readonly (StepRow & { requestId: string })[]): Map<string, StepRow[]> {
  const map = new Map<string, StepRow[]>();
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

  async repliedStepIds(tx: DbTx, requestId: string): Promise<Set<string>> {
    const rows = await tx.accessRequestReply.findMany({
      where: { requestId, returnedStepId: { not: null } },
      select: { returnedStepId: true },
    });
    const ids = new Set<string>();
    for (const row of rows) {
      if (row.returnedStepId !== null) ids.add(row.returnedStepId);
    }
    return ids;
  }

  async humanReturnsOf(tx: DbTx, requestId: string): Promise<HumanReturn[]> {
    const steps = await tx.accessRequestStep.findMany({
      where: { requestId },
      orderBy: { sequence: 'asc' },
      select: {
        id: true,
        kind: true,
        state: true,
        decidedAt: true,
        approvalRecord: { select: { decision: true, decidedAt: true } },
        spendDecision: { select: { decision: true, decidedAt: true } },
      },
    });

    return extractHumanReturns(steps);
  }

  /**
   * Single shared definition for queue (`replyNoteRequired`) and batch submission (`REPLY_NOTE_REQUIRED`):
   * loads steps + replies for all given request IDs and evaluates `pendingHumanReturn`.
   */
  async pendingSpendReturnsOf(requestIds: readonly string[], tx?: DbTx): Promise<Map<string, HumanReturn>> {
    const pendingByRequest = new Map<string, HumanReturn>();
    if (requestIds.length === 0) return pendingByRequest;
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
        state: true,
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
      const returns = extractHumanReturns(stepsByRequest.get(requestId) ?? []);
      const repliedStepIds = repliedByRequest.get(requestId) ?? new Set<string>();
      const pending = pendingHumanReturn({ returns, repliedStepIds });
      if (pending?.kind === 'SPEND') pendingByRequest.set(requestId, pending);
    }

    return pendingByRequest;
  }

  async spendReturnsAwaitingReply(requestIds: readonly string[], tx?: DbTx): Promise<Set<string>> {
    return new Set((await this.pendingSpendReturnsOf(requestIds, tx)).keys());
  }
}
