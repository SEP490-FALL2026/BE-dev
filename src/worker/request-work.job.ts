import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../infrastructure/config/env-schema';
import { RequestStatusProjectorApi } from '../modules/requests/public/request-status-projector.api';
import { StepRedeterminationSweepApi } from '../modules/requests/public/step-redetermination-sweep.api';
import { StepSlaSweepApi } from '../modules/requests/public/step-sla-sweep.api';

/**
 * The worker's loop over the open steps of requests: a database poll like the mail loop, not a queue job. Each tick runs the
 * work that belongs to a step nobody has acted on: the reassignment of steps (who holds a step that waits, whose holder left, what a
 * change that took effect today moves), the reminders of the steps that are late and the alert of a backlog (a working day of the
 * organization, once a day for each step), and the projection of the audit events of the requests into the inbox of the people they
 * concern. A tick never overlaps the previous one; each piece of work is tried on its own, so one that fails does not keep the others from running, and a failed piece only logs
 * its kind: the next tick tries again.
 */
@Injectable()
export class RequestWorkLoop implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RequestWorkLoop.name);
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;
  private running: Promise<void> | undefined;

  constructor(
    private readonly redetermination: StepRedeterminationSweepApi,
    private readonly reminders: StepSlaSweepApi,
    private readonly status: RequestStatusProjectorApi,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  onApplicationBootstrap(): void {
    this.stopped = false;
    this.schedule(0);
  }

  /** Stops the timer and waits for the tick in progress, so no request is left half written when the connection closes. */
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
    await this.attempt('Request work tick', () => this.redetermination.sweep());
    await this.attempt('Step reminders', () => this.reminders.sweep());
    await this.attempt('Request status projection', () => this.status.project());
    this.schedule(this.config.get('REQUEST_WORK_INTERVAL_MS', { infer: true }));
  }

  /** Runs one piece of the tick; a failure is logged by its kind, never its message, and does not stop the next piece. */
  private async attempt(name: string, work: () => Promise<unknown>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.error(`${name} failed: ${(error as Error).name}`);
    }
  }
}
