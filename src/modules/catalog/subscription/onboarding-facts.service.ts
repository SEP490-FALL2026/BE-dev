import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CatalogOnboardingFacts, PlanSummary } from '../public/catalog.types';
import { ApplicationFactsService } from '../catalog-entry/application-facts.service';
import { PlanFactsService } from '../plan/plan-facts.service';
import { SubscriptionRepo } from './subscription.repo';

/**
 * How much of the catalog exists, for the onboarding checklist (`US-02-04`): the applications, the plans and the
 * subscriptions, counted from the data whoever entered it and however.
 */
@Injectable()
export class OnboardingFactsService {
  constructor(
    private readonly applications: ApplicationFactsService,
    private readonly plans: PlanFactsService,
    private readonly subscriptions: SubscriptionRepo,
  ) {}

  /** The plans with these ids by name, with their application. */
  planSummaries(ids: readonly string[], tx?: DbTx): Promise<PlanSummary[]> {
    return this.plans.summaries(ids, tx);
  }

  async read(): Promise<CatalogOnboardingFacts> {
    const applications = await this.applications.count();
    const plans = await this.plans.count();
    const subscriptions = await this.subscriptions.count();

    return { applications, plans, subscriptions };
  }
}
