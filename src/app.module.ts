import { Module } from '@nestjs/common';
import { ConfigurationModule } from './infrastructure/config/configuration.module';
import { HealthModule } from './infrastructure/health/health.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { ObjectStorageModule } from './infrastructure/object-storage/object-storage.module';
import { SecurityModule } from './infrastructure/security/security.module';
import { AuditHttpModule } from './modules/audit/audit-http.module';
import { AuditModule } from './modules/audit/audit.module';
import { DataImportModule } from './modules/data-import/data-import.module';
import { IdentityAccessModule } from './modules/identity-access/identity-access.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { OperatingParametersHttpModule } from './modules/operating-parameters/operating-parameters-http.module';
import { OrganizationHttpModule } from './modules/organization/organization-http.module';
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
    AuditHttpModule,
    OrganizationModule,
    OrganizationHttpModule,
    OperatingParametersHttpModule,
    DataImportModule,
    OnboardingModule,
    IdentityAccessModule,
    // The catalog module stays in the tree as the reference structure but is not mounted: it has
    // no per-role rules yet, and the first real account would otherwise be able to call it.
    SecurityModule.register({ verifierModule: IdentityAccessModule }),
  ],
})
export class AppModule {}
