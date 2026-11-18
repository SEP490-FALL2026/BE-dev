import { Injectable } from '@nestjs/common';
import { OrganizationReadApi } from '../organization/public/organization-read.api';
import { groundsIssuedOnFutureException } from './personnel-access.http-errors';

/**
 * A basis is a document that exists: its issue day is not after today in the organization (Owner, 06/11/2026). Every operation that
 * takes a basis asks this before it does any work, so a refused basis saves nothing. The shape of the basis is the DTO's.
 */
@Injectable()
export class PersonnelGroundsDateService {
  constructor(private readonly organizationReads: OrganizationReadApi) {}

  /** Throws a 422 `PERSONNEL.GROUNDS_ISSUED_ON_FUTURE` when the basis is given and issued after today. */
  async assertNotInFuture(grounds: { issuedOn: string } | null | undefined): Promise<void> {
    if (!grounds) return;
    const today = await this.organizationReads.businessToday();
    if (grounds.issuedOn > today) throw groundsIssuedOnFutureException(today);
  }
}
