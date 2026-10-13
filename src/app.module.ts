import { Module } from '@nestjs/common';
import { ConfigurationModule } from './infrastructure/config/configuration.module';
import { HealthModule } from './infrastructure/health/health.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { ObjectStorageModule } from './infrastructure/object-storage/object-storage.module';
import { SecurityModule } from './infrastructure/security/security.module';
import { AuditModule } from './modules/audit/audit.module';
import { IdentityAccessModule } from './modules/identity-access/identity-access.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { ObservabilityModule } from './infrastructure/observability/observability.module';
import { HttpInfrastructureModule } from './infrastructure/http/http-infrastructure.module';

@Module({
  imports: [
    ConfigurationModule,
    ObservabilityModule,
    HttpInfrastructureModule,
    HealthModule,
    DatabaseModule,
    ObjectStorageModule,
    AuditModule,
    OrganizationModule,
    IdentityAccessModule,
    // The catalog module stays in the tree as the reference structure but is not mounted: it has
    // no per-role rules yet, and the first real account would otherwise be able to call it.
    SecurityModule.register({ verifierModule: IdentityAccessModule }),
  ],
})
export class AppModule {}
