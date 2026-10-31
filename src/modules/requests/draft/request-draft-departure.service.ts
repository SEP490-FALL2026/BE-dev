import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { contentOf, draftSnapshot } from './request-draft-content.mapper';
import { RequestDraftRepo } from '../request-draft/request-draft.repo';

/**
 * The drafts of a person who leaves go with them (`US-03-04`): when the departure takes effect, in the transaction in which the
 * organization says so, every draft the person saved is deleted with what hangs from it, and the Audit Trail says so for each, by the
 * system. A draft is nobody else's: no other person sent it, decides it or is told of it, so nothing is left to close and nobody to warn.
 */
@Injectable()
export class RequestDraftDepartureService {
  constructor(
    private readonly drafts: RequestDraftRepo,
    private readonly audit: AuditApi,
  ) {}

  /** Returns how many drafts were deleted. The correlation id is the id of the change of the organization that said the person left. */
  async deleteOf(tx: DbTx, employeeId: string, correlationId: string): Promise<number> {
    const rows = await this.drafts.lockOfRequester(tx, employeeId);
    for (const row of rows) {
      const before = draftSnapshot(row, contentOf(row));
      await this.drafts.delete(tx, row.id);
      // Nobody acted: the organization said the person left, so the actor is the system and the event says where it came from.
      await this.audit.record(tx, {
        organizationId: row.organizationId,
        actorKind: 'SYSTEM',
        actorAppUserId: null,
        actorRoles: [],
        action: 'ACCESS_REQUEST.DRAFT_DELETED',
        resourceType: 'ACCESS_REQUEST',
        resourceId: row.id,
        before,
        after: { reason: 'REQUESTER_LEFT' },
        correlationId,
      });
    }

    return rows.length;
  }
}
