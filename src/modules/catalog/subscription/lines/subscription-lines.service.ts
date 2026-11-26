import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { catalogAuditEvent } from '../../catalog-audit-event.mapper';
import { PlanFactsService, type LockedPlan } from '../../plan/plan-facts.service';
import {
  SUBSCRIPTION_LINES_MAX,
  SubscriptionLinePlanNotK2Error,
  SubscriptionLinesLimitError,
} from '../../subscription-line/subscription-line.errors';
import {
  SubscriptionPeriodLinesService,
  type CreatePeriodLineInput,
} from '../../subscription-line/subscription-period-lines.service';
import { WorkspaceVendorMismatchError } from '../../workspace/workspace.errors';
import { SubscriptionPoolService } from '../pool/subscription-pool.service';
import { snapshotOf } from '../subscription.mapper';
import {
  SubscriptionApplicationRetiredError,
  SubscriptionDuplicatePlanError,
  SubscriptionPerpetualHasNoTermError,
  SubscriptionPlanNotFoundError,
  SubscriptionStillDraftError,
} from '../subscription.errors';
import {
  assertSubscriptionShape,
  declaredStateOf,
  missingDataOf,
  resolveSubscriptionPrices,
} from '../subscription.policy';
import { SubscriptionPricingService } from '../subscription-pricing.service';
import { SubscriptionRepo } from '../subscription.repo';
import type {
  DeclareSubscriptionInput,
  DeclareSubscriptionLineInput,
  OriginalPriceRecord,
  SubscriptionRecord,
} from '../subscription.types';

/**
 * Orchestrates multi-line (`lines[]`) K2 subscription period declaration and bridges `SubscriptionService`
 * to `SubscriptionPeriodLinesService` while keeping individual service classes compact.
 */
@Injectable()
export class SubscriptionMultiLineService {
  constructor(
    private readonly subscriptions: SubscriptionRepo,
    private readonly plans: PlanFactsService,
    private readonly pricing: SubscriptionPricingService,
    private readonly periodLines: SubscriptionPeriodLinesService,
    private readonly poolRules: SubscriptionPoolService,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  requireOrganizationId(): Promise<string> {
    return this.periodLines.requireOrganizationId();
  }

  hasLines(subscriptionId: string, tx?: DbTx): Promise<boolean> {
    return this.periodLines.hasLines(subscriptionId, tx);
  }

  hasPricedLines(subscriptionId: string, tx?: DbTx): Promise<boolean> {
    return this.periodLines.hasPricedLines(subscriptionId, tx);
  }

  createForPeriod(tx: DbTx, input: Parameters<SubscriptionPeriodLinesService['createForPeriod']>[1]) {
    return this.periodLines.createForPeriod(tx, input);
  }

  activatePeriod(
    tx: DbTx,
    period: Parameters<SubscriptionPeriodLinesService['activatePeriod']>[1],
    actorEmployeeId: string,
  ): Promise<void> {
    return this.periodLines.activatePeriod(tx, period, actorEmployeeId);
  }

  async declare(
    actor: AuthenticatedPrincipal,
    input: DeclareSubscriptionInput,
    rawLines: readonly DeclareSubscriptionLineInput[],
  ): Promise<SubscriptionRecord> {
    if (input.kind !== 'TERM') throw new SubscriptionPerpetualHasNoTermError(['lines']);
    if (rawLines.length > SUBSCRIPTION_LINES_MAX) throw new SubscriptionLinesLimitError(SUBSCRIPTION_LINES_MAX);
    const planIds = rawLines.map((line) => line.planId);
    if (new Set(planIds).size !== planIds.length) throw new SubscriptionDuplicatePlanError([]);

    const parsedLines: CreatePeriodLineInput[] = [];
    for (const line of rawLines) {
      const read = await this.pricing.read(line.monthlyUnitPrice, 'monthlyUnitPrice');
      parsedLines.push({
        planId: line.planId,
        monthlyUnitPriceMinor: read.amountMinor,
        minimumSeats: line.minimumSeats ?? null,
        quantity: line.quantity,
      });
    }
    const originalPrice = input.originalPrice ? await this.pricing.readOriginal(input.originalPrice) : null;
    const organizationId = await this.periodLines.requireOrganizationId();
    if (input.responsibleItAdminEmployeeId) await this.poolRules.requireItAdmin(input.responsibleItAdminEmployeeId);

    return this.runner.run((tx) => this.declareIn(tx, actor, input, parsedLines, originalPrice, organizationId));
  }

  private async declareIn(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: DeclareSubscriptionInput,
    lines: readonly CreatePeriodLineInput[],
    originalPrice: OriginalPriceRecord | null,
    organizationId: string,
  ): Promise<SubscriptionRecord> {
    const planIds = lines.map((line) => line.planId);
    const unlocked = await this.plans.lookups(planIds, tx);
    const byId = new Map(
      unlocked.filter((plan): plan is NonNullable<typeof plan> => plan !== null).map((plan) => [plan.id, plan]),
    );
    for (const planId of planIds) {
      const plan = byId.get(planId);
      if (!plan) throw new SubscriptionPlanNotFoundError();
      if (plan.applicationStatus === 'RETIRED') throw new SubscriptionApplicationRetiredError();
      if (plan.provisioningType !== 'K2') throw new SubscriptionLinePlanNotK2Error();
    }
    const vendors = await this.plans.vendorIdsOf(planIds);
    if (new Set([...vendors.values()]).size > 1) throw new WorkspaceVendorMismatchError();

    const firstLookup = byId.get(planIds[0]);
    if (!firstLookup) throw new SubscriptionPlanNotFoundError();
    const workspaceId = await this.poolRules.workspaceFor(tx, actor, organizationId, firstLookup, input.workspaceId);
    const lockedById = await this.lockPlansSorted(tx, planIds, workspaceId);

    return this.insertPeriodAndLines(tx, actor, input, lines, lockedById, workspaceId, originalPrice, organizationId);
  }

  private async lockPlansSorted(
    tx: DbTx,
    planIds: readonly string[],
    workspaceId: string | null,
  ): Promise<Map<string, LockedPlan>> {
    const lockedById = new Map<string, LockedPlan>();
    for (const planId of [...planIds].sort()) {
      const locked = await this.plans.lockExclusive(tx, planId);
      if (!locked) throw new SubscriptionPlanNotFoundError();
      lockedById.set(planId, locked);
    }
    for (const planId of planIds) {
      const locked = lockedById.get(planId)!;
      await this.poolRules.assertNoLiveDuplicate(tx, locked, null, workspaceId);
      if (workspaceId && (await this.periodLines.hasLiveLine(workspaceId, planId, tx))) {
        throw new SubscriptionDuplicatePlanError([]);
      }
    }

    return lockedById;
  }

  private async insertPeriodAndLines(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: DeclareSubscriptionInput,
    lines: readonly CreatePeriodLineInput[],
    lockedById: ReadonlyMap<string, LockedPlan>,
    workspaceId: string | null,
    originalPrice: OriginalPriceRecord | null,
    organizationId: string,
  ): Promise<SubscriptionRecord> {
    const firstPlan = lockedById.get(lines[0].planId)!;
    const { state, priced, singleMonthlyMinor, complete } = await this.buildPeriodInsertState(
      tx,
      input,
      lines,
      firstPlan,
      workspaceId,
    );
    if (complete === 'ACTIVE') await this.poolRules.assertVendorAdmins(tx, firstPlan, organizationId, workspaceId);

    const created = await this.subscriptions.insert(tx, {
      organizationId,
      planId: firstPlan.id,
      kind: 'TERM',
      ...state,
      ...priced,
      monthlyUnitPriceMinor: singleMonthlyMinor,
      originalPrice,
      status: complete,
      workspaceId,
      isPrimaryForPlan: false,
    });
    if (workspaceId && (lines.length > 1 || lines[0].monthlyUnitPriceMinor > 0n)) {
      await this.periodLines.createForPeriod(tx, {
        organizationId,
        subscriptionId: created.id,
        workspaceId,
        startDate: state.startDate,
        status: complete,
        recordedByEmployeeId: actor.employeeId,
        lines,
      });
    }
    await this.audit.record(
      tx,
      catalogAuditEvent(
        actor,
        organizationId,
        'SUBSCRIPTION.CREATED',
        'Subscription',
        created.id,
        null,
        snapshotOf(created),
      ),
    );

    return created;
  }

  private async buildPeriodInsertState(
    tx: DbTx,
    input: DeclareSubscriptionInput,
    lines: readonly CreatePeriodLineInput[],
    firstPlan: LockedPlan,
    workspaceId: string | null,
  ) {
    const totalQuantity = lines.every((line) => line.quantity === null)
      ? undefined
      : lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0);
    const commitmentTermMonths = input.commitmentTermMonths ?? firstPlan.referenceCommitmentMonths ?? undefined;
    const state = {
      ...declaredStateOf({ ...input, purchasedQuantity: totalQuantity, commitmentTermMonths }),
      responsibleItAdminEmployeeId: await this.poolRules.responsibleOfDeclaration(
        tx,
        firstPlan.id,
        input.responsibleItAdminEmployeeId,
      ),
    };
    const singleResolved =
      lines.length > 0
        ? resolveSubscriptionPrices({
            kind: 'TERM',
            billingCycle: input.billingCycle ?? null,
            cycleChanged: false,
            sentMonthly: { amountMinor: lines[0].monthlyUnitPriceMinor, currency: 'VND' },
            sentUnit: undefined,
          })
        : { unitMoney: null, monthlyUnitPriceMinor: null };
    const priced = await this.pricing.priceToday(tx, singleResolved.unitMoney);
    const checkState = {
      ...state,
      workspaceId,
      ...fallbackCheckPrice(priced, lines[0].monthlyUnitPriceMinor),
    };
    assertSubscriptionShape({
      planProvisioningType: firstPlan.provisioningType,
      planKeyBinding: firstPlan.keyBinding,
      applicationKind: firstPlan.applicationKind,
      kind: 'TERM',
      ...checkState,
    });
    const missing = missingDataOf(firstPlan, 'TERM', checkState);
    if (lines.some((line) => line.monthlyUnitPriceMinor <= 0n) && !missing.includes('UNIT_PRICE')) {
      missing.push('UNIT_PRICE');
    }
    const complete: 'DRAFT' | 'ACTIVE' = missing.length === 0 ? 'ACTIVE' : 'DRAFT';
    if (lines.length > 1 && complete === 'DRAFT') throw new SubscriptionStillDraftError(missing);
    this.poolRules.assert(firstPlan, 'TERM', checkState, complete === 'ACTIVE');

    return { state, priced, singleMonthlyMinor: singleResolved.monthlyUnitPriceMinor, complete };
  }
}

function fallbackCheckPrice(
  priced: Awaited<ReturnType<SubscriptionPricingService['priceToday']>>,
  firstLineMonthlyMinor: bigint,
) {
  return {
    unitPrice: priced.unitPrice ?? {
      amountMinor: firstLineMonthlyMinor,
      currency: 'VND',
      recordedOn: '2026-01-01',
    },
    priceSnapshot: priced.priceSnapshot ?? {
      rate: 1n,
      rateDate: '2026-01-01',
      rateSource: 'SAME_CURRENCY' as const,
      reportingMinor: firstLineMonthlyMinor,
      reportingCurrency: 'VND',
      exchangeRateId: null,
    },
  };
}
