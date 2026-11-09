import { Module } from '@nestjs/common';
import { ConfigurationModule } from '../infrastructure/config/configuration.module';
import { HealthModule } from '../infrastructure/health/health.module';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { RuntimeDatabaseRoleModule } from '../infrastructure/database/runtime-role.module';
import { SecurityModule } from '../infrastructure/security/security.module';
import { AiAssistHttpModule } from '../modules/ai-assist/ai-assist-http.module';
import { AuditHttpModule } from '../modules/audit/audit-http.module';
import { AuditModule } from '../modules/audit/audit.module';
import { CatalogModule } from '../modules/catalog/catalog.module';
import { DashboardsModule } from '../modules/dashboards/dashboards.module';
import { DevicesModule } from '../modules/devices/devices.module';
import { UsageModule } from '../modules/usage/usage.module';
import { FinanceHttpModule } from '../modules/finance/finance-http.module';
import { DataImportModule } from '../modules/data-import/data-import.module';
import { IdentityAccessModule } from '../modules/identity-access/identity-access.module';
import { LicensingModule } from '../modules/licensing/licensing.module';
import { NotificationsHttpModule } from '../modules/notifications/notifications-http.module';
import { OnboardingModule } from '../modules/onboarding/onboarding.module';
import { PersonnelModule } from '../modules/personnel/personnel.module';
import { OptimizationModule } from '../modules/optimization/optimization.module';
import { OperatingParametersHttpModule } from '../modules/operating-parameters/operating-parameters-http.module';
import { OrganizationHttpModule } from '../modules/organization/organization-http.module';
import { OrganizationModule } from '../modules/organization/organization.module';
import { BudgetsModule } from '../modules/budgets/budgets.module';
import { RequestsModule } from '../modules/requests/requests.module';
import { ObservabilityModule } from '../infrastructure/observability/observability.module';
import { HttpInfrastructureModule } from '../infrastructure/http/http-infrastructure.module';

@Module({
  imports: [
    ConfigurationModule,
    ObservabilityModule,
    HttpInfrastructureModule,
    HealthModule,
    DatabaseModule,
    RuntimeDatabaseRoleModule,
    AuditModule,
    AuditHttpModule,
    OrganizationModule,
    OrganizationHttpModule,
    PersonnelModule,
    OperatingParametersHttpModule,
    DataImportModule,
    FinanceHttpModule,
    CatalogModule,
    LicensingModule,
    DevicesModule,
    UsageModule,
    NotificationsHttpModule,
    AiAssistHttpModule,
    RequestsModule,
    BudgetsModule,
    OnboardingModule,
    IdentityAccessModule,
    OptimizationModule,
    DashboardsModule,
    SecurityModule.register({ verifierModule: IdentityAccessModule, deviceVerifierModule: DevicesModule }),
  ],
})
export class AppModule {}
