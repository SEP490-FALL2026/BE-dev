import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { describeForOperator } from '../infrastructure/observability/operator-error';
import {
  BOOT_RUN_DELAY_MS,
  NIGHTLY_MAINTENANCE_TIMING,
  nextMidnightInVietnam,
  type MaintenanceTiming,
} from './nightly-maintenance.job';
import { NightlyMaintenanceRunner } from './nightly-maintenance.runner';

@Injectable()
export class NightlyMaintenanceTimer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NightlyMaintenanceTimer.name);
  private boot?: NodeJS.Timeout;
  private midnight?: NodeJS.Timeout;
  private active?: Promise<void>;

  constructor(
    private readonly runner: NightlyMaintenanceRunner,
    @Optional() @Inject(NIGHTLY_MAINTENANCE_TIMING) private readonly timing?: MaintenanceTiming,
  ) {}

  onApplicationBootstrap(): void {
    this.boot = setTimeout(() => this.run(), this.timing?.bootDelayMs ?? BOOT_RUN_DELAY_MS);
    this.scheduleMidnight();
  }

  async onModuleDestroy(): Promise<void> {
    clearTimeout(this.boot);
    clearTimeout(this.midnight);
    await this.active;
  }

  private scheduleMidnight(): void {
    const now = new Date();
    this.midnight = setTimeout(
      () => {
        this.scheduleMidnight();
        this.run();
      },
      nextMidnightInVietnam(now).getTime() - now.getTime(),
    );
  }

  private run(): void {
    if (this.active) return;
    this.active = this.runner
      .run(new Date())
      .then(() => undefined)
      .catch((error: unknown) => this.logger.error(`Nightly maintenance failed: ${describeForOperator(error)}`))
      .finally(() => {
        this.active = undefined;
      });
  }
}
