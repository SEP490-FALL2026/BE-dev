import { Injectable } from '@nestjs/common';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { OrganizationService } from '../../organization/organization.service';
import { SeatBaselineClosedError } from '../licensing.errors';
import { licensingAuditEvent } from '../mappers/licensing-audit-event';
import { SeatBaselineRepo } from './seat-baseline.repo';

/**
 * Whether the seat baseline, step 4 of the installation, is closed (`US-02-05` AC-6, `OI-10`, `BR-01.7`). Closing is
 * the IT Admin saying the step is done; from then on no assignment is taken without a request, whatever route it would
 * come by. It is final: nothing reopens it, and the database refuses to.
 */
@Injectable()
export class SeatBaselineService {
  constructor(
    private readonly repo: SeatBaselineRepo,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
  ) {}

  async state(tx?: DbTx): Promise<{ closed: boolean; closedAt: Date | null }> {
    const organization = await this.requireOrganization(tx);
    const state = await this.repo.read(organization.id, tx);

    return { closed: state.closedAt !== null, closedAt: state.closedAt };
  }

  /**
   * Closes the baseline, once. The state is locked `FOR UPDATE`, so a confirmation that holds it `FOR SHARE` finishes
   * first and one that comes later is refused. Closing again changes nothing and says so.
   */
  async close(actor: AuthenticatedPrincipal): Promise<{ closedAt: Date; alreadyClosed: boolean }> {
    const organization = await this.requireOrganization();

    return this.runner.run(async (tx) => {
      const state = await this.repo.lock(tx, organization.id, 'UPDATE');
      if (state.closedAt) return { closedAt: state.closedAt, alreadyClosed: true };

      const closedAt = await this.repo.close(tx, organization.id, actor.appUserId);
      await this.audit.record(
        tx,
        licensingAuditEvent(
          actor,
          organization.id,
          'SEAT_BASELINE.CLOSED',
          'SeatBaseline',
          organization.id,
          { closed: false },
          { closed: true, closedAt: closedAt.toISOString() },
        ),
      );

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
    const organization = await this.organization.getOrganization(tx);
    if (!organization) throw new Error('The seat baseline was read before installation');

    return organization;
  }
}
