import { Injectable } from '@nestjs/common';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { calendarWindowOf, dueOnOf, type DueStep } from './step-due-on.policy';

/**
 * The day each step of a page of a queue is due, counted on the calendar of the organization (`US-05-09`): two reads whatever
 * the size of the page (the organization, the days nobody works). Both queues an approver reads, the need steps and the spend
 * steps, show it, so the phone can put them in one list.
 */
@Injectable()
export class StepDueOnService {
  constructor(
    private readonly organization: OrganizationApi,
    private readonly parameters: OperatingParametersApi,
  ) {}

  /** The due day of each step by its id; an empty page reads nothing. */
  async dueOn(steps: readonly (DueStep & { id: string })[]): Promise<Map<string, string>> {
    if (steps.length === 0) return new Map();
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('The organization is not set up, so a deadline cannot be counted.');
    const window = calendarWindowOf(steps, organization.timeZone);
    if (!window) return new Map();
    const nonWorkingDates = await this.parameters.getNonWorkingDates(window.from, window.to);

    return new Map(steps.map((step) => [step.id, dueOnOf(step, nonWorkingDates, organization.timeZone)]));
  }
}
