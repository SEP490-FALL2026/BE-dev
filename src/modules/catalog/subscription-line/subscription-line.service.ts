import { Injectable } from '@nestjs/common';
import { DONG, parseDecimalAmount } from '../../../core/money/money';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import { PlanApplicationRetiredError, PlanNotFoundError } from '../plan/plan.errors';
import { PlanFactsService } from '../plan/plan-facts.service';
import { SeatBaselinePhaseHook, SeatOccupancyHook } from '../public/catalog.extension-points';
import { WorkspaceNotFoundError } from '../workspace/workspace.errors';
import { WorkspaceForSubscriptionService } from '../workspace/workspace-for-subscription.service';
import { SeatLedgerService } from './ledger/seat-ledger.service';
import {
  SUBSCRIPTION_LINES_MAX,
  SubscriptionLineClosedError,
  SubscriptionLinesLimitError,
  SubscriptionLineLiveTakenError,
  SubscriptionLineNotFoundError,
  SubscriptionLineNotResponsibleError,
  SubscriptionLinePeriodNotFoundError,
  SubscriptionLinePeriodNotTermError,
  SubscriptionLinePeriodStaleError,
  SubscriptionLinePeriodStillDraftError,
  SubscriptionLinePlanNotK2Error,
  SubscriptionLinePriceNotVndError,
  SubscriptionLineQuantityViaPurchaseError,
  SubscriptionLineStaleError,
  SubscriptionLineSubscriptionMovedError,
  SubscriptionLineUpdateEmptyError,
  SubscriptionLineWorkspaceMovedError,
} from './subscription-line.errors';
import { toSubscriptionLineDetail, type SubscriptionLineDetailView } from './subscription-line.mapper';
import { SubscriptionLineRepo } from './subscription-line.repo';

type PeriodLockRecord = NonNullable<Awaited<ReturnType<SubscriptionLineRepo['lockPeriod']>>>;

const MAX_WORKSPACE_MOVE_RETRIES = 3;

export interface AddSubscriptionLineInput {
  planId: string;
  monthlyUnitPrice: { amount: string; currency: string };
  minimumSeats?: number;
  quantity?: number;
  expectedUpdatedAt: Date;
}

export interface UpdateSubscriptionLineInput {
  monthlyUnitPrice?: { amount: string; currency: string };
  minimumSeats?: number | null;
  expectedUpdatedAt: Date;
}

function readVndMinor(money: { amount: string; currency: string }): bigint {
  if (money.currency !== DONG) throw new SubscriptionLinePriceNotVndError(money.currency);

  return parseDecimalAmount(money.amount, 0);
}

async function retryOnLineWorkspaceMove<T>(work: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await work();
    } catch (error) {
      if (error instanceof SubscriptionLineWorkspaceMovedError && attempt < MAX_WORKSPACE_MOVE_RETRIES) {
        attempt += 1;
        continue;
      }
      if (error instanceof SubscriptionLineWorkspaceMovedError) {
        throw new SubscriptionLinePeriodStaleError(error.currentUpdatedAt);
      }
      throw error;
    }
  }
}

async function retryOnSubscriptionMove<T>(work: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await work();
    } catch (error) {
      if (error instanceof SubscriptionLineSubscriptionMovedError && attempt < MAX_WORKSPACE_MOVE_RETRIES) {
        attempt += 1;
        continue;
      }
      if (error instanceof SubscriptionLineSubscriptionMovedError) {
        throw new SubscriptionLineStaleError(error.currentUpdatedAt);
      }
      throw error;
    }
  }
}

/**
 * Manages the lines of a term K2 subscription period: adding a line to a workspace period (N5 lock order),
 * updating a live line's price/minimum seats, and reading the paged seat-change ledger of a line.
 */
@Injectable()
export class SubscriptionLineService {
  constructor(
    private readonly lines: SubscriptionLineRepo,
    private readonly seatLedger: SeatLedgerService,
    private readonly plans: PlanFactsService,
    private readonly workspaces: WorkspaceForSubscriptionService,
    private readonly baselinePhase: SeatBaselinePhaseHook,
    private readonly occupancy: SeatOccupancyHook,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  async addLine(
    actor: AuthenticatedPrincipal,
    subscriptionId: string,
    input: AddSubscriptionLineInput,
  ): Promise<SubscriptionLineDetailView> {
    const monthlyUnitPriceMinor = readVndMinor(input.monthlyUnitPrice);
    const probe = await this.lines.readPeriodWorkspace(subscriptionId);
    if (probe === undefined) throw new SubscriptionLinePeriodNotFoundError();
    let expectedWorkspaceId = probe;

    const { line, plan, seatsToday } = await retryOnLineWorkspaceMove(() =>
      this.runner.run((tx) =>
        this.addLineIn(tx, actor, subscriptionId, input, monthlyUnitPriceMinor, {
          get: () => expectedWorkspaceId,
          set: (next) => {
            expectedWorkspaceId = next;
          },
        }),
      ),
    );

    return toSubscriptionLineDetail(line, { id: plan.id, name: plan.name }, seatsToday, 0);
  }

  private async addLineIn(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    subscriptionId: string,
    input: AddSubscriptionLineInput,
    monthlyUnitPriceMinor: bigint,
    workspaceRef: { get: () => string | null; set: (next: string | null) => void },
  ) {
    const { period, workspaceId } = await this.lockPeriodForAdd(tx, actor, subscriptionId, input, workspaceRef);
    const existingLines = (await this.lines.ofSubscriptions([subscriptionId], tx)).get(subscriptionId) ?? [];
    if (existingLines.length >= SUBSCRIPTION_LINES_MAX) {
      throw new SubscriptionLinesLimitError(SUBSCRIPTION_LINES_MAX);
    }
    const plan = await this.assertAddablePlanAndBaseline(tx, period.organizationId, workspaceId, input);

    const line = await this.lines.insert(tx, {
      organizationId: period.organizationId,
      subscriptionId,
      workspaceId,
      planId: input.planId,
      monthlyUnitPriceMinor,
      minimumSeats: input.minimumSeats ?? null,
    });
    const initialQuantity = input.quantity ?? 0;
    if (period.status === 'ACTIVE' && period.startDate !== null) {
      await this.seatLedger.openLines(tx, {
        lines: [
          {
            lineId: line.id,
            effectiveOn: period.startDate,
            quantity: initialQuantity,
            recordedByEmployeeId: actor.employeeId,
          },
        ],
      });
    }
    await this.audit.record(
      tx,
      catalogAuditEvent(actor, period.organizationId, 'SUBSCRIPTION_LINE.ADDED', 'SUBSCRIPTION_LINE', line.id, null, {
        subscriptionId,
        planId: input.planId,
        monthlyUnitPriceMinor: monthlyUnitPriceMinor.toString(),
        minimumSeats: input.minimumSeats ?? null,
        quantity: initialQuantity,
      }),
    );

    return { line, plan, seatsToday: initialQuantity };
  }

  private async lockPeriodForAdd(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    subscriptionId: string,
    input: AddSubscriptionLineInput,
    workspaceRef: { get: () => string | null; set: (next: string | null) => void },
  ) {
    const planVendorId = await this.plans.vendorIdOf(input.planId, tx);
    if (!planVendorId) throw new PlanNotFoundError();
    const probedWorkspaceId = workspaceRef.get();
    const workspaceId = await this.ensureLineWorkspace(tx, actor, probedWorkspaceId, input.planId, planVendorId);

    const period = await this.lines.lockPeriod(tx, subscriptionId, 'UPDATE');
    if (!period) throw new SubscriptionLinePeriodNotFoundError();
    if (period.workspaceId !== probedWorkspaceId) {
      workspaceRef.set(period.workspaceId);
      throw new SubscriptionLineWorkspaceMovedError(period.updatedAt);
    }
    this.assertAddablePeriod(period, actor, input.expectedUpdatedAt);

    return { period, workspaceId };
  }

  private async ensureLineWorkspace(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    probedWorkspaceId: string | null,
    planId: string,
    planVendorId: string,
  ): Promise<string> {
    if (probedWorkspaceId !== null) {
      await this.workspaces.lockBoth(tx, [probedWorkspaceId], planVendorId);

      return probedWorkspaceId;
    }
    const [unlockedPlan] = await this.plans.lookups([planId], tx);
    if (!unlockedPlan) throw new PlanNotFoundError();
    const organizationId = await this.seatLedger.requireOrganizationId(tx);
    const resolved = await this.workspaces.resolveAndLock(
      tx,
      actor,
      organizationId,
      { vendorId: planVendorId, needsWorkspace: unlockedPlan.provisioningType === 'K2' },
      undefined,
    );
    if (!resolved) throw new WorkspaceNotFoundError();

    return resolved;
  }

  private async assertAddablePlanAndBaseline(
    tx: DbTx,
    organizationId: string,
    workspaceId: string,
    input: AddSubscriptionLineInput,
  ) {
    const plan = await this.plans.lockShared(tx, input.planId);
    if (!plan) throw new PlanNotFoundError();
    if (plan.provisioningType !== 'K2') throw new SubscriptionLinePlanNotK2Error();
    if (plan.applicationStatus === 'RETIRED') throw new PlanApplicationRetiredError();
    if (await this.lines.findLive(workspaceId, input.planId, tx)) throw new SubscriptionLineLiveTakenError();

    const baselineClosed = await this.baselinePhase.get().isClosed(tx, organizationId);
    if (input.quantity !== undefined && baselineClosed) throw new SubscriptionLineQuantityViaPurchaseError();

    return plan;
  }

  private assertAddablePeriod(period: PeriodLockRecord, actor: AuthenticatedPrincipal, expectedUpdatedAt: Date): void {
    if (period.status !== 'ACTIVE') throw new SubscriptionLinePeriodStillDraftError([]);
    if (period.kind !== 'TERM') throw new SubscriptionLinePeriodNotTermError();
    if (period.responsibleItAdminEmployeeId !== actor.employeeId) throw new SubscriptionLineNotResponsibleError();
    if (period.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw new SubscriptionLinePeriodStaleError(period.updatedAt);
    }
  }

  async updateLine(
    actor: AuthenticatedPrincipal,
    lineId: string,
    input: UpdateSubscriptionLineInput,
  ): Promise<SubscriptionLineDetailView> {
    if (input.monthlyUnitPrice === undefined && input.minimumSeats === undefined) {
      throw new SubscriptionLineUpdateEmptyError();
    }
    const monthlyUnitPriceMinor =
      input.monthlyUnitPrice !== undefined ? readVndMinor(input.monthlyUnitPrice) : undefined;

    const updated = await retryOnSubscriptionMove(() =>
      this.runner.run((tx) => this.updateLineIn(tx, actor, lineId, input, monthlyUnitPriceMinor)),
    );

    const today = await this.seatLedger.businessToday();
    const [plan] = await this.plans.lookups([updated.planId]);
    const seatsMap = await this.seatLedger.seatsOnDays([updated.id], today, today);
    const seatsToday = seatsMap.get(updated.id)?.get(today) ?? 0;
    const occupiedMap = await this.occupancy.get().occupiedBySubscriptionPlans([updated.subscriptionId], today);
    const assignedToday = occupiedMap.get(`${updated.subscriptionId}:${updated.planId}`) ?? 0;

    return toSubscriptionLineDetail(updated, { id: updated.planId, name: plan?.name ?? '' }, seatsToday, assignedToday);
  }

  private async updateLineIn(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    lineId: string,
    input: UpdateSubscriptionLineInput,
    monthlyUnitPriceMinor: bigint | undefined,
  ) {
    const probe = await this.lines.find(lineId, tx);
    if (!probe) throw new SubscriptionLineNotFoundError();
    const period = await this.lines.lockPeriod(tx, probe.subscriptionId, 'SHARE');
    if (!period) throw new SubscriptionLinePeriodNotFoundError();
    const current = await this.lines.lock(tx, lineId);
    if (!current) throw new SubscriptionLineNotFoundError();
    if (current.subscriptionId !== probe.subscriptionId) {
      throw new SubscriptionLineSubscriptionMovedError(current.updatedAt);
    }
    if (period.responsibleItAdminEmployeeId !== actor.employeeId) throw new SubscriptionLineNotResponsibleError();
    if (current.closedReason !== null) throw new SubscriptionLineClosedError();
    if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
      throw new SubscriptionLineStaleError(current.updatedAt);
    }

    const saved = await this.lines.update(tx, lineId, {
      ...(monthlyUnitPriceMinor !== undefined ? { monthlyUnitPriceMinor } : {}),
      ...(input.minimumSeats !== undefined ? { minimumSeats: input.minimumSeats } : {}),
    });
    await this.audit.record(
      tx,
      catalogAuditEvent(
        actor,
        current.organizationId,
        'SUBSCRIPTION_LINE.UPDATED',
        'SUBSCRIPTION_LINE',
        lineId,
        { monthlyUnitPriceMinor: current.monthlyUnitPriceMinor.toString(), minimumSeats: current.minimumSeats },
        { monthlyUnitPriceMinor: saved.monthlyUnitPriceMinor.toString(), minimumSeats: saved.minimumSeats },
      ),
    );

    return saved;
  }
}
