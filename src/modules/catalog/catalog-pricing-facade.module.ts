import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { CatalogPricingApi } from './public/catalog-pricing.api';
import { PlanReferencePriceRepo } from './subscription/price/plan-reference-price.repo';
import { SubscriptionPriceService } from './subscription/price/subscription-price.service';
import { SubscriptionRepo } from './subscription/subscription.repo';

/** Price reads shared with the worker: no HTTP controllers, storage, writes or lifecycle listeners. */
@Module({
  imports: [DatabaseModule],
  providers: [SubscriptionRepo, PlanReferencePriceRepo, SubscriptionPriceService, CatalogPricingApi],
  exports: [SubscriptionRepo, SubscriptionPriceService, CatalogPricingApi],
})
export class CatalogPricingFacadeModule {}
