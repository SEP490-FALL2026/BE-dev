import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { TransferRevocationService } from './transfer-revocation.service';
import { TransferTellingService } from './transfer-telling.service';

/** The first sweep waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_SWEEP_AFTER_MS = 5 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

/**
 * Once an hour looks after the transfers whose person moved and keeps the rights of the old department for a grace (`QĐ-110p`, `QĐ-110r`, SPEC
 * MF3-C.1): first tells the start of the grace to the people of a transfer from before the grace existed (m-17), then reminds the person who is
 * about to lose their rights, then takes the rights back when the grace is over. Each transfer has a transaction of its own that locks the employee,
 * then the transfer, and writes once (the reminder by `reminded_at`, the telling by the picture of the rights, the revocation by the gate of
 * licensing), so the hourly pass and every instance that runs it are safe; a work that fails as a whole only logs, the others still run in the same
 * pass, and the next pass tries again. The timer never keeps the process alive.
 */
@Injectable()
export class TransferGraceSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TransferGraceSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(
    private readonly telling: TransferTellingService,
    private readonly revocation: TransferRevocationService,
  ) {}

  onApplicationBootstrap(): void {
    this.stopped = false;
    this.schedule(FIRST_SWEEP_AFTER_MS);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.sweep();
    }, delayMs);
    this.timer.unref();
  }

  private async sweep(): Promise<void> {
    try {
      // The works are independent: one that fails as a whole (a page that cannot be read) never takes the others with it for the hour.
      await this.run('Transfer grace announcement', async () => {
        const pass = await this.telling.announceUnannounced();
        if (pass.told > 0)
          this.logger.log(`Told the start of the grace of ${pass.told} transfer(s) from before the grace`);
      });
      await this.run('Transfer grace reminder', async () => {
        const pass = await this.telling.remind();
        if (pass.told > 0)
          this.logger.log(`Reminded ${pass.told} person(s) that their rights are about to be taken back`);
      });
      await this.run('Transfer rights revocation', async () => {
        const pass = await this.revocation.sweep();
        if (pass.rights > 0)
          this.logger.log(
            `Opened the revocation of ${pass.rights} right(s) of ${pass.transfers} transfer(s) whose grace is over`,
          );
      });
    } finally {
      this.schedule(SWEEP_EVERY_MS);
    }
  }

  /** Runs one of the works of the pass; a failure only logs, so the next work and the next pass still run. */
  private async run(name: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.error(`${name} failed: ${describeForOperator(error)}`, traceForOperator(error));
    }
  }
}
