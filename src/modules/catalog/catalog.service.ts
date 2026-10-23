import { Injectable } from '@nestjs/common';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import type {
  CatalogOnboardingFacts,
  PlanSummary,
  SeatOccupancyReader,
  SeatTarget,
  SeatTargetRef,
} from './catalog.types';
import { SeatOccupancyRegistry } from './subscription/seat-occupancy.registry';
import { OnboardingFactsService } from './subscription/onboarding-facts.service';
import { SeatTargetService } from './subscription/seat-target.service';

/**
 * The catalog facade other modules call (ADR-0013: `licensing → catalog`). It exposes what the assignments of seats
 * need to know about a subscription or an internal plan and nothing of how the catalog keeps it.
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly seatTargets: SeatTargetService,
    private readonly onboarding: OnboardingFactsService,
    private readonly occupancy: SeatOccupancyRegistry,
  ) {}

  /** `licensing` registers how the catalog reads the seats it holds, when its module starts (ADR-0013 item 4). */
  registerSeatOccupancy(reader: SeatOccupancyReader): void {
    this.occupancy.register(reader);
  }

  /** The plans with these ids by name, with their application, as far as they exist. */
  getPlanSummaries(ids: readonly string[]): Promise<PlanSummary[]> {
    return this.onboarding.planSummaries(ids);
  }

  /** How many applications, plans and subscriptions exist, for the onboarding checklist. */
  getOnboardingFacts(): Promise<CatalogOnboardingFacts> {
    return this.onboarding.read();
  }

  /** The seat target without a lock, or null when the subscription or the plan does not exist. */
  findSeatTarget(ref: SeatTargetRef, tx?: DbTx): Promise<SeatTarget | null> {
    return this.seatTargets.find(ref, tx);
  }

  /** The seat targets of many plans in one read, without a lock; a plan that does not exist is absent. */
  findPlanSeatTargets(planIds: readonly string[], tx?: DbTx): Promise<SeatTarget[]> {
    return this.seatTargets.findPlans(planIds, tx);
  }

  /**
   * The seat target, locked until the caller's transaction ends: the subscription `FOR UPDATE`, so writers of its seats
   * queue and a change of its quantity waits; an internal plan `FOR SHARE`. Null when it does not exist.
   */
  lockSeatTarget(tx: DbTx, ref: SeatTargetRef): Promise<SeatTarget | null> {
    return this.seatTargets.lock(tx, ref);
  }
}
