import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../../catalog/public/catalog.api';
import {
  SPENDING_APPROVER_BLOCKER_LIMIT,
  SpendingApproverGrantChecks,
  type SpendingApproverBlocker,
  type SpendingApproverGrantCheck,
} from '../../../identity-access/public/identity-access.extension-points';
import { ServiceAccountDutyService } from './service-account-duty.service';

/**
 * The service accounts that keep a person from becoming the spending approver (`QĐ-93d`(3), `US-01-03` AC-13): one that is still in effect
 * and that they answer for. It adds itself to the checks of the grant when the module starts, so identity-access never imports this
 * module. Two statements, however many service accounts the person answers for: the accounts and the names of their plans.
 */
@Injectable()
export class ServiceAccountSpendingApproverGrantCheck implements SpendingApproverGrantCheck, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [SpendingApproverGrantChecks] as const;

  constructor(
    private readonly duties: ServiceAccountDutyService,
    private readonly catalog: CatalogApi,
    private readonly checks: SpendingApproverGrantChecks,
  ) {}

  onModuleInit(): void {
    this.checks.add('licensing.service-accounts', this);
  }

  async blockersOf(tx: DbTx, employeeId: string): Promise<SpendingApproverBlocker[]> {
    const open = (await this.duties.openOf([employeeId], tx)).slice(0, SPENDING_APPROVER_BLOCKER_LIMIT + 1);
    if (open.length === 0) return [];
    const plans = new Map(
      (await this.catalog.getPlanSummaries([...new Set(open.map((duty) => duty.planId))])).map((plan) => [
        plan.planId,
        `${plan.applicationName} / ${plan.planName}`,
      ]),
    );

    return open.map((duty): SpendingApproverBlocker => ({
      kind: 'SERVICE_ACCOUNT',
      id: duty.assignmentId,
      label: `Service account on ${plans.get(duty.planId) ?? 'a plan'}`,
      partyRole: 'RESPONSIBLE',
    }));
  }
}
