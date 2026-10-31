import { Module } from '@nestjs/common';
import { InstallationConfigurationModule } from '../../../infrastructure/config/installation-configuration.module';
import { DatabaseModule } from '../../../infrastructure/database/database.module';
import { RuntimeDatabaseRoleModule } from '../../../infrastructure/database/runtime-role.module';
import { AuditModule } from '../../audit/audit.module';
import { IdentityAccessFacadeModule } from '../../identity-access/identity-access-facade.module';
import { IdentityAccessLocalSeedFacadeModule } from '../../identity-access/identity-access-local-seed-facade.module';
import { OrganizationModule } from '../../organization/organization.module';
import { DemoAccountsApi } from '../public/demo-accounts.api';

/**
 * The in-process graph of `pnpm ops:demo-dataset`: database settings only and the owning services the demo accounts are
 * written through (the rest of the dataset goes through the HTTP API). In production it checks, before any work, that it
 * connects as the runtime role (RuntimeDatabaseRoleModule, as the API does): the command writes what the API would and
 * never as an owner of the database. Never imported by the API, the worker or another command (module-graph gate,
 * operational-commands rule 3).
 */
@Module({
  imports: [
    InstallationConfigurationModule,
    DatabaseModule,
    RuntimeDatabaseRoleModule,
    OrganizationModule,
    AuditModule,
    IdentityAccessFacadeModule,
    IdentityAccessLocalSeedFacadeModule,
  ],
  providers: [DemoAccountsApi],
  exports: [DemoAccountsApi],
})
export class DemoDatasetCliModule {}
