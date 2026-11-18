import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { OrganizationModule } from '../organization/organization.module';
import { OperatingParametersController } from './operating-parameters.controller';
import { OperatingParametersModule } from './operating-parameters.module';
import { ParameterChangeService } from './parameter-change.service';
import { ReportingCurrencyController } from './reporting-currency.controller';
import { ReportingCurrencyService } from './reporting-currency.service';

/**
 * The HTTP side of the operating parameters, mounted by the API only. The reporting currency is read here, not by
 * `OperatingParametersModule`, because only the API serves it.
 */
@Module({
  imports: [OperatingParametersModule, DatabaseModule, AuditModule, OrganizationModule],
  controllers: [OperatingParametersController, ReportingCurrencyController],
  providers: [ParameterChangeService, ReportingCurrencyService],
})
export class OperatingParametersHttpModule {}
