import { Module } from '@nestjs/common';
import { ConfigurationModule } from './infrastructure/config/configuration.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RuntimeDatabaseRoleModule } from './infrastructure/database/runtime-role.module';
import { ObservabilityModule } from './infrastructure/observability/observability.module';
import { EmailDispatchLoop } from './email-dispatch.loop';
import { RequestWorkLoop } from './request-work.loop';
import { IdentityAccessFacadeModule } from './modules/identity-access/identity-access-facade.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RequestsWorkFacadeModule } from './modules/requests/requests-work-facade.module';

@Module({
  imports: [
    ConfigurationModule,
    ObservabilityModule,
    DatabaseModule,
    RuntimeDatabaseRoleModule,
    NotificationsModule,
    IdentityAccessFacadeModule,
    RequestsWorkFacadeModule,
  ],
  providers: [EmailDispatchLoop, RequestWorkLoop],
})
export class WorkerModule {}
