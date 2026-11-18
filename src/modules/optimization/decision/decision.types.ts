import type { BusinessDate } from '../../../core/business-date';
import type { NonWorkingDates } from '../../../core/working-days';

/** What one pass of the follow-up knows of the day: the organization, the instant, the day, and the two numbers of the calendar. */
export interface FollowUpDay {
  organizationId: string;
  now: Date;
  today: BusinessDate;
  /** `GHOST_SEAT_DECISION_WORKING_DAYS`: how many working days a head has from the day a recommendation enters the queue. */
  workingDays: number;
  nonWorking: NonWorkingDates;
}

/** The result of a pass, for the log of the job and for tests: how many recommendations each step touched. */
export interface FollowUpTally {
  paused: number;
  resumed: number;
  routed: number;
  headWatched: number;
  overdueNoticed: number;
  exemptionsReminded: number;
}
