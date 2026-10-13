import { Module } from '@nestjs/common';
import { ConfigurationModule } from './infrastructure/config/configuration.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { ObjectStorageModule } from './infrastructure/object-storage/object-storage.module';
import { QueueInfrastructureModule } from './infrastructure/queue/queue-infrastructure.module';
import { ObservabilityModule } from './infrastructure/observability/observability.module';
import { EmailDispatchLoop } from './email-dispatch.loop';
import { IdentityAccessModule } from './modules/identity-access/identity-access.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    ConfigurationModule,
    ObservabilityModule,
    DatabaseModule,
    ObjectStorageModule,
    QueueInfrastructureModule,
    NotificationsModule,
    IdentityAccessModule,
  ],
  providers: [EmailDispatchLoop],
})
export class WorkerModule {}
