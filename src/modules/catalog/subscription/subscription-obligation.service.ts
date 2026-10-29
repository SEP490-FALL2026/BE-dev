import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { FinanceSetupIncompleteError } from '../../organization/public/organization.errors';
import { OrganizationApi } from '../../organization/public/organization.api';
import { increasesObligation, type ObligationState } from './subscription-obligation.policy';

/**
 * The finance gate of a change of a subscription (F26, spec L.7): a change that creates, raises or extends what is owed needs
 * the department that owns the subscription to have a Cost Center in use to charge it to; any other change does not. Read in
 * the transaction of the change, under the lock of the subscription row that holds the stored state.
 */
@Injectable()
export class SubscriptionObligationService {
  constructor(private readonly organization: OrganizationApi) {}

  /** Throws FinanceSetupIncompleteError (409 `FINANCE.SETUP_INCOMPLETE`) with nothing written. */
  async assertChargeable(
    tx: DbTx,
    ownerDepartmentId: string,
    current: ObligationState,
    next: ObligationState,
  ): Promise<void> {
    if (!increasesObligation(current, next)) return;
    const department = await this.organization.getDepartmentBrief(ownerDepartmentId, tx);
    if (!department?.costCenterActive) throw new FinanceSetupIncompleteError(ownerDepartmentId);
  }
}
