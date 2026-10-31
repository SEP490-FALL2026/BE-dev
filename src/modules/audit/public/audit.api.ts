import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { UnsafeAuditPayloadError } from '../audit.errors';
import { AuditRepo } from '../audit.repo';
import { AuditCursor, AuditEventInput, AuditEventSlice, AuditValue } from './audit.types';

/** Keys that must never be written to the Audit Trail (US-01-10 AC-9, FR-8.11(b)). */
const FORBIDDEN_KEY = /pass(word)?|hash|token|secret|cookie|credential|authorization|pepper/i;

function assertSafe(value: AuditValue | undefined, path: string): void {
  if (value === null || value === undefined || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafe(item, `${path}[${index}]`));
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) throw new UnsafeAuditPayloadError(`${path}.${key}`);
    assertSafe(nested, `${path}.${key}`);
  }
}

/** Public facade of the audit module. */
@Injectable()
export class AuditApi {
  constructor(private readonly repo: AuditRepo) {}

  /** Records an event in the caller's transaction. Throws if the payload would store a secret. */
  async record(tx: DbTx, event: AuditEventInput): Promise<void> {
    assertSafe(event.before ?? null, 'before');
    assertSafe(event.after ?? null, 'after');
    await this.repo.insert(tx, event);
  }

  /**
   * The next events of the named actions after the cursor, oldest first, none newer than `upTo`, at most `limit`, for a consumer
   * of the system (the projection of the status of requests into the inbox). A consumer keeps the cursor of the last event it
   * handled and passes an `upTo` old enough that no transaction can still commit an event older than the cursor: an event is
   * stamped with the writing process's clock when its insert is sent, before it commits. Never reachable through HTTP; the
   * trail is read by the Super Admin through its own query.
   */
  readSince(
    tx: DbTx,
    cursor: AuditCursor | null,
    options: { upTo: Date; actions: readonly string[]; limit: number },
  ): Promise<AuditEventSlice[]> {
    return this.repo.readSince(tx, cursor, options);
  }

  /**
   * How many events each named action has in the trail, zero included, in the caller's transaction. Counts only: no
   * payload, actor or resource leaves the module (the installation inspection, `ops:inspect`).
   */
  async countByAction(tx: DbTx, actions: readonly string[]): Promise<Map<string, number>> {
    const found = await this.repo.countByAction(tx, actions);

    return new Map(actions.map((action) => [action, found.get(action) ?? 0]));
  }
}
