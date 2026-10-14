import { Module } from '@nestjs/common';
import { InstallationConfigurationModule } from '../../infrastructure/config/installation-configuration.module';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { OrganizationModule } from '../organization/organization.module';
import { InstallationService } from './installation.service';

/** No controllers and no tables of its own: it orchestrates the other modules from the command line. */
@Module({
  imports: [
    InstallationConfigurationModule,
    DatabaseModule,
    OrganizationModule,
    IdentityAccessFacadeModule,
    AuditModule,
  ],
  providers: [InstallationService],
  exports: [InstallationService],
})
export class InstallationModule {}
