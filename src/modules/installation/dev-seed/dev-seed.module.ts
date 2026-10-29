import { Module } from '@nestjs/common';
import { InstallationConfigurationModule } from '../../../infrastructure/config/installation-configuration.module';
import { DatabaseModule } from '../../../infrastructure/database/database.module';
import { AuditModule } from '../../audit/audit.module';
import { IdentityAccessFacadeModule } from '../../identity-access/identity-access-facade.module';
import { IdentityAccessLocalSeedFacadeModule } from '../../identity-access/identity-access-local-seed-facade.module';
import { OrganizationModule } from '../../organization/organization.module';
import { DevSeedRepo } from './dev-seed.repo';
import { DevSeedApi, LOCAL_PASSWORD_GENERATOR } from '../public/dev-seed.api';
import { generateLocalPassword } from './local-password.service';

/**
 * The graph of `pnpm dev:seed` (H6.2). Database settings only, the owning services it writes through and nothing of
 * the API. Never imported by the API, the worker or another command (module-graph.spec.ts).
 */
@Module({
  imports: [
    InstallationConfigurationModule,
    DatabaseModule,
    OrganizationModule,
    AuditModule,
    IdentityAccessFacadeModule,
    IdentityAccessLocalSeedFacadeModule,
  ],
  providers: [DevSeedRepo, DevSeedApi, { provide: LOCAL_PASSWORD_GENERATOR, useValue: generateLocalPassword }],
  exports: [DevSeedApi],
})
export class DevSeedModule {}
