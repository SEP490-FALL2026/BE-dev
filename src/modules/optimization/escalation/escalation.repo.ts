import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { escalationResultsJson } from './escalation-results.json';
import type { EscalationItemResult } from './escalation.types';

/** The batch a key named before: what it asked and what it answered. */
export interface RecordedEscalation {
  id: string;
  requestHash: string;
  results: EscalationItemResult[];
}

export interface EscalationKey {
  organizationId: string;
  requestedByAppUserId: string;
  idempotencyKeyHash: string;
}

/** The batches of early pushes, one for each Idempotency-Key of a person: the key is taken before anything is done, so two calls with one key never both act. */
@Injectable()
export class EscalationRepo {
  /**
   * Takes the key for this batch: its id, or null when the key is already taken. A call that finds the key taken by a transaction still open waits
   * for it to end, so the answer it reads next is the one that was committed.
   */
  async claim(
    tx: DbTx,
    key: EscalationKey,
    input: { requestHash: string; note: string | null },
  ): Promise<string | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "ghost_seat_escalations" ("organization_id", "requested_by_app_user_id", "idempotency_key_hash", "request_hash", "note")
      VALUES (${key.organizationId}::uuid, ${key.requestedByAppUserId}::uuid, ${key.idempotencyKeyHash}, ${input.requestHash}, ${input.note})
      ON CONFLICT ("organization_id", "requested_by_app_user_id", "idempotency_key_hash") DO NOTHING
      RETURNING "id"`;

    return rows[0]?.id ?? null;
  }

  async findByKey(tx: DbTx, key: EscalationKey): Promise<RecordedEscalation | null> {
    const row = await tx.ghostSeatEscalation.findUnique({
      where: {
        organizationId_requestedByAppUserId_idempotencyKeyHash: {
          organizationId: key.organizationId,
          requestedByAppUserId: key.requestedByAppUserId,
          idempotencyKeyHash: key.idempotencyKeyHash,
        },
      },
    });

    return row
      ? { id: row.id, requestHash: row.requestHash, results: escalationResultsJson.decode(row.results) }
      : null;
  }

  async saveResults(tx: DbTx, id: string, results: EscalationItemResult[]): Promise<void> {
    await tx.ghostSeatEscalation.update({ where: { id }, data: { results: escalationResultsJson.encode(results) } });
  }
}
