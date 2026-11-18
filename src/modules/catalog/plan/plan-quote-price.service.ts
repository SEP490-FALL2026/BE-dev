import { Injectable } from '@nestjs/common';
import { DONG } from '../../../core/money/money';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import { planAuditSnapshot } from './plan.mapper';
import { canAdoptQuotePrice } from './plan.policy';
import { PlanRepo } from './plan.repo';
import type { ReferencePrice } from './plan.types';

/**
 * A plan linked to a case B request takes the monthly price of the approved quote as its reference price when it has none (`QĐ-113a`): only a K1 or
 * K2 plan, only when it has no price (a price the IT Admin entered is never overwritten) and only in dong. It runs in the transaction of the link and
 * is audited as a change of the plan by the IT Admin who links.
 */
@Injectable()
export class PlanQuotePriceService {
  constructor(
    private readonly plans: PlanRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
  ) {}

  /** Returns whether the price was set. */
  async adopt(actor: AuthenticatedPrincipal, planId: string, price: ReferencePrice, tx: DbTx): Promise<boolean> {
    if (price.currency !== DONG || price.amountMinor <= 0n) return false;
    const current = await this.plans.lock(tx, planId);
    if (!current || !canAdoptQuotePrice(current.provisioningType, current.referencePrice)) return false;
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The plans were used before installation');

    const updated = await this.plans.update(tx, planId, { referencePrice: price });
    await this.audit.record(
      tx,
      catalogAuditEvent(
        actor,
        organization.id,
        'PLAN.UPDATED',
        'Plan',
        planId,
        planAuditSnapshot(current),
        planAuditSnapshot(updated),
      ),
    );

    return true;
  }
}
