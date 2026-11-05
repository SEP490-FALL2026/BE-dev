import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { aiInvocationContextJson, aiInvocationParsedJson, aiInvocationResultJson } from './invocation-content.json';
import type {
  InvocationKey,
  InvocationMetadata,
  InvocationOutcome,
  InvocationRecord,
  LiveInvocation,
  NewInvocation,
} from './invocation.types';

/** The statuses that hold the place of a queue revision: the partial unique index of the migration. */
const KEPT_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED'] as const;
const LIVE_STATUSES = ['PENDING', 'RUNNING'] as const;
const isKept = (status: string): status is LiveInvocation['status'] =>
  (KEPT_STATUSES as readonly string[]).includes(status);
/** The code of a run taken for stuck. */
const STUCK_CODE = 'AI.PROVIDER_TIMEOUT';

const NO_METADATA = {
  modelId: null,
  modelRevision: null,
  promptVersion: null,
  schemaVersion: null,
  configHash: null,
  latencyMs: null,
  promptTokens: null,
  completionTokens: null,
};

/** The columns of what the AI service said about itself; all NULL for a call it never answered. */
function metadataColumns(metadata: InvocationMetadata | null) {
  if (metadata === null) return NO_METADATA;
  const { configFingerprint, ...columns } = metadata;

  return { ...columns, configHash: configFingerprint };
}

/** The calls of one person and feature, whatever else the key object carries. */
const whose = (key: InvocationKey) => ({
  organizationId: key.organizationId,
  actorAppUserId: key.actorAppUserId,
  feature: key.feature,
});

/** A live call that started (or, never started, was made) before `startedBefore`. */
const stuckSince = (startedBefore: Date) => ({
  status: { in: [...LIVE_STATUSES] },
  OR: [{ startedAt: { lt: startedBefore } }, { startedAt: null, createdAt: { lt: startedBefore } }],
});

/**
 * The calls of the AI and what was said in them (`ai_invocations`, `ai_invocation_contents`). Every change of status is conditional
 * on the status it leaves, so a run that finishes late never overwrites a call that was taken for stuck, and the other way round.
 */
@Injectable()
export class AiInvocationRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** A new call with its context. A second call kept for the same revision is refused by the unique index (P2002). */
  async insert(tx: DbTx, input: NewInvocation): Promise<{ id: string }> {
    const row = await tx.aiInvocation.create({
      data: {
        organizationId: input.organizationId,
        feature: input.feature,
        actorAppUserId: input.actorAppUserId,
        actorEmployeeId: input.actorEmployeeId,
        status: input.status,
        sourceRevision: input.sourceRevision,
        errorCode: input.errorCode,
        createdAt: input.at,
        finishedAt: input.status === 'FAILED' ? input.at : null,
        content: { create: { context: aiInvocationContextJson.encode(input.context), createdAt: input.at } },
      },
      select: { id: true },
    });

    return { id: row.id };
  }

  /** The call kept for this queue revision of the person, if any. */
  async findLive(key: InvocationKey & { sourceRevision: string }, tx?: DbTx): Promise<LiveInvocation | null> {
    const row = await (tx ?? this.prisma).aiInvocation.findFirst({
      where: { ...whose(key), sourceRevision: key.sourceRevision, status: { in: [...KEPT_STATUSES] } },
      select: { id: true, status: true },
    });

    return row && isKept(row.status) ? { id: row.id, status: row.status } : null;
  }

  /** The live calls of the person that started before `startedBefore`. */
  async stuckOf(tx: DbTx, key: InvocationKey, startedBefore: Date): Promise<string[]> {
    const rows = await tx.aiInvocation.findMany({
      where: { ...whose(key), ...stuckSince(startedBefore) },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => row.id);
  }

  /** Takes the call for stuck: FAILED with `AI.PROVIDER_TIMEOUT`, when it is still live and started before `startedBefore`. */
  async expire(tx: DbTx, id: string, startedBefore: Date, at: Date): Promise<boolean> {
    const { count } = await tx.aiInvocation.updateMany({
      where: { id, ...stuckSince(startedBefore) },
      data: { status: 'FAILED', errorCode: STUCK_CODE, finishedAt: at },
    });

    return count === 1;
  }

  /** PENDING → RUNNING; false when the call is no longer pending. */
  async markRunning(id: string, at: Date): Promise<boolean> {
    const { count } = await this.prisma.aiInvocation.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'RUNNING', startedAt: at },
    });

    return count === 1;
  }

  /** RUNNING → the outcome, with what the service answered; false (and nothing written) when the call is no longer running. */
  async finish(tx: DbTx, id: string, outcome: InvocationOutcome, at: Date): Promise<boolean> {
    const { count } = await tx.aiInvocation.updateMany({
      where: { id, status: 'RUNNING' },
      data: {
        status: outcome.status,
        errorCode: outcome.errorCode,
        finishedAt: at,
        ...metadataColumns(outcome.metadata),
      },
    });
    if (count !== 1) return false;
    if (outcome.content !== null) {
      await tx.aiInvocationContent.update({
        where: { invocationId: id },
        data: {
          promptText: outcome.content.promptText,
          rawResponse: outcome.content.rawResponse,
          parsed: aiInvocationParsedJson.encode(outcome.content.parsed),
          result: aiInvocationResultJson.encode(outcome.content.result),
        },
      });
    }

    return true;
  }

  /**
   * The call if this account made it, with the result of its checks; null for a call of anybody else, and for a call whose content
   * was purged (`ops:ai-purge`): every call is made with its content row, so a call with none had it deleted, and what is left of it
   * is metadata that shows no summary.
   */
  async findOwned(id: string, actorAppUserId: string, tx?: DbTx): Promise<InvocationRecord | null> {
    const row = await (tx ?? this.prisma).aiInvocation.findFirst({
      where: { id, actorAppUserId, content: { isNot: null } },
      select: {
        id: true,
        organizationId: true,
        feature: true,
        actorAppUserId: true,
        actorEmployeeId: true,
        status: true,
        sourceRevision: true,
        errorCode: true,
        createdAt: true,
        startedAt: true,
        content: { select: { result: true } },
      },
    });
    if (!row) return null;
    const { content, ...invocation } = row;

    return { ...invocation, result: aiInvocationResultJson.decode(content?.result ?? null) };
  }
}
