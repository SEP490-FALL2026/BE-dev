import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuditCursor } from '../../audit/public/audit.types';

const CURSOR_NAME = 'REQUEST_STATUS';

interface CursorRow {
  last_occurred_at: Date;
  last_event_id: string;
}

/**
 * The one writer of `request_status_cursor`: where the projection of the audit events into the inbox has got to. It is locked for
 * the length of a pass (`FOR UPDATE SKIP LOCKED`), so a second worker finds it taken and does nothing that round.
 */
@Injectable()
export class StatusCursorRepo {
  /** Takes the cursor for this transaction; null when another pass holds it. Instants are read back as dates by the driver. */
  async lock(tx: DbTx): Promise<AuditCursor | null> {
    const rows = await tx.$queryRaw<CursorRow[]>`
      SELECT last_occurred_at, last_event_id FROM request_status_cursor
       WHERE name = ${CURSOR_NAME} FOR UPDATE SKIP LOCKED`;

    return rows.length === 0 ? null : { occurredAt: rows[0].last_occurred_at, id: rows[0].last_event_id };
  }

  /** Moves the cursor forward in the transaction that holds it. */
  async advance(tx: DbTx, to: AuditCursor): Promise<void> {
    const occurredAt = to.occurredAt.toISOString();
    await tx.$executeRaw`
      UPDATE request_status_cursor
         SET last_occurred_at = ${occurredAt}::timestamptz, last_event_id = ${to.id}::uuid, updated_at = now()
       WHERE name = ${CURSOR_NAME}`;
  }
}
