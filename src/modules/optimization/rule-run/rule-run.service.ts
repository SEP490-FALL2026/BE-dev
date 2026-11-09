import { Injectable, Logger } from '@nestjs/common';
import { describeForOperator } from '../../../infrastructure/observability/operator-error';
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

/**
 * One run of a set of rules for one period (`FR-4.12b`): claims it so that two instances in one tick make one run, lets the work
 * report what it did, keeps why subjects were left out, and writes how the run ended. A run whose work throws is `FAILED` (the next
 * tick may take it over while an attempt is left); a subject that fails is the work's to count, so the others still run.
 */
@Injectable()
export class RuleRunService {
  private readonly logger = new Logger(RuleRunService.name);

  constructor(private readonly runs: RuleRunRepo) {}

  /** Null when the period is being run, is done or has used its attempts: nothing is run twice. */
  async execute(
    organizationId: string,
    ruleSet: RuleSetCode,
    periodKey: string,
    now: Date,
    work: (tally: RunTally) => Promise<void>,
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
