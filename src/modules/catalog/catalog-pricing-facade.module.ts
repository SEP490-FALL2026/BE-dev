import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { CatalogPricingApi } from './public/catalog-pricing.api';
import { SubscriptionPeriodRepo } from './subscription/period/subscription-period.repo';
import { CatalogPlanPriceService } from './subscription/price/catalog-plan-price.service';
import { PlanReferencePriceRepo } from './subscription/price/plan-reference-price.repo';
import { SubscriptionRepo } from './subscription/subscription.repo';
import { SubscriptionLineRepo } from './subscription-line/subscription-line.repo';

/** Price and period facts shared with the worker: no HTTP controllers, storage, writes or lifecycle listeners. */
@Module({
  imports: [DatabaseModule],
  providers: [
    SubscriptionRepo,
    SubscriptionPeriodRepo,
    PlanReferencePriceRepo,
    SubscriptionLineRepo,
    CatalogPlanPriceService,
    CatalogPricingApi,
  ],
  exports: [SubscriptionRepo, SubscriptionPeriodRepo, PlanReferencePriceRepo, CatalogPricingApi],
})
export class CatalogPricingFacadeModule {}
