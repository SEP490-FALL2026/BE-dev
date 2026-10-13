import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from './infrastructure/config/env-schema';
import { AccountManagementService } from './modules/identity-access/account-management.service';
import { EmailDispatcher } from './modules/notifications/email-dispatcher.service';

/**
 * The worker's mail loop (ADR-0012): a database poll, not a queue job. It lives at the
 * composition root because it joins two modules that must not import each other: notifications
 * delivers the mail, identity-access knows whether the link inside is still worth sending.
 * A tick never overlaps the previous one, and a failed tick only logs.
 */
@Injectable()
export class EmailDispatchLoop implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(EmailDispatchLoop.name);
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;
  private running: Promise<void> | undefined;

  constructor(
    private readonly dispatcher: EmailDispatcher,
    private readonly accounts: AccountManagementService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  onApplicationBootstrap(): void {
    this.stopped = false;
    this.schedule(0);
  }

  /**
   * Nest runs every onModuleDestroy (including the database disconnect) before any
   * onApplicationShutdown, so the loop must stop here and wait for the tick in progress: a send
   * whose result cannot be written back would be sent again after the restart.
   */
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    try {
      await this.dispatcher.dispatchDue((hash) => this.accounts.isInvitationLinkUsable(hash));
    } catch (error) {
      this.logger.error(`Mail dispatch tick failed: ${(error as Error).name}`);
    } finally {
      this.schedule(this.config.get('OUTBOX_POLL_INTERVAL_MS', { infer: true }));
    }
  }
}
