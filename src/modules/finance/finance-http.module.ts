import { Module } from '@nestjs/common';
import { CurrenciesController } from './currency/currencies.controller';
import { ExchangeRatesController } from './exchange-rate/exchange-rates.controller';
import { FinanceModule } from './finance.module';

/**
 * The HTTP side of the finance module, mounted by the API only. It is a module of its own, not part of `FinanceModule`,
 * because other graphs import `FinanceModule` for the facade and must not carry controllers with them. `CurrenciesController` reads the
 * list of currencies through the service of its own capability (`CurrencyService`, exported by `FinanceModule` for this module), not
 * through the facade of the module.
 */
@Module({
  imports: [FinanceModule],
  controllers: [ExchangeRatesController, CurrenciesController],
})
export class FinanceHttpModule {}
