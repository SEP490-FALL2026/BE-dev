import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { fiscalYearOf } from '../../../core/fiscal-year';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { CommitmentMonthFacadeService } from '../commitment/commitment-month-facade.service';
import { endedMonthsOf } from './seat-month.policy';
import { SeatMonthService } from './seat-month.service';

/** The first pass waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_PASS_AFTER_MS = 5 * 60 * 1000;
const PASS_EVERY_MS = 60 * 60 * 1000;

/**
 * Once an hour charges the months that have ended and have no seat-month yet (`SM-1`): on the first day of a month the month before is charged,
 * and a month an outage skipped is charged by the next pass. Each instance runs it; charging a month again gives the same rows and applies
 * nothing twice (a lock of the subscription and the month queues two instances), and a failed pass only logs. The timer never keeps the process
 * alive. It stays in the API process, like the closure of the year.
 */
@Injectable()
export class SeatMonthSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SeatMonthSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(
    private readonly seatMonths: SeatMonthService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly settlements: CommitmentMonthFacadeService,
  ) {}

  onApplicationBootstrap(): void {
    this.stopped = false;
    this.schedule(FIRST_PASS_AFTER_MS);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.pass();
    }, delayMs);
    this.timer.unref();
  }

  private async pass(): Promise<void> {
    try {
      const now = new Date();
      const today = await this.organizationReads.businessToday(now);
      const done = await this.seatMonths.chargeEndedMonths(today, now);
      if (done.rows > 0)
        this.logger.log(`Charged ${done.rows} seat-month row(s) of ${done.subscriptions} subscription(s)`);
      if (done.failed > 0)
        this.logger.warn(
          `${done.failed} subscription(s) could not be charged for a month; the next pass tries them again`,
        );
      await this.settleEndedMonths(today, now);
    } catch (error) {
      this.logger.error(`Seat-month pass failed: ${describeForOperator(error)}`, traceForOperator(error));
    } finally {
      this.schedule(PASS_EVERY_MS);
    }
  }

  private async settleEndedMonths(today: ReturnType<typeof endedMonthsOf>[number], now: Date): Promise<void> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) return;
    const readyMonths: ReturnType<typeof endedMonthsOf> = [];
    for (const month of endedMonthsOf(today)) {
      if (await this.seatMonths.isMonthSettlingReady(organization.id, month)) readyMonths.push(month);
    }
    const priorDec: ReturnType<typeof endedMonthsOf>[number] = `${fiscalYearOf(today) - 1}-12-01`;
    const priorDecemberReady = readyMonths.includes(priorDec)
      ? true
      : await this.seatMonths.isMonthSettlingReady(organization.id, priorDec);
    const settled = await this.settlements.runPass({
      organizationId: organization.id,
      today,
      now,
      readyMonths,
      priorDecemberReady,
    });
    if (settled.settledCommitments > 0 || settled.sweptCommitments > 0) {
      this.logger.log(
        `Settled ${settled.settledSlices} slice(s) across ${settled.settledCommitments} month-end and ${settled.sweptCommitments} prior-year commitment(s)`,
      );
    }
  }
}
