import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { OperatingParametersService } from '../../operating-parameters/operating-parameters.service';
import { reopenUntil, responseDueOn, windowEnd } from './saas-issue.policy';

const RESPONSE_DAYS = 'SAAS_ISSUE_RESPONSE_WORKING_DAYS';
const REOPEN_DAYS = 'SAAS_ISSUE_REOPEN_WORKING_DAYS';

/**
 * The two days a report is bound by, read from the operating parameters at the moment they are fixed: a parameter changed later
 * reaches only the reports made or resolved after it, never one that is running.
 */
@Injectable()
export class SaasIssueCalendar {
  constructor(private readonly parameters: OperatingParametersService) {}

  /** The day a report made on `today` should be taken up by. */
  async responseDueOn(today: BusinessDate): Promise<BusinessDate> {
    const days = Number(await this.parameters.getValue(RESPONSE_DAYS));

    return responseDueOn(today, days, await this.parameters.getNonWorkingDates(today, windowEnd(today)));
  }

  /** The last day a report resolved on `today` may be reopened. */
  async reopenUntil(today: BusinessDate): Promise<BusinessDate> {
    const days = Number(await this.parameters.getValue(REOPEN_DAYS));

    return reopenUntil(today, days, await this.parameters.getNonWorkingDates(today, windowEnd(today)));
  }
}
