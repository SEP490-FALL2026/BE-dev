import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { licensingAuditEvent } from '../../licensing-audit-event.mapper';
import type { PurchaseNotAllowedError } from '../../shared-pool/shared-pool.errors';

/**
 * Records that a purchase asked for with a grant was refused because the pool of the plan still had a free seat (`BR-MF1-09a`, `US-07-13`
 * AC-2: the refusal and the number of free seats are kept). The grant itself rolled back, so the record is written in a transaction of its
 * own, after it: nothing else of the refused grant is kept.
 */
@Injectable()
export class ProvisioningPurchaseRefusal {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly audit: AuditApi,
  ) {}

  async record(
    actor: AuthenticatedPrincipal,
    facts: { organizationId: string; requestId: string; planId: string; refusal: PurchaseNotAllowedError },
  ): Promise<void> {
    const { refusal } = facts;
    await this.runner.run((tx) =>
      this.audit.record(
        tx,
        licensingAuditEvent(
          actor,
          facts.organizationId,
          'PROVISIONING_TASK.PURCHASE_REFUSED',
          'AccessRequest',
          facts.requestId,
          null,
          {
            requestId: facts.requestId,
            planId: facts.planId,
            freeSeats: refusal.freeSeats,
            subscriptionIds: [...refusal.subscriptionIds],
          },
        ),
      ),
    );
  }
}
