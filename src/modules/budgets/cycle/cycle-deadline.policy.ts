import type { BusinessDate } from '../../../core/business-date';

/** What a cycle owes today (`R-I05`, `QĐ-108e`): which reminders its deadlines and its setup call for on this day. */
export interface DeadlineDuties {
  /** The submission deadline has passed: the heads who have not proposed, the departments nobody heads, and Finance, are told. */
  submissionPassed: boolean;
  /** The decision deadline has passed: the spending approver and Finance are told of the versions still waiting. */
  decisionPassed: boolean;
  /** The cycle was published once and the deadline is not yet past: Finance is told of departments that still have no Cost Center. */
  costCenterSetup: boolean;
}

export function deadlineDuties(cycle: {
  today: BusinessDate;
  submissionDeadline: BusinessDate;
  decisionDeadline: BusinessDate;
  publishedOnce: boolean;
}): DeadlineDuties {
  return {
    // A deadline has passed after its day is over (a day equal to the deadline is still in time).
    submissionPassed: cycle.publishedOnce && cycle.today > cycle.submissionDeadline,
    decisionPassed: cycle.publishedOnce && cycle.today > cycle.decisionDeadline,
    costCenterSetup: cycle.publishedOnce && cycle.today <= cycle.submissionDeadline,
  };
}
