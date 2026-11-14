import type { PersonnelProgressFacts } from '../../personnel/public/personnel-dashboard.types';
import type { SeatsReturnedFacts } from '../../licensing/public/licensing-dashboard.types';
import { counted, type DashboardSection } from '../section/dashboard-section.policy';

/**
 * The progress of the departures and the transfers, the seats the pools got back and the plans short of admins, as the overviews of an IT Admin
 * and of the Super Admin show them (SPEC P21, R5 E1, E2, E6, E9). Pure: no store, no clock.
 */
export interface DashboardProgress {
  /** The calendar of the next working days the counts of `upcoming` are over: the client reads the rows with the same days (`lastWorkingDayFrom/To`, `graceEndsFrom`/`graceEndsBefore`). */
  calendar: { from: string; to: string };
  departures: {
    upcoming: DashboardSection;
    awaitingRevocation: DashboardSection;
    revocationOverdue: DashboardSection;
    closedThisMonth: DashboardSection;
    itHandoverPending: DashboardSection;
    mailboxLockPending: DashboardSection;
  };
  transfers: {
    inGrace: DashboardSection;
    graceEndingSoon: DashboardSection;
    revoking: DashboardSection;
  };
  seatsReturned: {
    thisMonth: DashboardSection;
    reusedThisMonth: DashboardSection;
  };
  plansBelowVendorAdminMinimum: DashboardSection;
}

/** What the progress is made of: the counts the three modules gave in the scope of the caller. */
export interface ProgressFacts {
  personnel: PersonnelProgressFacts;
  seats: SeatsReturnedFacts;
  /** The plans in use short of admins at the vendor, across the company. */
  plansBelowMinimum: number;
}

const CASE_LIST = 'offboardingCaseList';

/**
 * Every number is `COUNTED`. A section names the list that gives exactly its rows (the same filter, the same scope) or none: `upcoming` is the
 * handing-over cases of `offboardingCaseList` with `state=HANDING_OVER` and the days of the calendar, `revocationOverdue` its `revocationOverdue=true`;
 * the other counts have no list that answers the same number, so they name none rather than another number.
 */
export function progressOf(facts: ProgressFacts): DashboardProgress {
  const { departures, transfers } = facts.personnel;

  return {
    calendar: { ...facts.personnel.calendar },
    departures: {
      upcoming: counted(departures.upcoming, CASE_LIST),
      awaitingRevocation: counted(departures.awaitingRevocation, null),
      revocationOverdue: counted(departures.revocationOverdue, CASE_LIST),
      closedThisMonth: counted(departures.closedThisMonth, null),
      itHandoverPending: counted(departures.itHandoverPending, null),
      mailboxLockPending: counted(departures.mailboxLockPending, null),
    },
    transfers: {
      inGrace: counted(transfers.inGrace, null),
      graceEndingSoon: counted(transfers.graceEndingSoon, null),
      revoking: counted(transfers.revoking, null),
    },
    seatsReturned: {
      thisMonth: counted(facts.seats.returned, null),
      reusedThisMonth: counted(facts.seats.reused, null),
    },
    plansBelowVendorAdminMinimum: counted(facts.plansBelowMinimum, null),
  };
}
