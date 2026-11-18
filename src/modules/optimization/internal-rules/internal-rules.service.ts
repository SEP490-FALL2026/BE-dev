import { Injectable } from '@nestjs/common';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { RuleRunService, type RunTally } from '../rule-run/rule-run.service';
import type { RuleRunRecord } from '../rule-run/rule-run.repo';
import { periodKeyOf, scheduleOf } from '../rule-run/rule-run.policy';
import { InternalRulesG1Service } from './internal-rules-g1.service';
import { InternalRulesG2Service } from './internal-rules-g2.service';

/** The parameter that says how often `G1` and `G2` run (`FR-4.12b`). */
export const RULE_SCHEDULE_PARAMETER = 'RULE_SCHEDULE_G1_G2';

/**
 * The run of the rules that use only internal data (`G1`, `G2`; `FR-4.12b`, `BR-MF5-01`): claims the period (`RULE_SCHEDULE_G1_G2` says
 * whether it is a day or a week), runs `G1` then `G2` and settles what moved, and writes how the run ended. Asking again for a
 * period that is run, being run or out of attempts does nothing. It changes no seat: a reclaim is the IT Admin's (`SoD-6`).
 */
@Injectable()
export class InternalRulesService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly parameters: OperatingParametersApi,
    private readonly runs: RuleRunService,
    private readonly g1: InternalRulesG1Service,
    private readonly g2: InternalRulesG2Service,
  ) {}

  /** The run of the period `now` falls in, or null when there is nothing to run (no organization yet, or the period is taken). */
  run(now: Date = new Date()): Promise<RuleRunRecord | null> {
    return this.start(now, 'SCHEDULE');
  }

  /**
   * A run asked for by hand (`POST /ghost-seat-rule-runs`): the same rules, now, whatever period the schedule already ran. Null when
   * there is no organization yet or another run of `G1`/`G2` is under way.
   */
  runNow(now: Date = new Date()): Promise<RuleRunRecord | null> {
    return this.start(now, 'BY_HAND');
  }

  private async start(now: Date, mode: 'SCHEDULE' | 'BY_HAND'): Promise<RuleRunRecord | null> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) return null;
    const today = await this.organizationReads.businessToday(now);
    const work = async (tally: RunTally): Promise<void> => {
      const pass = { organizationId: organization.id, today, now, tally };
      await this.g1.pass(pass);
      await this.g2.pass(pass);
    };
    if (mode === 'BY_HAND') return this.runs.executeNow(organization.id, 'G1_G2', now, work);
    const schedule = scheduleOf(await this.parameters.getValue(RULE_SCHEDULE_PARAMETER));

    return this.runs.execute(organization.id, 'G1_G2', periodKeyOf(schedule, today), now, work);
  }
}
