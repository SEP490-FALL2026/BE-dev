import { Injectable } from '@nestjs/common';
import { addDays, monthBoundsOf, type BusinessDate } from '../../../core/business-date';
import { instantAtWallClock } from '../../../core/working-days';
import { CatalogResponsibilityApi } from '../../catalog/public/catalog-responsibility.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { RevocationOverdueService } from '../departure-deadline/revocation-overdue.service';
import { revocationDueOn } from '../departure-deadline/departure-deadline.policy';
import type {
  GraceWindowFacts,
  LateDepartureFacts,
  PersonnelProgressFacts,
  PersonnelProgressScope,
  RevocationWindowFacts,
  RevocationWindowQuery,
} from '../public/personnel-dashboard.types';
import { PersonnelDashboardFactsRepo } from './dashboard-facts.repo';
import { calendarLookAheadEnd, calendarWindowOf } from './departure-calendar.policy';

/**
 * The progress of the departures and the transfers that the overviews of an IT Admin and of the Super Admin show (SPEC P21, R5 E1, E2, E9): counts
 * only, in the scope the caller gives (the departments of an IT Admin, or the whole company). The cases past their deadline are the very ones the list
 * of departures gives for `revocationOverdue=true` (the seats of a person are `licensing`'s, so the reading is shared with the notice of the
 * deadline). The hand-overs of an IT Admin who left are asked of the whole company, as the queue they go to is shared by the IT Admins (`R-26`).
 * Reads only.
 */
@Injectable()
export class PersonnelDashboardFactsService {
  constructor(
    private readonly repo: PersonnelDashboardFactsRepo,
    private readonly overdue: RevocationOverdueService,
    private readonly parameters: OperatingParametersApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly responsibilities: CatalogResponsibilityApi,
  ) {}

  async progress(scope: PersonnelProgressScope, today: BusinessDate): Promise<PersonnelProgressFacts> {
    const calendar = calendarWindowOf(
      today,
      await this.parameters.getNonWorkingDates(today, calendarLookAheadEnd(today)),
    );
    const late = await this.overdue.overdueCases(today, scope.departmentIds);
    const counts = await this.repo.departureCounts({
      departmentIds: scope.departmentIds,
      calendar,
      month: await this.monthInstants(today),
      overdueIds: late.map((row) => row.id),
    });

    return {
      calendar,
      departures: {
        ...counts,
        revocationOverdue: late.length,
        itHandoverPending: await this.itHandoverPending(),
      },
      transfers: await this.repo.transferCounts({ departmentIds: scope.departmentIds, today }),
    };
  }

  /**
   * The windows of revocations that open in a range of days, of departures and of transfers (SPEC P22, R5 E3). A departure keeps its deadline; a
   * transfer's is the first working day after its grace, counted the way the deadline of a departure is (`DEPARTURE_REVOCATION_WORKING_DAYS`), because the
   * tasks the sweeper opens for it carry none (D-99).
   */
  async revocationWindows(query: RevocationWindowQuery): Promise<RevocationWindowFacts[]> {
    const windows: RevocationWindowFacts[] = [];
    if (query.source !== 'TRANSFER') {
      for (const row of await this.repo.departureWindows(query)) windows.push({ source: 'OFFBOARDING', ...row });
    }
    if (query.source !== 'OFFBOARDING') {
      const transfers = await this.repo.transferWindows(query);
      if (transfers.length > 0) {
        const workingDays = Number(await this.parameters.getValue('DEPARTURE_REVOCATION_WORKING_DAYS'));
        const nonWorking = await this.parameters.getNonWorkingDates(query.from, addDays(query.to, 120));
        for (const { graceEndsOn, ...row } of transfers) {
          windows.push({
            source: 'TRANSFER',
            ...row,
            startOn: addDays(graceEndsOn, 1),
            dueOn: revocationDueOn(graceEndsOn, workingDays, nonWorking),
          });
        }
      }
    }

    return windows;
  }

  /** The departures past the deadline of their revocations with a right left without a completed task: the very ones the list gives for `revocationOverdue=true`. */
  async lateDepartures(today: BusinessDate, departmentIds?: readonly string[]): Promise<LateDepartureFacts[]> {
    return (await this.overdue.overdueCases(today, departmentIds)).map((late) => ({
      id: late.id,
      departmentId: late.departmentId,
    }));
  }

  /** The graces of the transfers of these people that took effect (SPEC P22, R5 E7). */
  graceWindowsOf(employeeIds: readonly string[]): Promise<GraceWindowFacts[]> {
    return this.repo.graceWindowsOf(employeeIds);
  }

  /** The first of the month of `today` and the first of the next, as the instants they begin at in the time zone of the organization. */
  private async monthInstants(today: BusinessDate): Promise<{ from: Date; to: Date }> {
    const zone = (await this.organizationReads.getOrganization())?.timeZone ?? 'UTC';
    const { start, nextStart } = monthBoundsOf(today);

    return {
      from: instantAtWallClock({ date: start, msOfDay: 0 }, zone),
      to: instantAtWallClock({ date: nextStart, msOfDay: 0 }, zone),
    };
  }

  /** The files whose person still answers for a subscription or an application: the same judgement as `itHandover.state` of the file (`PENDING`). */
  private async itHandoverPending(): Promise<number> {
    const employeeIds = await this.repo.handoverFileEmployees();
    if (employeeIds.length === 0) return 0;
    const answers = await this.responsibilities.countResponsibilitiesOf([...new Set(employeeIds)]);

    return employeeIds.filter((employeeId) => {
      const left = answers.get(employeeId);

      return left !== undefined && left.subscriptions + left.applications > 0;
    }).length;
  }
}
