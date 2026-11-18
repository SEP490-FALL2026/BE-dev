import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { OrganizationModule } from '../organization/organization.module';
import { CurrencyRepo } from './currency/currency.repo';
import { CurrencyService } from './currency/currency.service';
import { FinanceApi } from './public/finance.api';
import { TaxProfileRepo } from './tax-profile/tax-profile.repo';
import { TaxProfileService } from './tax-profile/tax-profile.service';

/**
 * The finance context (C7, G3 part): currencies, vendor tax profiles and the money contract. Every amount is in dong (`QĐ-111an`): no
 * exchange rate is read or written (the table `exchange_rates` is kept, not used). Only the facade and the currency list that
 * `FinanceHttpModule` serves are exported; the repos stay behind them. The HTTP side is `FinanceHttpModule`, which only the API mounts.
 */
@Module({
  imports: [DatabaseModule, AuditModule, OrganizationModule],
  providers: [FinanceApi, CurrencyService, CurrencyRepo, TaxProfileRepo, TaxProfileService],
  exports: [FinanceApi, CurrencyService],
})
export class FinanceModule {}
