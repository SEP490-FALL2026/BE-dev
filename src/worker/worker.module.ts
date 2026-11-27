import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigurationModule } from '../infrastructure/config/configuration.module';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { RuntimeDatabaseRoleModule } from '../infrastructure/database/runtime-role.module';
import { ObservabilityModule } from '../infrastructure/observability/observability.module';
import { QueueInfrastructureModule } from '../infrastructure/queue/queue-infrastructure.module';
import { RELAY_SOURCES, type RelaySource } from '../infrastructure/queue/relay-source.types';
import { EmailDispatchLoop } from './email-dispatch.job';
import { EmailQueueConsumer } from './email-queue.job';
import { OutboxRelayLoop } from './outbox-relay.job';
import { RequestWorkLoop } from './request-work.job';
import { IdentityAccessFacadeModule } from '../modules/identity-access/identity-access-facade.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { EmailDeliveryApi } from '../modules/notifications/public/email-delivery.api';
import { RequestsWorkFacadeModule } from '../modules/requests/requests-work-facade.module';

const workerImports = [
  ConfigurationModule,
  ObservabilityModule,
  DatabaseModule,
  RuntimeDatabaseRoleModule,
  NotificationsModule,
  IdentityAccessFacadeModule,
  RequestsWorkFacadeModule,
];

@Module({})
class BullmqWorkerModule {}

@Module({
  imports: workerImports,
  providers: [EmailDispatchLoop, RequestWorkLoop],
})
export class WorkerModule {
  static forTransport(transport: 'bullmq' | 'poll'): DynamicModule {
    if (transport === 'poll') return { module: WorkerModule };

    return {
      module: BullmqWorkerModule,
      imports: [...workerImports, QueueInfrastructureModule],
      providers: [
        OutboxRelayLoop,
        EmailQueueConsumer,
        RequestWorkLoop,
        {
          provide: RELAY_SOURCES,
          inject: [EmailDeliveryApi],
          useFactory: (email: EmailDeliveryApi): RelaySource[] => [
            { queue: 'email-delivery', dueIds: (limit, now) => email.dueIds(limit, now) },
          ],
        },
      ],
    };
  }
}
