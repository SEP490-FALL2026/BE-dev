import { Injectable } from '@nestjs/common';
import { businessDateAt, type BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { UsageFactsRepo } from '../assignment/usage-facts.repo';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AccountIdentifierHolder, AssignmentInterval, AssignmentIntervalFilter } from './licensing-usage.types';

/** The licensing facade for the usage of vendors (`FR-4.8`, `FR-4.9`): what the seats were, never what changes them. */
@Injectable()
export class LicensingUsageApi {
  constructor(
    private readonly facts: UsageFactsRepo,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /**
   * The seats that held a day of `[from, to]` of an application (or the plans named), each with the day it could be used (`QĐ-77n`); the
   * links of a chain of renewals are separate intervals that share the `chainRootId` and the `usableOn` of the first link: a fixed number of
   * statements however many there are.
   */
  async listAssignmentIntervals(filter: AssignmentIntervalFilter, tx?: DbTx): Promise<AssignmentInterval[]> {
    const organization = await this.organizationReads.getOrganization();
    const zone = organization?.timeZone ?? 'UTC';

    return this.facts.intervals(filter, (instant) => businessDateAt(instant, zone), tx);
  }

  /** The people who hold, or held, a seat of the application under these normalized account identifiers. */
  findHoldersByAccountIdentifiers(
    applicationId: string,
    normalizedIdentifiers: readonly string[],
    tx?: DbTx,
  ): Promise<AccountIdentifierHolder[]> {
    return this.facts.holdersOfAccounts(applicationId, normalizedIdentifiers, tx);
  }

  /** The people who hold a seat of the application on `asOf`, each once: who is told that its usage is tracked (`US-08-05`). */
  listCurrentHolders(applicationId: string, asOf: BusinessDate, tx?: DbTx): Promise<string[]> {
    return this.facts.currentHolders(applicationId, asOf, tx);
  }
}
