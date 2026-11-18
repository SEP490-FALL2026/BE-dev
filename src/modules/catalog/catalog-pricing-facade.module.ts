import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { CatalogPricingApi } from './public/catalog-pricing.api';
import { SubscriptionPriceService } from './subscription/price/subscription-price.service';
import { SubscriptionRepo } from './subscription/subscription.repo';

/** Price reads shared with the worker: no HTTP controllers, storage, writes or lifecycle listeners. */
@Module({
  imports: [DatabaseModule],
  providers: [SubscriptionRepo, SubscriptionPriceService, CatalogPricingApi],
  exports: [SubscriptionRepo, SubscriptionPriceService, CatalogPricingApi],
})
export class CatalogPricingFacadeModule {}
