import { z } from 'zod';
import { responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { dashboardSectionSchema } from '../section/dashboard-section.dto';

const section = (description: string) => dashboardSectionSchema.meta({ description });

/** The calendar of the next working days, from today to the tenth working day after it, both included (SPEC P21). */
export const progressCalendarSchema = z.strictObject({
  from: responseBusinessDate.meta({ description: 'Today: the first day of the calendar of the next working days.' }),
  to: responseBusinessDate.meta({
    description:
      'The tenth working day after today. The rows of `upcoming` are the departures handing over with the last working day from `from` to `to` (`offboardingCaseList`: `state=HANDING_OVER&lastWorkingDayFrom&lastWorkingDayTo`); the transfers whose grace ends in the same days are read from `departmentTransferList` with `graceEndsFrom=from` and `graceEndsBefore` the day after `to`.',
  }),
});

/**
 * The sections of the progress of the departures and the transfers, the same in the overviews of an IT Admin and of the Super Admin (SPEC P21,
 * R5 E1, E2, E6, E9). Spread into the `sections` of an overview.
 */
export const progressSectionsShape = {
  departures: z.strictObject({
    upcoming: section(
      'The departures handing over whose last working day is in the calendar of the next working days (`calendar`): the total of `offboardingCaseList` for `state=HANDING_OVER` and those days, in the scope of the caller.',
    ),
    awaitingRevocation: section(
      'The departures whose access is blocked, not closed and not past the deadline of their revocations: the IT Admin has until `revocation.dueOn` of the case.',
    ),
    revocationOverdue: section(
      'The departures past the deadline of their revocations with a right left without a completed task: the total of `offboardingCaseList` for `revocationOverdue=true`.',
    ),
    closedThisMonth: section('The departures the system closed from the first of this month to today.'),
    itHandoverPending: section(
      'The departures and transfers of an IT Admin who still answers for subscriptions or applications nobody has handed over, across the company: the shared queue of the IT Admins.',
    ),
    mailboxLockPending: section(
      'The departures not closed whose lock of the company account (1a) is recorded and whose lock of the mailbox for good (1b) is not.',
    ),
  }),
  transfers: z.strictObject({
    inGrace: section(
      'The transfers that took effect and are not closed, the grace of the old rights still lasting (its last day included).',
    ),
    graceEndingSoon: section(
      'Of those in the grace, the ones from the day of the reminder on: the grace ends within the reminder days (the parameter TRANSFER_GRACE_REMINDER_WORKING_DAYS).',
    ),
    revoking: section('The transfers whose grace is over and whose old rights are being taken back.'),
  }),
  seatsReturned: z.strictObject({
    thisMonth: section(
      'The seats of the shared pools (`K2`) whose revocation for a departure or a transfer was completed from the first of this month to today. An IT Admin counts the tasks they are in charge of by default.',
    ),
    reusedThisMonth: section(
      'The seats of the shared pools (`K2`) handed out again in the same days. Seats of a pool are not told apart one by one, so this is the stock given out in the time, whatever freed it. An IT Admin counts the tasks they are in charge of by default.',
    ),
  }),
  plansBelowVendorAdminMinimum: section(
    'The plans in use that need admins at the vendor (`K2`, or `K4` with an admin console) with fewer than two of the recorded ones still working as IT Admins, or none recorded: the plans whose subscriptions raise `vendorAdminsBelowMinimum` in `subscriptionList`. Across the company.',
  ),
};
