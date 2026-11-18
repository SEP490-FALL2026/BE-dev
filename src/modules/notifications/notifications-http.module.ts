import { Module } from '@nestjs/common';
import { InboxController } from './inbox/inbox.controller';
import { InboxViewService } from './inbox/inbox-view.service';
import { NotificationsModule } from './notifications.module';

/**
 * The routes of the inbox, mounted by the API only. A module of its own, not part of `NotificationsModule`, because the worker
 * and the commands import that module for the facade that gives a notice and must not carry a controller with them. It reads the
 * inbox through the one `InboxService` that `NotificationsModule` holds. `InboxViewService`, which asks the owners of names for the words of a
 * page, is provided here only: the graphs that carry no route need no owner of names to be present.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [InboxController],
  providers: [InboxViewService],
})
export class NotificationsHttpModule {}
