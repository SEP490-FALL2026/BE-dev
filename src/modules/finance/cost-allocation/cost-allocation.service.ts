import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { formatRatePercent } from '../../../core/money/tax-estimate';
import { readSqlState, TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { OrganizationService } from '../../organization/organization.service';
import { CostAllocationCostCenterRefusedError, CostAllocationSubscriptionNotFoundError } from '../finance.errors';
import type { AllocationLineInput, CostAllocationView } from '../finance.types';
import { financeAuditEvent } from '../mappers/finance-audit-event';
import { cleanAllocationLines, sameAllocation, toAllocationView } from './cost-allocation.policy';
import { CostAllocationRepo } from './cost-allocation.repo';
import type { AllocationVersion } from './cost-allocation.types';

const snapshot = (version: AllocationVersion) => ({
  version: version.version,
  lines: version.lines.map((line) => `${line.costCenterId}|${formatRatePercent(line.ratioBp)}%`),
});

/**
 * The cost allocation Finance declares for a subscription that is not billed per seat (`US-04-08`). Every declaration
 * that changes something is a new version recorded with its author, in one transaction with its audit event; the
 * previous versions stay as they were. The subscription is a catalog table: finance holds only its id, the caller has
 * checked that it exists and that its plan is not per seat, and a subscription that does not exist fails the foreign
 * key of the head row. The Cost Centers belong to the organization and are read through its facade.
 */
@Injectable()
export class CostAllocationService {
  constructor(
    private readonly repo: CostAllocationRepo,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
  ) {}

  /** The allocation of the subscription as answered: `DECLARED` with the newest declaration, or `MISSING` with none. */
  async view(
    subscriptionId: string,
  ): Promise<{ status: 'DECLARED' | 'MISSING'; allocation: CostAllocationView | null }> {
    const current = await this.repo.readCurrent(subscriptionId);

    return { status: current ? 'DECLARED' : 'MISSING', allocation: current ? await this.show(current) : null };
  }

  /** The declarations of a subscription, newest first. */
  async history(subscriptionId: string, query: { page: number; pageSize: number }): Promise<Page<CostAllocationView>> {
    const { items, total } = await this.repo.history(subscriptionId, (query.page - 1) * query.pageSize, query.pageSize);

    const centers = new Map(
      (
        await this.organization.costCentersByIds([
          ...new Set(items.flatMap((item) => item.lines.map((line) => line.costCenterId))),
        ])
      ).map((center) => [center.id, center]),
    );

    return pageOf(
      items.map((item) => toAllocationView(item, centers)),
      total,
      query.page,
      query.pageSize,
    );
  }

  /**
   * Declares the allocation of a subscription. Throws the line errors of `cleanAllocationLines`,
   * CostAllocationCostCenterRefusedError and CostAllocationSubscriptionNotFoundError. An allocation equal to the
   * current one records nothing and answers `changed: false`. Given the caller's `tx`, it writes in that transaction, so
   * what the caller checked under its locks (the pricing model of the plan) still holds when the allocation commits.
   */
  async declare(
    actor: AuthenticatedPrincipal,
    subscriptionId: string,
    input: { lines: AllocationLineInput[] },
    tx?: DbTx,
  ): Promise<{ allocation: CostAllocationView; changed: boolean }> {
    const lines = cleanAllocationLines(input.lines);
    const organization = await this.organization.getOrganization(tx);
    if (!organization) throw new Error('A cost allocation was declared before installation');

    const write = async (inner: DbTx) => {
      await this.repo.ensureHead(inner, subscriptionId, organization.id);
      const currentVersion = await this.repo.lockCurrentVersion(inner, subscriptionId);
      const current = currentVersion > 0 ? await this.repo.readVersion(subscriptionId, currentVersion, inner) : null;
      if (current && sameAllocation(current.lines, lines)) {
        return { allocation: await this.show(current, inner), changed: false };
      }
      await this.requireUsableCostCenters(
        inner,
        lines.map((line) => line.costCenterId),
      );

      const created = await this.repo.insertVersion(inner, {
        subscriptionId,
        version: currentVersion + 1,
        lines,
        declaredByAppUserId: actor.appUserId,
      });
      await this.repo.setCurrentVersion(inner, subscriptionId, created.version);
      await this.audit.record(
        inner,
        financeAuditEvent(
          actor,
          organization.id,
          'COST_ALLOCATION.DECLARED',
          'SubscriptionCostAllocation',
          subscriptionId,
          current ? snapshot(current) : null,
          snapshot(created),
        ),
      );

      return { allocation: await this.show(created, inner), changed: true };
    };

    try {
      return await (tx ? write(tx) : this.runner.run(write));
    } catch (error) {
      if (readSqlState(error) === '23503') throw new CostAllocationSubscriptionNotFoundError();
      throw error;
    }
  }

  /** Locks the Cost Centers `FOR SHARE` and refuses one that is absent (first) or inactive: it takes no new allocation. */
  private async requireUsableCostCenters(tx: DbTx, ids: string[]): Promise<void> {
    const found = await this.organization.lockCostCentersShared(tx, ids);
    const known = new Set(found.map((center) => center.id));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length > 0) throw new CostAllocationCostCenterRefusedError('NOT_FOUND', missing);
    const inactive = found.filter((center) => center.status !== 'ACTIVE').map((center) => center.id);
    if (inactive.length > 0) throw new CostAllocationCostCenterRefusedError('INACTIVE', inactive.sort());
  }

  private async show(version: AllocationVersion, tx?: DbTx): Promise<CostAllocationView> {
    const centers = await this.organization.costCentersByIds(
      version.lines.map((line) => line.costCenterId),
      tx,
    );

    return toAllocationView(version, new Map(centers.map((center) => [center.id, center])));
  }
}
