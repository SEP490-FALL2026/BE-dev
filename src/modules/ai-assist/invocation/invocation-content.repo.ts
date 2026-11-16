import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { aiInvocationContextJson, aiInvocationParsedJson, aiInvocationResultJson } from './invocation-content.json';
import type { InvocationContentRecord } from './invocation.types';

/** The contents a purge may delete: those of calls that are over. A live call (PENDING, RUNNING) still has its content to write into. */
const PURGEABLE = { invocation: { status: { notIn: ['PENDING', 'RUNNING'] as Array<'PENDING' | 'RUNNING'> } } };

/**
 * What was said to the model and what it answered (`ai_invocation_contents`), apart from the calls themselves: the read of one
 * content by the Super Admin, and the purge by cut-off date that deletes contents and keeps `ai_invocations`.
 */
@Injectable()
export class AiInvocationContentRepo {
  constructor(private readonly prisma: PrismaService) {}

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

  /** How many contents of calls that are not live were created before `before` (exclusive): what `deleteCreatedBefore` would delete. */
  countCreatedBefore(before: Date, tx?: DbTx): Promise<number> {
    return (tx ?? this.prisma).aiInvocationContent.count({ where: { ...PURGEABLE, createdAt: { lt: before } } });
  }

  /**
   * Deletes the contents of calls that are not live created before `before` (exclusive) and returns how many; the calls stay. A
   * COMPLETED call whose content goes becomes STALE first, in the same transaction: it no longer holds the place of its queue
   * revision (the partial unique index keeps PENDING, RUNNING, COMPLETED), so the person asking again for an unchanged queue gets a
   * new call instead of the purged one. FAILED and NO_VALID_OUTPUT hold no place and keep their status.
   */
  async deleteCreatedBefore(tx: DbTx, before: Date): Promise<number> {
    await tx.aiInvocation.updateMany({
      where: { status: 'COMPLETED', content: { is: { createdAt: { lt: before } } } },
      data: { status: 'STALE' },
    });
    const { count } = await tx.aiInvocationContent.deleteMany({ where: { ...PURGEABLE, createdAt: { lt: before } } });

    return count;
  }
}
