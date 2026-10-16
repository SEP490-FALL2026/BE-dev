import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { OrganizationModule } from '../organization/organization.module';
import { NonWorkingDatesService } from './non-working-dates.service';
import { OperatingParametersRepo } from './operating-parameters.repo';
import { OperatingParametersService } from './operating-parameters.service';

/**
 * The operating parameters and the non-working dates, as a service other modules read. The HTTP side is
 * `OperatingParametersHttpModule`, which only the API mounts.
 */
@Module({
  imports: [DatabaseModule, AuditModule, OrganizationModule],
  providers: [OperatingParametersRepo, OperatingParametersService, NonWorkingDatesService],
  exports: [OperatingParametersService, NonWorkingDatesService],
})
export class OperatingParametersModule {}
