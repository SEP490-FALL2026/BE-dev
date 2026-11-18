import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { PersonnelDashboardFactsRepo } from '../dashboard-facts/dashboard-facts.repo';
import { PersonnelDashboardFactsService } from '../dashboard-facts/dashboard-facts.service';
import type {
  GraceWindowFacts,
  LateDepartureFacts,
  PersonnelProgressFacts,
  PersonnelProgressScope,
  RevocationWindowFacts,
  RevocationWindowQuery,
} from './personnel-dashboard.types';

/**
 * What the role overviews read of personnel (`US-12-15` AC-3, AC-4, AC-7, SPEC P21): counts only, each the count of an existing list for the same
 * scope. The caller decides who may read which and gives the scope; nothing here is checked against a role.
 */
@Injectable()
export class PersonnelDashboardApi {
  constructor(
    private readonly facts: PersonnelDashboardFactsRepo,
    private readonly progressFacts: PersonnelDashboardFactsService,
  ) {}

  /** The departures still handing over among people of these departments; zero for no department. */
  handingOverCases(departmentIds: readonly string[]): Promise<number> {
    return this.facts.handingOverCases(departmentIds);
  }

  /** The notices of heads about their people that wait to be rejected or recorded. */
  noticesAwaitingHandling(): Promise<number> {
    return this.facts.noticesAwaitingHandling();
  }

  /**
   * The progress of the departures and of the transfers on `today`: where each stands, the calendar window of the next working days, the hand-overs of
   * an IT Admin who left that wait (SPEC P21). No `departmentIds` is the whole company; a list is the departments of an IT Admin (empty counts nothing).
   */
  progress(scope: PersonnelProgressScope, today: BusinessDate): Promise<PersonnelProgressFacts> {
    return this.progressFacts.progress(scope, today);
  }

  /** The windows of revocations of departures and transfers that open in a range of days, each with the deadline the IT Admin has (SPEC P22). */
  revocationWindows(query: RevocationWindowQuery): Promise<RevocationWindowFacts[]> {
    return this.progressFacts.revocationWindows(query);
  }

  /** The departures past the deadline of their revocations with a right left without a completed task, as the list of departures gives them for `revocationOverdue=true`. */
  lateDepartures(today: BusinessDate, departmentIds?: readonly string[]): Promise<LateDepartureFacts[]> {
    return this.progressFacts.lateDepartures(today, departmentIds);
  }

  /** The graces of the transfers of these people that took effect, newest first. */
  graceWindowsOf(employeeIds: readonly string[]): Promise<GraceWindowFacts[]> {
    return this.progressFacts.graceWindowsOf(employeeIds);
  }
}
