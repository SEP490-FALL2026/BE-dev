import { Injectable } from '@nestjs/common';
import type { CatalogOnboardingFacts, PlanSummary } from '../catalog.types';
import { ApplicationLookupService } from '../catalog-entry/application-lookup.service';
import { PlanLookupService } from '../plan/plan-lookup.service';
import { SubscriptionRepo } from './subscription.repo';

/**
 * How much of the catalog exists, for the onboarding checklist (`US-02-04`): the applications, the plans and the
 * subscriptions, counted from the data whoever entered it and however.
 */
@Injectable()
export class OnboardingFactsService {
  constructor(
    private readonly applications: ApplicationLookupService,
    private readonly plans: PlanLookupService,
    private readonly subscriptions: SubscriptionRepo,
  ) {}

  /** The plans with these ids by name, with their application. */
  planSummaries(ids: readonly string[]): Promise<PlanSummary[]> {
    return this.plans.summaries(ids);
  }

  async read(): Promise<CatalogOnboardingFacts> {
    const applications = await this.applications.count();
    const plans = await this.plans.count();
    const subscriptions = await this.subscriptions.count();

    return { applications, plans, subscriptions };
  }
}
