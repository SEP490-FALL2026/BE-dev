import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { ContractRepo } from '../contract/contract.repo';
import { PlanFactsService } from '../plan/plan-facts.service';
import { SeatOccupancyHook } from '../public/catalog.extension-points';
import { WorkspaceRepo } from '../workspace/workspace.repo';
import { freeOf, grantableOf } from './license-lot.policy';
import { LicenseLotStockService } from './license-lot-stock.service';
import type { LicenseLotDetail, LicenseLotRecord } from './license-lot.types';

interface LotFacts {
  plan: { name: string; keyBinding: LicenseLotDetail['plan']['keyBinding'] } | undefined;
  workspace: { id: string; name: string } | undefined;
  contract: { id: string; name: string } | undefined;
  assigned: number;
  keysInStore: number;
  openTasksWithoutKey: number;
}

const originalPriceOf = (record: LicenseLotRecord): LicenseLotDetail['originalUnitPrice'] =>
  record.originalUnitPriceMinor !== null && record.originalCurrency !== null
    ? { amountMinor: record.originalUnitPriceMinor, currency: record.originalCurrency }
    : null;

/** One lot with the plan it is of, what it gave out and what is left, from the facts read for the page. */
function detailOf(record: LicenseLotRecord, facts: LotFacts): LicenseLotDetail {
  const keyBinding = facts.plan?.keyBinding ?? null;
  const { free, freeValueMinor } = freeOf(record.licenseCount, facts.assigned, record.unitPriceMinor);

  return {
    id: record.id,
    plan: { id: record.planId, name: facts.plan?.name ?? '', keyBinding },
    purchasedOn: record.purchasedOn,
    licenseCount: record.licenseCount,
    assigned: facts.assigned,
    free,
    keysInStore: facts.keysInStore,
    grantable: grantableOf({
      keyBinding,
      free,
      keysInStore: Math.max(0, facts.keysInStore - facts.openTasksWithoutKey),
    }),
    unitPriceMinor: record.unitPriceMinor,
    freeValueMinor,
    purpose: record.purpose,
    contract: facts.contract ? { id: facts.contract.id, name: facts.contract.name } : null,
    workspace: facts.workspace ? { id: facts.workspace.id, name: facts.workspace.name } : null,
    responsibleItAdminEmployeeId: record.responsibleItAdminEmployeeId,
    note: record.note,
    requestId: record.requestId,
    invoiceActualMinor: record.invoiceActualMinor,
    originalUnitPrice: originalPriceOf(record),
    updatedAt: record.updatedAt,
  };
}

/**
 * A lot as the routes read it: the plan it is of, what its keys and its machines already take, and what is left. The licenses taken are read with one call of the
 * reader of occupied seats for all the lots (the same figure the database refuses to pass), and the keys with one call too; a page costs a fixed number of reads.
 */
@Injectable()
export class LicenseLotViewService {
  constructor(
    private readonly plans: PlanFactsService,
    private readonly workspaces: WorkspaceRepo,
    private readonly contracts: ContractRepo,
    private readonly occupancy: SeatOccupancyHook,
    private readonly organizationReads: OrganizationReadApi,
    private readonly stock: LicenseLotStockService,
  ) {}

  async viewAll(records: readonly LicenseLotRecord[], tx?: DbTx): Promise<LicenseLotDetail[]> {
    if (records.length === 0) return [];
    const ids = records.map((record) => record.id);
    const reader = this.occupancy.get();
    const today = await this.organizationReads.businessToday(new Date(), tx);
    // One read at a time: the reads share the client of a transaction when there is one.
    const plans = await this.plans.lookups([...new Set(records.map((record) => record.planId))], tx);
    const workspaces = await this.workspaces.findMany(
      [...new Set(records.flatMap((record) => (record.workspaceId ? [record.workspaceId] : [])))],
      tx,
    );
    const taken = await reader.seatsOfSubscriptions(ids, today, tx);
    const keys = await reader.keyCountsOfLots(ids, tx);
    const openTasks = await this.stock.openTasksByLot(records, taken, keys, tx);
    const planById = new Map(plans.map((plan) => [plan.id, plan]));
    const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
    const contractIds = [...new Set(records.flatMap((record) => (record.contractId ? [record.contractId] : [])))];
    const contractById = new Map<string, { id: string; name: string }>();
    for (const id of contractIds) {
      const contract = await this.contracts.find(id, tx);
      if (contract) contractById.set(contract.id, contract);
    }

    return records.map((record) =>
      detailOf(record, {
        plan: planById.get(record.planId),
        workspace: record.workspaceId ? workspaceById.get(record.workspaceId) : undefined,
        contract: record.contractId ? contractById.get(record.contractId) : undefined,
        assigned: taken.get(record.id)?.occupied ?? 0,
        keysInStore: keys.get(record.id)?.inStore ?? 0,
        openTasksWithoutKey: openTasks.get(record.id) ?? 0,
      }),
    );
  }
}
