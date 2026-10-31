import { Injectable } from '@nestjs/common';
import { BusinessDate, businessDateAt } from '../../core/business-date';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { OrganizationRepo } from './organization.repo';
import type { OrganizationRecord } from './public/organization.types';

/**
 * The organization the use cases of the module run in: its calendar day and its record. A capability reads them here, not through
 * the facade of the module (`OrganizationApi` is the door for the other modules), so no capability reaches the others by way of it.
 */
@Injectable()
export class OrganizationContextService {
  /** The organization's time zone never changes after installation (I-8), so it is read once. */
  private timeZone: string | null = null;

  constructor(private readonly repo: OrganizationRepo) {}

  /** Today in the organization's own calendar (`now` is a parameter for tests; `tx` reads the zone in the caller's transaction). */
  async businessToday(now: Date = new Date(), tx?: DbTx): Promise<BusinessDate> {
    if (this.timeZone === null) {
      const organization = await this.repo.findOrganization(tx);
      if (!organization) return businessDateAt(now, 'UTC');
      this.timeZone = organization.timeZone;
    }

    return businessDateAt(now, this.timeZone);
  }

  /** The record of the organization, or null before the installation. */
  findOrganization(tx?: DbTx): Promise<OrganizationRecord | null> {
    return this.repo.findOrganization(tx);
  }
}
