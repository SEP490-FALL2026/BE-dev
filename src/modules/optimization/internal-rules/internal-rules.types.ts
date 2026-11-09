import type { BusinessDate } from '../../../core/business-date';
import type { RunTally } from '../rule-run/rule-run.service';

/** What a pass of the rules of internal data is given: the day, the instant, the organization and where to count. */
export interface RulePass {
  organizationId: string;
  today: BusinessDate;
  now: Date;
  tally: RunTally;
}
