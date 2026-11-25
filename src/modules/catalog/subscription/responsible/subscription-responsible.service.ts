import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { catalogAuditEvent } from '../../catalog-audit-event.mapper';
import { LicenseLotRepo } from '../../license-lot/license-lot.repo';
import { SubscriptionPoolService } from '../pool/subscription-pool.service';
import { SubscriptionNotFoundError } from '../subscription.errors';
import { SubscriptionRepo } from '../subscription.repo';
import type { SubscriptionView } from '../subscription.types';
import { SubscriptionViewService } from '../subscription-view.service';
import { judgeResponsibleChange } from './subscription-responsible.policy';

/**
 * The Super Admin names the IT Admin who answers for a subscription (`QĐ-118f`, `QĐ-118l`): the only way it changes hands, apart from the
 * hand-over of an IT Admin who leaves. There is no stand-in for a subscription (Owner Q7).
 *
 * Lock order: ONE lock, the row of `subscriptions` `FOR UPDATE` (tier 6 of `docs/rules/database-business.md`); the person named is judged on
 * the account as it is in this transaction. One audit event says who changed it, from whom to whom and why.
 */
@Injectable()
export class SubscriptionResponsibleService {
  constructor(
    private readonly subscriptions: SubscriptionRepo,
    private readonly lots: LicenseLotRepo,
    private readonly poolRules: SubscriptionPoolService,
    private readonly views: SubscriptionViewService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws SubscriptionNotFoundError and SubscriptionResponsibleNotItAdminError. */
  async change(
    actor: AuthenticatedPrincipal,
    subscriptionId: string,
    input: { employeeId: string; reason: string },
  ): Promise<{ subscription: SubscriptionView; changed: boolean }> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The subscriptions were used before installation');

    const changed = await this.runner.run(async (tx) => {
      const current = await this.subscriptions.lock(tx, subscriptionId);
      if (!current) throw new SubscriptionNotFoundError();
      // A perpetual purchase that became a lot has the id of the lot (6a, after the period, 6): who answers for it is written in the lot and only there (W3-24).
      const lot = await this.lots.lock(tx, subscriptionId);
      const currentEmployeeId = lot ? lot.responsibleItAdminEmployeeId : current.responsibleItAdminEmployeeId;
      const decision = judgeResponsibleChange({
        currentEmployeeId,
        toEmployeeId: input.employeeId,
        toIsUsableItAdmin: await this.poolRules.isUsableItAdmin(input.employeeId, tx),
      });
      if (decision === 'UNCHANGED') return false;

      if (lot) await this.lots.setResponsible(tx, subscriptionId, input.employeeId);
      else await this.subscriptions.setResponsible(tx, subscriptionId, input.employeeId);
      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          organization.id,
          lot ? 'LICENSE_LOT.RESPONSIBLE_CHANGED' : 'SUBSCRIPTION.RESPONSIBLE_CHANGED',
          lot ? 'LicenseLot' : 'Subscription',
          subscriptionId,
          { responsibleItAdminEmployeeId: currentEmployeeId },
          { responsibleItAdminEmployeeId: input.employeeId, reason: input.reason },
        ),
      );

      return true;
    });
    const record = await this.subscriptions.find(subscriptionId);
    if (!record) throw new SubscriptionNotFoundError();

    return { subscription: (await this.views.viewAll([record]))[0], changed };
  }
}
