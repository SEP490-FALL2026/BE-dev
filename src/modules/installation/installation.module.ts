import { Module } from '@nestjs/common';
import { ConfigurationModule } from '../../infrastructure/config/configuration.module';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { OrganizationModule } from '../organization/organization.module';
import { InstallationService } from './installation.service';

/** No controllers and no tables of its own: it orchestrates the other modules from the command line. */
@Module({
  imports: [ConfigurationModule, DatabaseModule, OrganizationModule, IdentityAccessModule, AuditModule],
  providers: [InstallationService],
  exports: [InstallationService],
})
export class InstallationModule {}
