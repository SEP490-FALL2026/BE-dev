import { Module } from '@nestjs/common';
import { CurrenciesController } from './currency/currencies.controller';
import { ExchangeRatesController } from './exchange-rate/exchange-rates.controller';
import { FinanceModule } from './finance.module';

/**
 * The HTTP side of the finance module, mounted by the API only. It is a module of its own, not part of `FinanceModule`,
 * because other graphs import `FinanceModule` for the facade and must not carry controllers with them.
 */
@Module({
  imports: [FinanceModule],
  controllers: [ExchangeRatesController, CurrenciesController],
})
export class FinanceHttpModule {}
