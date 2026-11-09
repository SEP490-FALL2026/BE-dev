import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { AssignmentNotFoundError, AssignmentNotOpenError } from '../public/licensing.errors';
import type { AssignmentRecord } from '../public/licensing.types';
import { licensingAuditEvent } from '../licensing-audit-event.mapper';
import { AssignmentRepo } from './assignment.repo';

interface EndInput {
  organizationId: string;
  assignment: AssignmentRecord;
  until: BusinessDate;
  /** The revocation task that ends the seat: the audit event names it, so the end can be read back to its cause. */
  taskId: string;
}

/**
 * The end of a seat that a revocation brings about (`US-07-05`): the seat goes back only when the work behind it is done, on
 * the day the policy of its kind says, or earlier when the access of a K1 seat is cut before the end of the paid period.
 * Always in the caller transaction, under the lock of the subscription and then of the assignment (the order every writer of
 * a seat keeps), each with its audit event.
 */
@Injectable()
export class AssignmentEndService {
  constructor(
    private readonly repo: AssignmentRepo,
    private readonly catalog: CatalogApi,
    private readonly audit: AuditApi,
  ) {}

  /** The assignment, locked `FOR UPDATE` after its subscription. Throws AssignmentNotFoundError. */
  async lock(tx: DbTx, assignmentId: string): Promise<AssignmentRecord> {
    const probe = await this.repo.find(assignmentId, tx);
    if (!probe) throw new AssignmentNotFoundError();
    if (probe.subscriptionId) await this.catalog.lockSeatTarget(tx, { subscriptionId: probe.subscriptionId });
    const current = await this.repo.lock(tx, assignmentId);
    if (!current) throw new AssignmentNotFoundError();

    return current;
  }

  /** Ends the open assignment the day `until` (that day no longer counts). Throws AssignmentNotOpenError. */
  async end(tx: DbTx, actor: AuthenticatedPrincipal, input: EndInput): Promise<void> {
    const { assignment } = input;
    if (assignment.validUntil !== null || assignment.failedAt !== null || assignment.cancelledAt !== null) {
      throw new AssignmentNotOpenError();
    }
    await this.repo.end(tx, assignment.id, input.until);
    await this.record(actor, tx, input, null);
  }

  /** Brings the end of a seat that ends later forward to `until`. Throws AssignmentNotOpenError when it has no end to shorten. */
  async shorten(tx: DbTx, actor: AuthenticatedPrincipal, input: EndInput): Promise<void> {
    const { assignment } = input;
    if (assignment.validUntil === null || assignment.failedAt !== null || assignment.cancelledAt !== null) {
      throw new AssignmentNotOpenError();
    }
    await this.repo.end(tx, assignment.id, input.until);
    await this.record(actor, tx, input, assignment.validUntil);
  }

  private record(actor: AuthenticatedPrincipal, tx: DbTx, input: EndInput, before: BusinessDate | null) {
    return this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        input.organizationId,
        'LICENSE_ASSIGNMENT.ENDED',
        'LicenseAssignment',
        input.assignment.id,
        { validUntil: before },
        { validUntil: input.until, revocationTaskId: input.taskId },
      ),
    );
  }
}
