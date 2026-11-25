import { Injectable } from '@nestjs/common';
import { fiscalYearOf } from '../../../core/fiscal-year';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { BudgetsApi } from '../../budgets/public/budgets.api';
import type { CommitmentReleaseInput, ReleasedCommitment } from '../../budgets/public/budgets.types';
import { LicensingApi } from '../../licensing/public/licensing.api';
import type { GrantOutcomeFacts, ProvisioningKind } from '../../licensing/public/licensing.types';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { LineAmountRepo } from '../group-request/line-amount.repo';
import { avoidedCostForPoolGrant } from './pool-grant-release.policy';

/**
 * Budget release and avoided-cost settlement for access request grant outcomes (`W3-09`, `B1-R8`).
 */
@Injectable()
export class GrantSettlementService {
  constructor(
    private readonly budgets: BudgetsApi,
    private readonly licensing: LicensingApi,
    private readonly lineAmounts: LineAmountRepo,
  ) {}

  release(tx: DbTx, input: CommitmentReleaseInput): Promise<ReleasedCommitment[]> {
    return this.budgets.releaseForRequest(tx, input);
  }

  async recordPoolGrantAvoidedCost(tx: DbTx, request: AccessRequestRecord, facts: GrantOutcomeFacts): Promise<void> {
    if (!facts.fromPool || facts.taskId === undefined) return;
    const grantYear = fiscalYearOf(facts.grantedOn);
    const yearCommitment =
      facts.provisioningType === 'K2'
        ? ((await this.budgets.committedByRequests([request.id], tx)).find((item) => item.year === grantYear) ?? null)
        : null;
    const commitmentSeatCount = await this.commitmentSeatCountOf(tx, request, facts.provisioningType);
    const amount = avoidedCostForPoolGrant({
      provisioningType: facts.provisioningType,
      yearCommitment,
      commitmentSeatCount,
      requestAmount: request.pricing.amount,
      beneficiaryCount: Math.max(1, request.beneficiaryEmployeeIds.length),
    });
    if (!amount) return;
    await this.licensing.recordAvoidedCost(tx, facts.taskId, amount);
  }

  private async commitmentSeatCountOf(
    tx: DbTx,
    request: AccessRequestRecord,
    provisioningType: ProvisioningKind,
  ): Promise<number> {
    if (provisioningType !== 'K2') return 1;
    if (request.type !== 'GROUP_GRANT') return Math.max(1, request.beneficiaryEmployeeIds.length);
    const shares = await this.lineAmounts.of(request.id, null, tx);
    const heldSeats = new Set(shares.filter((share) => share.held).map((share) => share.employeeId)).size;

    return heldSeats > 0 ? heldSeats : Math.max(1, request.beneficiaryEmployeeIds.length);
  }
}
