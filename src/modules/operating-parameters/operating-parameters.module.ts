import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { OrganizationModule } from '../organization/organization.module';
import { NonWorkingDatesService } from './non-working-dates.service';
import { OperatingParametersRepo } from './operating-parameters.repo';
import { OperatingParametersApi } from './public/operating-parameters.api';
import { ParameterLockContributions } from './public/operating-parameters.extension-points';

/**
 * The operating parameters and the non-working dates, as a service other modules read, and the extension point through which a
 * module above says a parameter is locked (`ParameterLockContributions`). The HTTP side is `OperatingParametersHttpModule`, which only
 * the API mounts.
 */
@Module({
  imports: [DatabaseModule, AuditModule, OrganizationModule],
  providers: [OperatingParametersRepo, OperatingParametersApi, NonWorkingDatesService, ParameterLockContributions],
  exports: [OperatingParametersApi, OperatingParametersRepo, NonWorkingDatesService, ParameterLockContributions],
})
export class OperatingParametersModule {}
