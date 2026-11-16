import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { QueueContext } from '../ai-service/ai-service.types';
import type { InvocationContentRecord, InvocationOutcome } from './invocation.types';

/** Where what was said to the model and what came back is kept (QĐ-102g). PostgreSQL in this repo; another store may replace it. */
export abstract class AiInvocationHistoryStore {
  /** The call as admitted: its context, nothing answered yet. In the transaction that inserts the call. */
  abstract recordAdmitted(
    tx: DbTx,
    call: { invocationId: string; organizationId: string; context: QueueContext; at: Date },
  ): Promise<void>;

  /** The call as it ended with an answer. In the transaction that finished it; only called when the run was the one to finish it. */
  abstract recordAnswered(
    tx: DbTx,
    call: {
      invocationId: string;
      organizationId: string;
      context: QueueContext;
      answer: NonNullable<InvocationOutcome['content']>;
      at: Date;
    },
  ): Promise<void>;

  /** The content for the Super Admin, or null when there is none (never made, or purged). */
  abstract find(tx: DbTx, invocationId: string): Promise<InvocationContentRecord | null>;

  /** How many contents a purge through `before` (exclusive) would delete; live calls (PENDING, RUNNING) never count. */
  abstract countPurgeable(before: Date): Promise<number>;

  /** Deletes them in the caller's transaction and returns how many; a COMPLETED call whose content goes becomes STALE first. */
  abstract purge(tx: DbTx, before: Date): Promise<number>;
}
