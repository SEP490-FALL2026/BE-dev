import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { QueueContext } from '../ai-service/ai-service.types';
import type { InvocationContentRecord, InvocationOutcome } from './invocation.types';

/**
 * Where what was said to the model and what came back is kept (QĐ-102g). PostgreSQL in this repo; another store may replace it.
 *
 * Every method runs in the PostgreSQL transaction of its caller, and that transaction may roll back after the method returned: a
 * store outside PostgreSQL must not be written to directly in a method, but through a record kept in `tx` (an outbox) and sent
 * after the commit.
 *
 * `AiInvocationRepo.findOwned` stays outside this port and reads PostgreSQL: it takes the row of `ai_invocation_contents` as the
 * mark of "not purged" and reads its `result` column. The PostgreSQL store writes both (`recordAdmitted` the row, `recordAnswered`
 * the column); another store has to keep that part in PostgreSQL too, or change `findOwned` and `purge` to its own mark.
 */
export abstract class AiInvocationHistoryStore {
  /**
   * The call as admitted: its context, nothing answered yet. In the transaction that inserts the call. `AiInvocationRepo.findOwned`
   * relies on the row the PostgreSQL store writes here.
   */
  abstract recordAdmitted(
    tx: DbTx,
    call: { invocationId: string; organizationId: string; context: QueueContext; at: Date },
  ): Promise<void>;

  /**
   * The call as it ended with an answer. In the transaction that finished it; only called when the run was the one to finish it.
   * `AiInvocationRepo.findOwned` reads the `result` column the PostgreSQL store writes here.
   */
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
