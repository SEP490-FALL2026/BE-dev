import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { OrganizationModule } from '../organization/organization.module';
import { NonWorkingDatesService } from './non-working-dates.service';
import { OperatingParametersRepo } from './operating-parameters.repo';
import { OperatingParametersApi } from './public/operating-parameters.api';

/**
 * The operating parameters and the non-working dates, as a service other modules read. The HTTP side is
 * `OperatingParametersHttpModule`, which only the API mounts.
 */
@Module({
  imports: [DatabaseModule, AuditModule, OrganizationModule],
  providers: [OperatingParametersRepo, OperatingParametersApi, NonWorkingDatesService],
  exports: [OperatingParametersApi, NonWorkingDatesService],
})
export class OperatingParametersModule {}
