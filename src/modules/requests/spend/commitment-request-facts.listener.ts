import { Injectable, OnModuleInit } from '@nestjs/common';
import { CatalogApi } from '../../catalog/public/catalog.api';
import {
  CommitmentRequestFactsHook,
  type CommitmentRequestFacts,
  type CommitmentRequestView,
} from '../../budgets/public/budgets.extension-points';
import { SpendRequestRepo } from './spend-request.repo';
import { SpendWireViewService } from './spend-wire-view.service';

/**
 * Tells the budgets which request each commitment of a page is held for: the software and plan, who sent it, how many people it
 * is for, when the spend was approved, and whose software it is (the vendor an invoice is from). It reads the whole page at once,
 * so the number of reads does not depend on the number of commitments. It binds itself to the budgets' hook when the module
 * starts, so the budgets never import this module (ADR-0016).
 */
@Injectable()
export class RequestCommitmentFacts implements CommitmentRequestFacts, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [CommitmentRequestFactsHook] as const;

  constructor(
    private readonly requests: SpendRequestRepo,
    private readonly catalog: CatalogApi,
    private readonly wireView: SpendWireViewService,
    private readonly hook: CommitmentRequestFactsHook,
  ) {}

  onModuleInit(): void {
    this.hook.bind(this);
  }

  async factsOf(requestIds: readonly string[]): Promise<Map<string, CommitmentRequestView>> {
    const rows = await this.requests.commitmentFactsOf(requestIds);
    const planIds = [...new Set(rows.flatMap((row) => (row.planId === null ? [] : [row.planId])))];
    const [plans, vendors, people] = await Promise.all([
      this.catalog.getPlanSummaries(planIds),
      this.catalog.getPlanVendorIds(planIds),
      this.wireView.people(rows.map((row) => row.requesterEmployeeId)),
    ]);
    const summaries = new Map(plans.map((plan) => [plan.planId, plan]));

    const facts = new Map<string, CommitmentRequestView>();
    for (const row of rows) {
      const plan = row.planId === null ? undefined : summaries.get(row.planId);
      const requester = people.get(row.requesterEmployeeId);
      // The software is the plan's application, or, before the IT Admin links a plan to a proposal (which comes after the spend
      // decision), the software proposed; a request with neither cannot be shown.
      const software = plan?.applicationName ?? row.proposedSoftwareName;
      if (software === null || !requester) continue;
      facts.set(row.id, {
        id: row.id,
        software: { name: software },
        plan: plan ? { name: plan.planName } : null,
        requester: { employeeCode: requester.employeeCode, fullName: requester.fullName },
        beneficiaryCount: row.beneficiaryCount,
        spendApprovedAt: row.spendApprovedAt,
        vendorId: plan ? (vendors.get(plan.planId) ?? null) : row.assessedVendorId,
      });
    }

    return facts;
  }
}
