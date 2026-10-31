import { Injectable } from '@nestjs/common';
import { PersonnelDashboardFactsRepo } from '../dashboard-facts/dashboard-facts.repo';

/**
 * What the role overviews read of personnel (`US-12-15` AC-3, AC-4, AC-7): counts only, each the count of an existing list for the same
 * scope. The caller decides who may read which and gives the scope; nothing here is checked against a role.
 */
@Injectable()
export class PersonnelDashboardApi {
  constructor(private readonly facts: PersonnelDashboardFactsRepo) {}

  /** The open reviews of tools after a transfer into the department, which its head decides. */
  openTransferReviews(departmentId: string): Promise<number> {
    return this.facts.openTransferReviews(departmentId);
  }

  /** The departures still handing over among people of these departments; zero for no department. */
  handingOverCases(departmentIds: readonly string[]): Promise<number> {
    return this.facts.handingOverCases(departmentIds);
  }

  /** The notices of heads about their people that wait to be rejected or recorded. */
  noticesAwaitingHandling(): Promise<number> {
    return this.facts.noticesAwaitingHandling();
  }
}
