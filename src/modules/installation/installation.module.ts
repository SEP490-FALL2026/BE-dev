import { Module } from '@nestjs/common';
import { InstallationConfigurationModule } from '../../infrastructure/config/installation-configuration.module';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { FinanceModule } from '../finance/finance.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { OrganizationModule } from '../organization/organization.module';
import { InstallationRepo } from './installation.repo';
import { InstallationApi } from './public/installation.api';

/** No controllers and no tables of its own: it orchestrates the other modules from the command line. */
@Module({
  imports: [
    InstallationConfigurationModule,
    DatabaseModule,
    OrganizationModule,
    IdentityAccessFacadeModule,
    AuditModule,
    FinanceModule,
  ],
  providers: [InstallationRepo, InstallationApi],
  exports: [InstallationApi],
})
export class InstallationModule {}
