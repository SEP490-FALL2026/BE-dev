import { addDays, type BusinessDate } from '../../../../core/business-date';

/** Who an alert of the milestone of a renewal is sent to, as which role (`US-11-01`). */
export type AlertAudience = 'IT_ADMIN' | 'FINANCE' | 'BUSINESS_OWNER' | 'SPENDING_APPROVER' | 'SUPER_ADMIN';

export interface DueMilestone {
  /** The number of days before the base date the parameter names. */
  days: number;
  /** The last milestone (the smallest number of days): the Super Admin is told too, and it is left out when all is done. */
  final: boolean;
  alertDate: BusinessDate;
}

/**
 * The milestone due today (`FR-1.4`, `US-11-01` AC-1, AC-2, AC-7): each number of days of the parameter gives an alert date
 * counted back from the base date (the cancellation deadline, or the end date), and a milestone is due from its date until the
 * next one begins, the last until the base date itself. A run that missed the day still sends it while its window lasts; an older
 * milestone is not sent once a later one is due, and nothing is sent after the base date (never counted from the renewal date).
 */
export function dueMilestone(
  baseDate: BusinessDate,
  today: BusinessDate,
  daysBefore: readonly number[],
): DueMilestone | null {
  const ordered = [...new Set(daysBefore)].sort((a, b) => b - a);
  for (let index = 0; index < ordered.length; index += 1) {
    const alertDate = addDays(baseDate, -ordered[index]);
    const final = index === ordered.length - 1;
    const until = final ? addDays(baseDate, 1) : addDays(baseDate, -ordered[index + 1]);
    if (alertDate <= today && today < until) return { days: ordered[index], final, alertDate };
  }

  return null;
}

/**
 * Whether the last milestone is left out (`QĐ-62t`, `US-11-01` AC-8): only when both the decision and the outcome with the vendor
 * are recorded. A decision not yet carried out still gets the alert; the earlier milestones are always sent.
 */
export const finalAlertSkipped = (state: { decided: boolean; outcomeRecorded: boolean }): boolean =>
  state.decided && state.outcomeRecorded;

/**
 * The people told of a milestone (`US-11-01` AC-1, AC-10, AC-11): the IT Admin, Finance, the Business Owner who still works and the
 * person who decides spending; the Super Admin only at the last milestone. Nobody else — a head of department and an employee are
 * never among them. A person who holds two of these roles is told once, as the first of them.
 */
export function alertRecipients(
  people: {
    itAdmin: string | null;
    finance: string | null;
    businessOwner: string | null;
    approver: string | null;
    superAdmin: string | null;
  },
  final: boolean,
): { audience: AlertAudience; employeeId: string }[] {
  const ordered: [AlertAudience, string | null][] = [
    ['IT_ADMIN', people.itAdmin],
    ['FINANCE', people.finance],
    ['BUSINESS_OWNER', people.businessOwner],
    ['SPENDING_APPROVER', people.approver],
    ['SUPER_ADMIN', final ? people.superAdmin : null],
  ];
  const seen = new Set<string>();
  const recipients: { audience: AlertAudience; employeeId: string }[] = [];
  for (const [audience, employeeId] of ordered) {
    if (employeeId === null || seen.has(employeeId)) continue;
    seen.add(employeeId);
    recipients.push({ audience, employeeId });
  }

  return recipients;
}
