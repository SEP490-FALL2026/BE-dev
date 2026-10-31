import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../infrastructure/config/env-schema';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { MailTransport, SmtpMailTransport } from '../../infrastructure/mail/mail-transport';
import { EmailDispatcher } from './email/email-dispatcher.service';
import { HeldNotificationRepo } from './inbox/held-notification.repo';
import { HeldNotificationService } from './inbox/held-notification.service';
import { InAppNotificationRepo } from './inbox/in-app-notification.repo';
import { InboxService } from './inbox/inbox.service';
import { NotificationsRepo } from './notifications.repo';
import { EmailDeliveryApi } from './public/email-delivery.api';
import { NotificationsApi } from './public/notifications.api';
import { PayloadCipher } from './email/payload-cipher.service';

/** `id:base64` pairs separated by commas. */
function parsePreviousKeys(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split(',')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const separator = pair.indexOf(':');
        return [pair.slice(0, separator), pair.slice(separator + 1)] as const;
      }),
  );
}

@Module({
  imports: [DatabaseModule],
  providers: [
    NotificationsRepo,
    InAppNotificationRepo,
    HeldNotificationRepo,
    HeldNotificationService,
    InboxService,
    NotificationsApi,
    EmailDeliveryApi,
    EmailDispatcher,
    { provide: MailTransport, useClass: SmtpMailTransport },
    {
      provide: PayloadCipher,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        new PayloadCipher({
          currentKeyId: config.get('OUTBOX_PAYLOAD_KEY_ID', { infer: true }),
          keys: {
            ...parsePreviousKeys(config.get('OUTBOX_PAYLOAD_PREVIOUS_KEYS', { infer: true })),
            [config.get('OUTBOX_PAYLOAD_KEY_ID', { infer: true })]: config.get('OUTBOX_PAYLOAD_KEY', { infer: true }),
          },
        }),
    },
  ],
  // The facade for the business modules, the delivery contract for the worker loop and the inbox for the routes of
  // `NotificationsHttpModule` (the same context); the dispatcher stays private.
  exports: [NotificationsApi, EmailDeliveryApi, InboxService],
})
export class NotificationsModule {}
