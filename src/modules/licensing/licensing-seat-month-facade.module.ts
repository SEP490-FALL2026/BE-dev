import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { CatalogPricingFacadeModule } from '../catalog/catalog-pricing-facade.module';
import { AssignmentChainRepo } from './assignment/assignment-chain.repo';
import { AssignmentSeatMonthRepo } from './assignment/assignment-seat-month.repo';
import { LicensingSeatMonthApi } from './public/licensing-seat-month.api';
import { SubscriptionLineTargetRepo } from './subscription-renewal/lines/subscription-line-target.repo';
import { SubscriptionRenewalRepo } from './subscription-renewal/subscription-renewal.repo';

/** Read-only seat-month and renewal target facade shared with `BudgetsReadFacadeModule` without mounting HTTP or `LicensingModule`. */
@Module({
  imports: [DatabaseModule, CatalogPricingFacadeModule],
  providers: [
    AssignmentChainRepo,
    AssignmentSeatMonthRepo,
    SubscriptionRenewalRepo,
    SubscriptionLineTargetRepo,
    LicensingSeatMonthApi,
  ],
  exports: [
    AssignmentChainRepo,
    AssignmentSeatMonthRepo,
    SubscriptionRenewalRepo,
    SubscriptionLineTargetRepo,
    LicensingSeatMonthApi,
  ],
})
export class LicensingSeatMonthFacadeModule {}
