import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { FinanceModule } from '../finance/finance.module';
import { OrganizationModule } from '../organization/organization.module';
import { OperatingParametersController } from './operating-parameters.controller';
import { OperatingParametersModule } from './operating-parameters.module';
import { ParameterChangeService } from './parameter-change.service';
import { ReportingCurrencyController } from './reporting-currency.controller';
import { ReportingCurrencyService } from './reporting-currency.service';

/**
 * The HTTP side of the operating parameters, mounted by the API only. The reporting currency is served here, not by
 * `OperatingParametersModule`, because it reads `finance` for the currencies it knows and no other graph needs that.
 */
@Module({
  imports: [OperatingParametersModule, DatabaseModule, AuditModule, OrganizationModule, FinanceModule],
  controllers: [OperatingParametersController, ReportingCurrencyController],
  providers: [ParameterChangeService, ReportingCurrencyService],
})
export class OperatingParametersHttpModule {}
