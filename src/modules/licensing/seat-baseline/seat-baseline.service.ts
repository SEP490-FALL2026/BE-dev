import { Injectable } from '@nestjs/common';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AssignmentService } from '../assignment/assignment.service';
import { SeatBaselineClosedError } from '../public/licensing.errors';
import { SeatBaselineClosedListeners } from '../public/licensing.extension-points';
import type { SeatBaselineClosedHolder } from '../public/licensing.types';
import { licensingAuditEvent } from '../licensing-audit-event.mapper';
import { SeatBaselineRepo } from './seat-baseline.repo';

/**
 * Whether the seat baseline, step 4 of the installation, is closed (`US-02-05` AC-6, `OI-10`, `BR-01.7`). Closing is
 * the IT Admin saying the step is done; from then on no assignment is taken without a request, whatever route it would
 * come by. It is final: nothing reopens it, and the database refuses to. Closing tells the modules listening for it, in its own
 * transaction, which people hold a seat on another department's subscription, for the review their own head makes (`QĐ-89e`).
 */
@Injectable()
export class SeatBaselineService {
  constructor(
    private readonly repo: SeatBaselineRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly assignments: AssignmentService,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
    private readonly closedListeners: SeatBaselineClosedListeners,
  ) {}

  async state(tx?: DbTx): Promise<{ closed: boolean; closedAt: Date | null }> {
    const organization = await this.requireOrganization(tx);
    const state = await this.repo.read(organization.id, tx);

    return { closed: state.closedAt !== null, closedAt: state.closedAt };
  }

  /**
   * Closes the baseline, once. The state is locked `FOR UPDATE`, so a confirmation that holds it `FOR SHARE` finishes
   * first and one that comes later is refused. Closing again changes nothing and says so. The people who hold a seat of another
   * department's subscription are found in the same transaction and told to every listener (none: nobody is told).
   */
  async close(actor: AuthenticatedPrincipal): Promise<{ closedAt: Date; alreadyClosed: boolean }> {
    const organization = await this.requireOrganization();

    return this.runner.run(async (tx) => {
      const state = await this.repo.lock(tx, organization.id, 'UPDATE');
      if (state.closedAt) return { closedAt: state.closedAt, alreadyClosed: true };

      const closedAt = await this.repo.close(tx, organization.id, actor.appUserId);
      const closedOn = await this.organizationReads.businessToday(closedAt, tx);
      // The pool is shared by every department (`QĐ-103d`), so no seat is held in another department's subscription to review (`QĐ-89e`).
      const holders: SeatBaselineClosedHolder[] = [];
      await this.audit.record(
        tx,
        licensingAuditEvent(
          actor,
          organization.id,
          'SEAT_BASELINE.CLOSED',
          'SeatBaseline',
          organization.id,
          { closed: false },
          // Only how many people the review will concern: who they are is for the review, not for the trail of the closing.
          { closed: true, closedAt: closedAt.toISOString(), holdersOfOtherDepartments: holders.length },
        ),
      );
      await this.closedListeners.emit(tx, { organizationId: organization.id, closedOn, holders });

      return { closedAt, alreadyClosed: false };
    });
  }

  /** Holds the state `FOR SHARE` until the transaction ends, so a closing waits for it. Throws SeatBaselineClosedError. */
  async lockOpen(tx: DbTx): Promise<void> {
    const organization = await this.requireOrganization(tx);
    const state = await this.repo.lock(tx, organization.id, 'SHARE');
    if (state.closedAt) throw new SeatBaselineClosedError();
  }

  private async requireOrganization(tx?: DbTx) {
    const organization = await this.organizationReads.getOrganization(tx);
    if (!organization) throw new Error('The seat baseline was read before installation');

    return organization;
  }
}
