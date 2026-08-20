import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigurationModule } from './infrastructure/config/configuration.module';
import { HealthModule } from './infrastructure/health/health.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { ObjectStorageModule } from './infrastructure/object-storage/object-storage.module';
import { SecurityModule } from './infrastructure/security/security.module';
import { AccessRequestsModule } from './modules/access-requests/access-requests.module';
import { ObservabilityModule } from './infrastructure/observability/observability.module';
import { HttpInfrastructureModule } from './infrastructure/http/http-infrastructure.module';

@Module({
  imports: [
    ConfigurationModule,
    ObservabilityModule,
    HttpInfrastructureModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    HealthModule,
    DatabaseModule,
    ObjectStorageModule,
    SecurityModule,
    AccessRequestsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
