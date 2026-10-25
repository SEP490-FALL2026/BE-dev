import { addDays, type BusinessDate } from '../../../core/business-date';

/**
 * The light handover of the two sources of a return (`US-05-13` AC-6, AC-7, `QĐ-62f`, `QĐ-66p`): only a plan whose removal loses
 * data asks the person who triggered the return to confirm that the handover is done, by a short deadline counted in working days.
 * Pure: the services read the plan, the parameter and the day.
 */

const isWeekend = (date: BusinessDate): boolean => {
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();

  return weekday === 0 || weekday === 6;
};

/**
 * The working day that is `count` working days after `from`, Monday to Friday (no calendar of holidays yet: the calendar of
 * `g5-step-sla-and-alerts` replaces this when it brings one). `count` 0 is `from` itself.
 */
export function addWorkingDays(from: BusinessDate, count: number): BusinessDate {
  let day = from;
  let left = count;
  while (left > 0) {
    day = addDays(day, 1);
    if (!isWeekend(day)) left -= 1;
  }

  return day;
}

export interface Handover {
  required: boolean;
  dueOn: BusinessDate | null;
}

/** What a return asks of the handover: nothing for a plan that loses no data, a confirmation due in N working days otherwise. */
export function handoverFor(input: {
  dataLossOnRemoval: boolean;
  requestedOn: BusinessDate;
  shortDeadlineWorkingDays: number;
}): Handover {
  if (!input.dataLossOnRemoval) return { required: false, dueOn: null };

  return { required: true, dueOn: addWorkingDays(input.requestedOn, input.shortDeadlineWorkingDays) };
}

/**
 * What the completion of the revocation does with the handover: nothing to wait for (`OPEN`), refused until the person confirms
 * (`BLOCKED`, up to and including the deadline), or allowed and flagged as completed without the confirmation (`FLAGGED`, after it).
 */
export type HandoverGate = 'OPEN' | 'BLOCKED' | 'FLAGGED';

export function handoverGate(input: {
  required: boolean;
  confirmed: boolean;
  dueOn: BusinessDate | null;
  today: BusinessDate;
}): HandoverGate {
  if (!input.required || input.confirmed || input.dueOn === null) return 'OPEN';

  return input.today <= input.dueOn ? 'BLOCKED' : 'FLAGGED';
}
