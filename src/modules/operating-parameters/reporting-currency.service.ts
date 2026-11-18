import { Injectable } from '@nestjs/common';
import { OrganizationReadApi } from '../organization/public/organization-read.api';

/**
 * The reporting currency of the organization (`US-01-04` AC-9): dong, fixed since every amount is entered in it and nothing is converted
 * (`QĐ-111an`). It is only read: the organization keeps it as a column, and no route changes it any more.
 */
@Injectable()
export class ReportingCurrencyService {
  constructor(private readonly organizationReads: OrganizationReadApi) {}

  async get(): Promise<{ currency: string }> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The reporting currency was read before installation');

    return { currency: organization.reportingCurrency };
  }
}
