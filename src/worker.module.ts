import { Module } from '@nestjs/common';
import { ConfigurationModule } from './infrastructure/config/configuration.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { ObservabilityModule } from './infrastructure/observability/observability.module';
import { EmailDispatchLoop } from './email-dispatch.loop';
import { IdentityAccessFacadeModule } from './modules/identity-access/identity-access-facade.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [ConfigurationModule, ObservabilityModule, DatabaseModule, NotificationsModule, IdentityAccessFacadeModule],
  providers: [EmailDispatchLoop],
})
export class WorkerModule {}
