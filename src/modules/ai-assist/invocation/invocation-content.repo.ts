import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { aiInvocationContextJson, aiInvocationParsedJson, aiInvocationResultJson } from './invocation-content.json';
import { AiInvocationHistoryStore } from './invocation-history-store.types';
import type { InvocationContentRecord } from './invocation.types';

/** The contents a purge may delete: those of calls that are over. A live call (PENDING, RUNNING) still has its content to write into. */
const PURGEABLE = { invocation: { status: { notIn: ['PENDING', 'RUNNING'] as Array<'PENDING' | 'RUNNING'> } } };

/**
 * What was said to the model and what it answered (`ai_invocation_contents`), apart from the calls themselves: the PostgreSQL
 * `AiInvocationHistoryStore`. It writes the context when a call is admitted and the answer when the run ends, reads one content for
 * the Super Admin, and purges by cut-off date, deleting contents and keeping `ai_invocations`.
 */
@Injectable()
export class AiInvocationContentRepo implements AiInvocationHistoryStore {
  constructor(private readonly prisma: PrismaService) {}

  /** The content row of a call just inserted: its context, nothing answered yet (`findOwned` relies on the row existing). */
  async recordAdmitted(tx: DbTx, call: Parameters<AiInvocationHistoryStore['recordAdmitted']>[1]): Promise<void> {
    await tx.aiInvocationContent.create({
      data: {
        invocationId: call.invocationId,
        context: aiInvocationContextJson.encode(call.context),
        createdAt: call.at,
      },
    });
  }

  /** What was sent and what came back, written into the row of the call; the context is already there. */
  async recordAnswered(tx: DbTx, call: Parameters<AiInvocationHistoryStore['recordAnswered']>[1]): Promise<void> {
    await tx.aiInvocationContent.update({
      where: { invocationId: call.invocationId },
      data: {
        promptText: call.answer.promptText,
        rawResponse: call.answer.rawResponse,
        parsed: aiInvocationParsedJson.encode(call.answer.parsed),
        result: aiInvocationResultJson.encode(call.answer.result),
      },
    });
  }

  /** The content of one call with the organization and the mode of the call, or null when there is none (never made, or purged). */
  async find(tx: DbTx, invocationId: string): Promise<InvocationContentRecord | null> {
    const row = await tx.aiInvocationContent.findUnique({
      where: { invocationId },
      select: {
        context: true,
        promptText: true,
        rawResponse: true,
        parsed: true,
        result: true,
        invocation: { select: { organizationId: true, providerMode: true } },
      },
    });
    if (!row) return null;

    return {
      invocationId,
      organizationId: row.invocation.organizationId,
      providerMode: row.invocation.providerMode,
      context: aiInvocationContextJson.decode(row.context),
      promptText: row.promptText,
      rawResponse: row.rawResponse,
      parsed: aiInvocationParsedJson.decode(row.parsed),
      result: aiInvocationResultJson.decode(row.result),
    };
  }

  /** How many contents of calls that are not live were created before `before` (exclusive): what `purge` would delete. */
  countPurgeable(before: Date): Promise<number> {
    return this.prisma.aiInvocationContent.count({ where: { ...PURGEABLE, createdAt: { lt: before } } });
  }

  /**
   * Deletes the contents of calls that are not live created before `before` (exclusive) and returns how many; the calls stay. A
   * COMPLETED call whose content goes becomes STALE first, in the same transaction: it no longer holds the place of its queue
   * revision (the partial unique index keeps PENDING, RUNNING, COMPLETED), so the person asking again for an unchanged queue gets a
   * new call instead of the purged one. FAILED and NO_VALID_OUTPUT hold no place and keep their status.
   */
  async purge(tx: DbTx, before: Date): Promise<number> {
    await tx.aiInvocation.updateMany({
      where: { status: 'COMPLETED', content: { is: { createdAt: { lt: before } } } },
      data: { status: 'STALE' },
    });
    const { count } = await tx.aiInvocationContent.deleteMany({ where: { ...PURGEABLE, createdAt: { lt: before } } });

    return count;
  }
}
