import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DatabaseEnvironmentVariables } from '../../../infrastructure/config/env-schema';
import { trySessionAdvisoryLock } from '../../../infrastructure/database/session-advisory-lock';
import { describeForOperator } from '../../../infrastructure/observability/operator-error';
import { manualPeriodKeyOf, ruleRunLockName } from './rule-run.policy';
import { RuleRunRepo, type NewRuleSkip, type RuleRunRecord, type RuleSetCode, type RunCounts } from './rule-run.repo';

/** What the work of a run reports as it goes: how many subjects it made, changed, closed, skipped and failed. */
export interface RunTally {
  readonly run: RuleRunRecord;
  created(): void;
  updated(): void;
  closed(): void;
  failed(): void;
  skip(skip: NewRuleSkip): void;
}

type RunWork = (tally: RunTally) => Promise<void>;

/**
 * One run of a set of rules for one period (`FR-4.12b`): claims it so that two instances in one tick make one run, lets the work
 * report what it did, keeps why subjects were left out, and writes how the run ended. A run whose work throws is `FAILED` (the next
 * tick may take it over while an attempt is left); a subject that fails is the work's to count, so the others still run.
 * Every run of a set of rules, scheduled or asked for by hand, holds the session advisory lock of the organization and the set
 * while it works, so two never run side by side; the server drops the lock with the connection of a process that dies.
 */
@Injectable()
export class RuleRunService {
  private readonly logger = new Logger(RuleRunService.name);

  constructor(
    private readonly runs: RuleRunRepo,
    private readonly config: ConfigService<DatabaseEnvironmentVariables, true>,
  ) {}

  /** Null when the period is being run, is done or has used its attempts, or another run of the set holds the lock: nothing is run twice. */
  execute(
    organizationId: string,
    ruleSet: RuleSetCode,
    periodKey: string,
    now: Date,
    work: RunWork,
  ): Promise<RuleRunRecord | null> {
    return this.underLock(organizationId, ruleSet, () =>
      this.claimAndRun(organizationId, ruleSet, periodKey, now, work),
    );
  }

  /**
   * A run asked for by hand: it claims a key of its own (`manualPeriodKeyOf`), so a period the schedule already ran does not stop it,
   * and what it makes stays unique through the unique open recommendation. Null when another run of the set is under way.
   */
  executeNow(organizationId: string, ruleSet: RuleSetCode, now: Date, work: RunWork): Promise<RuleRunRecord | null> {
    return this.underLock(organizationId, ruleSet, () =>
      this.claimAndRun(organizationId, ruleSet, manualPeriodKeyOf(now), now, work),
    );
  }

  private async underLock(
    organizationId: string,
    ruleSet: RuleSetCode,
    body: () => Promise<RuleRunRecord | null>,
  ): Promise<RuleRunRecord | null> {
    const lock = await trySessionAdvisoryLock(
      this.config.get('DATABASE_URL', { infer: true }),
      ruleRunLockName(organizationId, ruleSet),
    );
    if (!lock) return null;
    try {
      return await body();
    } finally {
      await lock.release().catch((error: unknown) => {
        this.logger.warn(`Lock of ${ruleSet} released with an error: ${describeForOperator(error)}`);
      });
    }
  }

  private async claimAndRun(
    organizationId: string,
    ruleSet: RuleSetCode,
    periodKey: string,
    now: Date,
    work: RunWork,
  ): Promise<RuleRunRecord | null> {
    const run = await this.runs.claim(organizationId, ruleSet, periodKey, now);
    if (!run) return null;
    const counts: RunCounts = { created: 0, updated: 0, closed: 0, skipped: 0, failed: 0 };
    const skips: NewRuleSkip[] = [];
    const tally: RunTally = {
      run,
      created: () => (counts.created += 1),
      updated: () => (counts.updated += 1),
      closed: () => (counts.closed += 1),
      failed: () => (counts.failed += 1),
      skip: (skip) => {
        skips.push(skip);
        counts.skipped += 1;
      },
    };
    try {
      await work(tally);
      await this.runs.recordSkips(run.id, skips);
      await this.runs.finish(run.id, 'COMPLETED', counts, new Date());
    } catch (error) {
      this.logger.error(`Run ${ruleSet} ${periodKey} failed: ${describeForOperator(error)}`);
      await this.runs.recordSkips(run.id, skips);
      await this.runs.finish(run.id, 'FAILED', counts, new Date(), describeForOperator(error));
    }

    return this.runs.find(run.id, organizationId);
  }
}
