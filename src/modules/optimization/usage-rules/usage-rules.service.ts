import { Injectable, Logger } from '@nestjs/common';
import { describeForOperator } from '../../../infrastructure/observability/operator-error';
import { LicensingGhostSeatApi } from '../../licensing/public/licensing-ghost-seat.api';
import type { RuleSeat } from '../../licensing/public/licensing-ghost-seat.types';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { RulePass } from '../internal-rules/internal-rules.types';
import type { RuleRunRecord } from '../rule-run/rule-run.repo';
import { periodKeyOf, scheduleOf } from '../rule-run/rule-run.policy';
import { RuleRunService, type RunTally } from '../rule-run/rule-run.service';
import { UsageRulesClosingService } from './usage-rules-closing.service';
import { UsageRulesContextService } from './usage-rules-context.service';
import { UsageRulesSeatService } from './usage-rules-seat.service';
import type { UsageApplicationContext, UsageRunContext } from './usage-rules.types';
import { UsageStaleNoticeService } from './usage-stale-notice.service';

/** The parameter that says how often `G3` and `G4` run (`FR-4.12b`). */
export const USAGE_RULE_SCHEDULE_PARAMETER = 'RULE_SCHEDULE_G3_G4';

/**
 * The weekly run of the rules that read usage (`G3`, `G4`; `FR-4.12b`, `QĐ-35b`): claims the period, then for each application of the plans bought
 * per seat reads its evidence once and judges each seat in a transaction of its own (`UsageRulesSeatService`). It changes no seat and tells nobody of a
 * new recommendation (the queue of the head does, `qd103-ghost-seat-manager-decision`); a report confirmed between two runs never makes one (`US-10-03` AC-12).
 * A source of a vendor that went stale is told once to the IT Admin (`Q-91`). `K4` and `K5` plans are left out (a `K4` key pool is not supported yet).
 */
@Injectable()
export class UsageRulesService {
  private readonly logger = new Logger(UsageRulesService.name);

  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly parameters: OperatingParametersApi,
    private readonly runs: RuleRunService,
    private readonly licensing: LicensingGhostSeatApi,
    private readonly closing: UsageRulesClosingService,
    private readonly context: UsageRulesContextService,
    private readonly seats: UsageRulesSeatService,
    private readonly stale: UsageStaleNoticeService,
  ) {}

  /** The run of the period `now` falls in, or null when there is nothing to run (no organization yet, or the period is taken). */
  run(now: Date = new Date()): Promise<RuleRunRecord | null> {
    return this.start(now, 'SCHEDULE');
  }

  /**
   * A run asked for by hand (`POST /ghost-seat-rule-runs`): the same rules, now, whatever week the schedule already ran. Null when
   * there is no organization yet or another run of `G3`/`G4` is under way.
   */
  runNow(now: Date = new Date()): Promise<RuleRunRecord | null> {
    return this.start(now, 'BY_HAND');
  }

  private async start(now: Date, mode: 'SCHEDULE' | 'BY_HAND'): Promise<RuleRunRecord | null> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) return null;
    const today = await this.organizationReads.businessToday(now);
    const work = (tally: RunTally): Promise<void> => this.pass({ organizationId: organization.id, today, now, tally });
    if (mode === 'BY_HAND') return this.runs.executeNow(organization.id, 'G3_G4', now, work);
    const schedule = scheduleOf(await this.parameters.getValue(USAGE_RULE_SCHEDULE_PARAMETER));

    return this.runs.execute(organization.id, 'G3_G4', periodKeyOf(schedule, today), now, work);
  }

  private async pass(pass: RulePass): Promise<void> {
    const seats = (await this.licensing.listSeatsForRules({ asOf: pass.today })).filter(
      (seat) => seat.pricingModel === 'PER_SEAT' && seat.provisioningType !== 'K5' && seat.provisioningType !== 'K4',
    );
    const run = await this.context.runContextOf(pass, seats);
    const byApplication = new Map<string, RuleSeat[]>();
    for (const seat of seats) {
      byApplication.set(seat.applicationId, [...(byApplication.get(seat.applicationId) ?? []), seat]);
    }
    for (const applicationId of [...byApplication.keys()].sort()) {
      await this.application(run, applicationId, byApplication.get(applicationId) ?? []);
    }
    await this.closing.close(pass, seats);
  }

  /** One application: a failure of its own is counted and logged, and the next application is judged. */
  private async application(run: UsageRunContext, applicationId: string, seats: readonly RuleSeat[]): Promise<void> {
    try {
      const app = await this.context.applicationOf(run, applicationId, seats);
      if (app.verdict.kind === 'STALE') await this.stale.tell(run, applicationId, app.verdict.staleSources);
      for (const seat of seats) await this.seat(run, app, seat);
    } catch (error) {
      run.tally.failed();
      this.logger.error(`G3/G4 of application ${applicationId} failed: ${describeForOperator(error)}`);
    }
  }

  private async seat(run: UsageRunContext, app: UsageApplicationContext, seat: RuleSeat): Promise<void> {
    try {
      await this.seats.assess(run, app, seat);
    } catch (error) {
      run.tally.failed();
      this.logger.error(`G3/G4 of seat ${seat.assignmentId} failed: ${describeForOperator(error)}`);
    }
  }
}
