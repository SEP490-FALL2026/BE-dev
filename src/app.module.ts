import { Module } from '@nestjs/common';
import { ConfigurationModule } from './infrastructure/config/configuration.module';
import { HealthModule } from './infrastructure/health/health.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { ObjectStorageModule } from './infrastructure/object-storage/object-storage.module';
import { SecurityModule } from './infrastructure/security/security.module';
import { AccessRequestsModule } from './modules/access-requests/access-requests.module';
import { CatalogModule } from './modules/catalog/catalog.module';
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
    SecurityModule,
    AccessRequestsModule,
    CatalogModule,
  ],
})
export class AppModule {}
