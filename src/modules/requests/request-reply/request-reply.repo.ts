import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { HumanReturn, LatestReply, ReplyKind } from './request-reply.types';

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

  async latestOf(requestId: string, tx?: DbTx): Promise<LatestReply | null> {
    return (await this.latestOfMany([requestId], tx)).get(requestId) ?? null;
  }

  async latestOfMany(requestIds: readonly string[], tx?: DbTx): Promise<Map<string, LatestReply>> {
    const result = new Map<string, LatestReply>();
    if (requestIds.length === 0) return result;

    const rows = await (tx ?? this.prisma).accessRequestReply.findMany({
      where: { requestId: { in: [...new Set(requestIds)] } },
      orderBy: [{ requestId: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
      distinct: ['requestId'],
      select: {
        requestId: true,
        kind: true,
        note: true,
        createdAt: true,
        author: { select: { id: true, fullName: true } },
      },
    });

    for (const row of rows) {
      result.set(row.requestId, {
        kind: row.kind,
        note: row.note,
        author: { id: row.author.id, name: row.author.fullName },
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

    const returns: HumanReturn[] = [];
    let lastAssessment: StepRow | undefined;

    for (const step of steps) {
      if (step.kind === 'IT_ASSESSMENT') lastAssessment = step;
      const mapped = toHumanReturn(step);
      if (mapped) returns.push(mapped);
    }

    if (lastAssessment?.state === 'CLOSED' && lastAssessment.decidedAt !== null) {
      returns.push({ kind: 'IT_ASSESSMENT', stepId: lastAssessment.id, closedAt: lastAssessment.decidedAt });
    }
    return returns;
  }

  async spendReturnsAwaitingReply(requestIds: readonly string[], tx?: DbTx): Promise<Set<string>> {
    if (requestIds.length === 0) return new Set();

    const rows = await (tx ?? this.prisma).$queryRaw<{ requestId: string }[]>`
      WITH latest_spend_return AS (
        SELECT DISTINCT ON (s.request_id)
               s.request_id,
               s.id AS step_id
          FROM access_request_steps s
          LEFT JOIN approval_records ar ON ar.step_id = s.id AND ar.decision = 'RETURNED'
          LEFT JOIN spend_decisions sd ON sd.step_id = s.id AND sd.decision = 'RETURNED'
         WHERE s.request_id = ANY(${[...new Set(requestIds)]}::uuid[])
           AND s.kind = 'SPEND_APPROVAL'
           AND s.state = 'CLOSED'
           AND (ar.id IS NOT NULL OR sd.step_id IS NOT NULL)
         ORDER BY s.request_id, COALESCE(s.decided_at, ar.decided_at, sd.decided_at) DESC, s.sequence DESC
      )
      SELECT l.request_id AS "requestId"
        FROM latest_spend_return l
       WHERE NOT EXISTS (
         SELECT 1
           FROM access_request_replies r
          WHERE r.request_id = l.request_id
            AND r.returned_step_id = l.step_id
       )`;

    return new Set(rows.map((row) => row.requestId));
  }
}
