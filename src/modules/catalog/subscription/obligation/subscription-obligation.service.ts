import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { FinanceSetupIncompleteError } from '../../../organization/public/organization.errors';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { isPooledPlan } from '../pool/subscription-pool.policy';
import { increasesObligation, type ObligationState } from './subscription-obligation.policy';
import type { ProvisioningType } from '../subscription.types';

/**
 * The finance gate of a change of a subscription: a change that creates, raises or extends what is owed needs
 * the department that owns the subscription to have a Cost Center in use to charge it to; any other change does not. Read in
 * the transaction of the change, under the lock of the subscription row that holds the stored state.
 */
@Injectable()
export class SubscriptionObligationService {
  constructor(private readonly organizationReads: OrganizationReadApi) {}

  /**
   * Throws FinanceSetupIncompleteError (409 `FINANCE.SETUP_INCOMPLETE`) with nothing written. Only a subscription of a K1 or K5 plan that a
   * department owns is charged to that department: the seats of a K2 or K4 pool are charged by the request of the person who takes one,
   * to the Cost Center of that person's department (`QĐ-103d`(2)), so no owner department is asked, whether the subscription has one or not.
   */
  async assertChargeable(
    tx: DbTx,
    subject: { ownerDepartmentId: string | null; provisioningType: ProvisioningType },
    current: ObligationState,
    next: ObligationState,
  ): Promise<void> {
    if (!increasesObligation(current, next)) return;
    if (isPooledPlan(subject.provisioningType) || subject.ownerDepartmentId === null) return;
    const department = await this.organizationReads.getDepartmentBrief(subject.ownerDepartmentId, tx);
    if (!department?.costCenterActive) throw new FinanceSetupIncompleteError(subject.ownerDepartmentId);
  }
}
