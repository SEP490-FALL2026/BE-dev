import { Injectable } from '@nestjs/common';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { UnsafeAuditPayloadError } from './audit.errors';
import { AuditRepo } from './audit.repo';
import { AuditEventInput, AuditValue } from './audit.types';

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
export class AuditService {
  constructor(private readonly repo: AuditRepo) {}

  /** Records an event in the caller's transaction. Throws if the payload would store a secret. */
  async record(tx: DbTx, event: AuditEventInput): Promise<void> {
    assertSafe(event.before ?? null, 'before');
    assertSafe(event.after ?? null, 'after');
    await this.repo.insert(tx, event);
  }
}
