import { Injectable, Optional } from '@nestjs/common';
import { fiscalYearOf } from '../../../core/fiscal-year';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { BudgetsApi } from '../../budgets/public/budgets.api';
import type { CommitmentReleaseInput, ReleasedCommitment } from '../../budgets/public/budgets.types';
import { LicenseLotApi } from '../../catalog/public/license-lot.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import type { GrantOutcome, GrantOutcomeFacts, ProvisioningKind } from '../../licensing/public/licensing.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { LineAmountRepo } from '../group-request/line-amount.repo';
import { shareToRelease } from '../spend/line-allocation.policy';
import { avoidedCostForPoolGrant, releasesAllOnPoolGrant } from './pool-grant-release.policy';

const firstOfMonth = (day: string): string => `${day.slice(0, 7)}-01`;

/**
 * Budget release, K4 license-lot accounting/reservations (/`F10`/`F11`), and avoided-cost settlement
 * for access request grant outcomes (`B1-R8`).
 */
@Injectable()
export class GrantSettlementService {
  constructor(
    private readonly budgets: BudgetsApi,
    private readonly licensing: LicensingApi,
    private readonly lineAmounts: LineAmountRepo,
    @Optional() private readonly lots?: LicenseLotApi,
    @Optional() private readonly orgs?: OrganizationReadApi,
    @Optional() private readonly requestsRepo?: AccessRequestRepo,
  ) {}

  release(tx: DbTx, input: CommitmentReleaseInput): Promise<ReleasedCommitment[]> {
    return this.budgets.releaseForRequest(tx, input);
  }

  /** Settles pool release / K4 lot charge (`F10`) and avoided cost on grant completion/failure. */
  async settleOutcomeEffects(
    tx: DbTx,
    request: AccessRequestRecord,
    outcome: GrantOutcome,
    employeeId: string | undefined,
    facts: GrantOutcomeFacts | undefined,
    now: Date,
  ): Promise<void> {
    let skipPoolAvoidedCost = false;
    if (this.isK4LotPoolGrant(outcome, facts)) {
      const kind = await this.settleK4PoolLotGrant(tx, request, employeeId, facts, now);
      skipPoolAvoidedCost = kind === 'OWN_REQUEST';
    } else if (request.type !== 'GROUP_GRANT' && releasesAllOnPoolGrant(outcome, facts)) {
      await this.release(tx, { requestId: request.id, reason: 'GRANTED_FROM_POOL', now });
    }
    if (!skipPoolAvoidedCost && outcome === 'COMPLETED' && facts) {
      await this.recordPoolGrantAvoidedCost(tx, request, facts);
    }
  }

  /** Active beneficiary count (`m`) and charged excess count per `REQUEST` lot (`F11`). */
  async reservedForRequestLots(
    lotRequests: readonly { lotId: string; requestId: string }[],
    tx?: DbTx,
  ): Promise<Map<string, { beneficiaries: number; chargedExcess: number }>> {
    const result = new Map<string, { beneficiaries: number; chargedExcess: number }>();
    if (!this.requestsRepo || lotRequests.length === 0) return result;

    const chargedCounts = await this.budgets.chargedExcessCountsOfLots(
      lotRequests.map((item) => item.lotId),
      tx,
    );
    const requests = await this.requestsRepo.findByIds([...new Set(lotRequests.map((item) => item.requestId))], tx);
    const byReqId = new Map(requests.map((req) => [req.id, req]));
    for (const item of lotRequests) {
      const req = byReqId.get(item.requestId);
      result.set(item.lotId, {
        beneficiaries: req ? activeBeneficiaryCountOf(req) : 0,
        chargedExcess: chargedCounts.get(item.lotId) ?? 0,
      });
    }

    return result;
  }

  /** Whether the lot already has at least one `license_lot_charges` row. */
  async hasLotCharges(lotId: string, tx?: DbTx): Promise<boolean> {
    const counts = await this.budgets.chargedExcessCountsOfLots([lotId], tx);

    return (counts.get(lotId) ?? 0) > 0;
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
    await this.licensing.recordAvoidedCost(tx, facts.taskId, amount, facts.grantedOn);
  }

  private isK4LotPoolGrant(
    outcome: GrantOutcome,
    facts: GrantOutcomeFacts | undefined,
  ): facts is GrantOutcomeFacts & { licenseLotId: string; licenseKeyId: string } {
    return (
      outcome === 'COMPLETED' &&
      Boolean(facts?.fromPool && facts.provisioningType === 'K4' && facts.licenseLotId && facts.licenseKeyId) &&
      this.lots !== undefined
    );
  }

  private async settleK4PoolLotGrant(
    tx: DbTx,
    request: AccessRequestRecord,
    employeeId: string | undefined,
    facts: GrantOutcomeFacts & { licenseLotId: string; licenseKeyId: string },
    now: Date,
  ): Promise<'OWN_REQUEST' | 'ALREADY_BORNE' | 'EXCESS_LICENSE'> {
    if (!this.lots) return 'ALREADY_BORNE';
    const lot = await this.lots.findLot(facts.licenseLotId, tx);
    const lotReq = lot?.requestId && this.requestsRepo ? await this.requestsRepo.findById(lot.requestId, tx) : null;
    const effectiveM = lotReq ? activeBeneficiaryCountOf(lotReq) : 0;
    const costCenterId = request.costCenterId ?? (await this.deptCostCenterId(request.departmentId, tx));
    if (!costCenterId) return 'ALREADY_BORNE';

    const recorded = await this.budgets.recordExcessLotLicenseGrant(tx, {
      organizationId: request.organizationId,
      licenseLotId: facts.licenseLotId,
      licenseKeyId: facts.licenseKeyId,
      grantRequestId: request.id,
      costCenterId,
      keyCostBorneBeforeGrant: facts.keyCostBorneBeforeGrant ?? false,
      grantMonth: firstOfMonth(facts.grantedOn),
      effectiveBeneficiaryCount: effectiveM,
      reference: `grant:${facts.taskId ?? request.id}:${employeeId ?? 'single'}`,
      now,
    });
    if (recorded.releaseCommitmentAll) {
      await this.releaseCommitmentOnReclaimedKey(tx, request, employeeId, facts, now);
    }

    return recorded.kind;
  }

  private async releaseCommitmentOnReclaimedKey(
    tx: DbTx,
    request: AccessRequestRecord,
    employeeId: string | undefined,
    facts: GrantOutcomeFacts,
    now: Date,
  ): Promise<void> {
    if (request.type !== 'GROUP_GRANT') {
      await this.release(tx, { requestId: request.id, reason: 'GRANTED_FROM_POOL', now });

      return;
    }
    if (employeeId === undefined) return;
    const amounts = shareToRelease(await this.lineAmounts.of(request.id, employeeId, tx));
    if (amounts.length === 0) return;
    await this.release(tx, {
      requestId: request.id,
      reason: 'GRANTED_FROM_POOL',
      amounts,
      reference: `grant:${facts.taskId ?? request.id}:${employeeId}`,
      now,
    });
    await this.lineAmounts.markReleased(tx, request.id, employeeId, now);
  }

  private async deptCostCenterId(departmentId: string, tx: DbTx): Promise<string | null> {
    if (!this.orgs) return null;
    const map = await this.orgs.getUnitCostCenterIds([departmentId], tx);

    return map.get(departmentId) ?? null;
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

function activeBeneficiaryCountOf(request: AccessRequestRecord): number {
  if (request.type === 'GROUP_GRANT') {
    return (request.lines ?? []).filter((line) => line.state !== 'WITHDRAWN' && line.state !== 'CANCELLED').length;
  }

  return request.state === 'WITHDRAWN' || request.state === 'CANCELLED'
    ? 0
    : Math.max(1, request.beneficiaryEmployeeIds.length);
}
