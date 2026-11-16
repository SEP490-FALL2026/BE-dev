import { Injectable } from '@nestjs/common';
import { addDays } from '../../../core/business-date';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { RequestsApi } from '../../requests/public/requests.api';
import { revocationOf, type Revocation } from './out-of-process-revocation.policy';
import { VendorAccountReviewRepo } from './vendor-account-review.repo';
import type { OutOfProcessCaseRecord } from './vendor-account-review.types';

/** More than the ten working days of the wait can ever span, holidays included: the days nobody works are read this far past the last conclusion. */
const CALENDAR_DAYS_PAST_LAST_CONCLUSION = 60;

/**
 * What the cases outside the process ask of the IT Admin by way of revocation, worked out when they are read and never stored (`US-13-05` AC-20, AC-23,
 * AC-24). Only an open case on a company asset can ask, so a page that has none reads nothing else; for the ones that can, the Requests of their people
 * come in one call to the facade of the requests, the calendar in one read of the operating parameters, however many cases.
 */
@Injectable()
export class OutOfProcessRevocationService {
  constructor(
    private readonly reviews: VendorAccountReviewRepo,
    private readonly requests: RequestsApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly parameters: OperatingParametersApi,
  ) {}

  /** The revocation of each case, by the id of the case. */
  async of(cases: readonly OutOfProcessCaseRecord[]): Promise<ReadonlyMap<string, Revocation>> {
    const asking = cases.filter((row) => row.state === 'OPEN' && row.companyAsset === true && row.concludedOn !== null);
    const today = await this.organizationReads.businessToday();
    const days = asking.flatMap((row) => (row.concludedOn === null ? [] : [row.concludedOn])).sort();
    const nonWorkingDates =
      days.length === 0
        ? new Set<string>()
        : await this.parameters.getNonWorkingDates(
            days[0],
            addDays(days[days.length - 1], CALENDAR_DAYS_PAST_LAST_CONCLUSION),
          );
    const people = await this.reviews.employeeIdsOfCases(asking.map((row) => row.id));
    const questions = asking.flatMap((row) => {
      const employeeId = people.get(row.id) ?? null;

      return employeeId === null || row.applicationId === null || row.concludedOn === null
        ? []
        : [{ caseId: row.id, employeeId, applicationId: row.applicationId, since: row.concludedOn }];
    });
    const answers = await this.requests.openGrantRequestsOf(questions);
    const requestOf = new Map(questions.map((question, index) => [question.caseId, answers[index]]));

    return new Map(
      cases.map((row) => {
        const found = requestOf.get(row.id) ?? null;

        return [
          row.id,
          revocationOf({
            state: row.state,
            companyAsset: row.companyAsset,
            concludedOn: row.concludedOn,
            today,
            nonWorkingDates,
            request:
              found === null ? null : { id: found.requestId, stage: found.stage, reachedSpendOn: found.reachedSpendOn },
          }),
        ];
      }),
    );
  }

  /** How many open cases on a company asset have the revocation due now (the count of the overview of an IT Admin). */
  async dueCount(): Promise<number> {
    const open = await this.reviews.openCompanyAssetCases();
    const revocations = await this.of(open);

    return [...revocations.values()].filter((revocation) => revocation.due).length;
  }
}
