import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { CatalogPricingApi } from './public/catalog-pricing.api';
import { SubscriptionPeriodRepo } from './subscription/period/subscription-period.repo';
import { PlanReferencePriceRepo } from './subscription/price/plan-reference-price.repo';
import { SubscriptionPriceService } from './subscription/price/subscription-price.service';
import { SubscriptionRepo } from './subscription/subscription.repo';

/** Price and period facts shared with the worker: no HTTP controllers, storage, writes or lifecycle listeners. */
@Module({
  imports: [DatabaseModule],
  providers: [
    SubscriptionRepo,
    SubscriptionPeriodRepo,
    PlanReferencePriceRepo,
    SubscriptionPriceService,
    CatalogPricingApi,
  ],
  exports: [SubscriptionRepo, SubscriptionPeriodRepo, SubscriptionPriceService, CatalogPricingApi],
})
export class CatalogPricingFacadeModule {}
