import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { OrganizationModule } from '../organization/organization.module';
import { CurrencyRepo } from './currency/currency.repo';
import { CurrencyService } from './currency/currency.service';
import { ExchangeRateLedgerService } from './exchange-rate/exchange-rate-ledger.service';
import { ExchangeRateRepo } from './exchange-rate/exchange-rate.repo';
import { ExchangeRateService } from './exchange-rate/exchange-rate.service';
import { FinanceApi } from './public/finance.api';
import { TaxProfileRepo } from './tax-profile/tax-profile.repo';
import { TaxProfileService } from './tax-profile/tax-profile.service';

/**
 * The finance context (C7, G3 part): currencies, exchange rates, vendor tax profiles and the money contract. Only the facade, the audited
 * rate use case and the currency list that `FinanceHttpModule` serves are exported; the repos and the raw ledger stay behind them (a rate
 * is never written without its audit event). The HTTP side is `FinanceHttpModule`, which only the API mounts.
 */
@Module({
  imports: [DatabaseModule, AuditModule, OrganizationModule],
  providers: [
    FinanceApi,
    CurrencyService,
    CurrencyRepo,
    ExchangeRateLedgerService,
    ExchangeRateRepo,
    ExchangeRateService,
    TaxProfileRepo,
    TaxProfileService,
  ],
  exports: [FinanceApi, ExchangeRateService, CurrencyService],
})
export class FinanceModule {}
