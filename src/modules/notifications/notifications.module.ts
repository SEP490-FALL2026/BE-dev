import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../infrastructure/config/env-schema';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { EmailDispatcher } from './email-dispatcher.service';
import { MailTransport, SmtpMailTransport } from './mail-transport';
import { NotificationsRepo } from './notifications.repo';
import { NotificationsService } from './notifications.service';
import { PAYLOAD_CIPHER } from './notifications.tokens';
import { PayloadCipher } from './payload-cipher';

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
    NotificationsService,
    EmailDispatcher,
    { provide: MailTransport, useClass: SmtpMailTransport },
    {
      provide: PAYLOAD_CIPHER,
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
  exports: [NotificationsService, EmailDispatcher],
})
export class NotificationsModule {}
