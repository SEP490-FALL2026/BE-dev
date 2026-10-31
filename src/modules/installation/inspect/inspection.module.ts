import { Module } from '@nestjs/common';
import { InstallationConfigurationModule } from '../../../infrastructure/config/installation-configuration.module';
import { DatabaseModule } from '../../../infrastructure/database/database.module';
import { ReadOnlyDatabaseSessionModule } from '../../../infrastructure/database/read-only-session.module';
import { AuditModule } from '../../audit/audit.module';
import { IdentityAccessInspectionFacadeModule } from '../../identity-access/identity-access-inspection-facade.module';
import { OrganizationModule } from '../../organization/organization.module';
import { InstallationInspectionApi } from '../public/installation-inspection.api';
import { MigrationStateRepo } from './migration-state.repo';

/**
 * The graph of `pnpm ops:inspect`. Database settings only (no secret, mail, Redis or storage), every session
 * read-only, and only the read contracts it inspects. Never imported by the API, the worker or a command that writes.
 */
@Module({
  imports: [
    InstallationConfigurationModule,
    ReadOnlyDatabaseSessionModule,
    DatabaseModule,
    OrganizationModule,
    AuditModule,
    IdentityAccessInspectionFacadeModule,
  ],
  providers: [MigrationStateRepo, InstallationInspectionApi],
  exports: [InstallationInspectionApi],
})
export class InspectionModule {}
