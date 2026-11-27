import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../infrastructure/config/env-schema';
import { trySessionAdvisoryLock } from '../infrastructure/database/session-advisory-lock';
import { describeForOperator } from '../infrastructure/observability/operator-error';
import {
  AuthHousekeepingApi,
  DEAD_SESSION_RETENTION_DAYS,
  SPENT_ACTION_TOKEN_RETENTION_DAYS,
} from '../modules/identity-access/public/auth-housekeeping.api';
import { EmailDeliveryApi, EMAIL_OUTBOX_RETENTION_DAYS } from '../modules/notifications/public/email-delivery.api';

export const MAINTENANCE_BATCH = 500;
export const MAINTENANCE_MAX_BATCHES = 50;

interface MaintenanceTask {
  name: string;
  deleted: number;
  moreRemain: boolean;
  failed: boolean;
}

export interface MaintenanceReport {
  tasks: MaintenanceTask[];
}

type PurgeBatch = (limit: number) => Promise<number>;

function retentionCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

@Injectable()
export class NightlyMaintenanceRunner {
  private readonly logger = new Logger(NightlyMaintenanceRunner.name);

  constructor(
    private readonly email: EmailDeliveryApi,
    private readonly auth: AuthHousekeepingApi,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async run(now: Date): Promise<MaintenanceReport | 'BUSY'> {
    const lock = await trySessionAdvisoryLock(this.config.get('DATABASE_URL', { infer: true }), 'nightly-maintenance');
    if (!lock) return 'BUSY';

    const startedAt = performance.now();
    const deadBefore = retentionCutoff(now, DEAD_SESSION_RETENTION_DAYS);
    try {
      const tasks = [
        await this.purge('finished-email', (limit) =>
          this.email.purgeFinished(retentionCutoff(now, EMAIL_OUTBOX_RETENTION_DAYS), limit),
        ),
        await this.purge(
          'dead-sessions',
          (limit) => this.auth.purgeDeadSessionTokens(deadBefore, limit),
          (limit) => this.auth.purgeDeadSessions(deadBefore, limit),
        ),
        await this.purge('spent-action-tokens', (limit) =>
          this.auth.purgeSpentActionTokens(retentionCutoff(now, SPENT_ACTION_TOKEN_RETENTION_DAYS), limit),
        ),
        await this.purge('idle-login-throttles', (limit) => this.auth.purgeIdleLoginThrottles(now, limit)),
      ];
      return { tasks };
    } finally {
      await lock.release();
      this.logger.log(`Nightly maintenance finished in ${Math.round(performance.now() - startedAt)} ms`);
    }
  }

  private async purge(name: string, ...steps: PurgeBatch[]): Promise<MaintenanceTask> {
    let budget = MAINTENANCE_MAX_BATCHES;
    let deleted = 0;
    let failed = false;
    // Work remains only if the budget ran out on a full batch, or before a later step could run at all.
    let moreRemain = false;
    try {
      for (const step of steps) {
        if (budget === 0) {
          moreRemain = true;
          break;
        }
        while (budget > 0) {
          budget -= 1;
          const count = await step(MAINTENANCE_BATCH);
          deleted += count;
          if (count < MAINTENANCE_BATCH) break;
          if (budget === 0) moreRemain = true;
        }
      }
    } catch (error) {
      failed = true;
      this.logger.warn(`Nightly maintenance ${name} failed: ${describeForOperator(error)}`);
    }
    this.logger.log(`Nightly maintenance ${name}: deleted ${deleted}${moreRemain ? ', more remain' : ''}`);
    return { name, deleted, moreRemain, failed };
  }
}
