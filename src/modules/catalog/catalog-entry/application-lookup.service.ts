import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationApi } from '../../organization/public/organization.api';
import { ApplicationRepo } from './application.repo';
import type { ApplicationKind, CatalogStatus } from './application.types';

export interface LockedApplication {
  id: string;
  name: string;
  kind: ApplicationKind;
  status: CatalogStatus;
}

/** What the plans of an application, and the senders of its alerts, need to know about it. */
@Injectable()
export class ApplicationLookupService {
  constructor(
    private readonly applications: ApplicationRepo,
    private readonly organization: OrganizationApi,
  ) {}

  /** The application, locked `FOR SHARE` until the transaction ends so it cannot be retired meanwhile; null if absent. */
  lockShared(tx: DbTx, id: string): Promise<LockedApplication | null> {
    return this.applications.lockShared(tx, id);
  }

  /** The first `limit` applications still in use that this employee is the Business Owner of, and how many there are. */
  ownedBy(
    employeeId: string,
    limit: number,
    tx?: DbTx,
  ): Promise<{ items: { id: string; name: string }[]; total: number }> {
    return this.applications.ownedBy(employeeId, limit, tx);
  }

  /** How many applications the catalog holds. */
  count(): Promise<number> {
    return this.applications.count();
  }

  /**
   * The employee who receives the alerts about the application (renewal and the like): its Business Owner, but only
   * while they are still working. An owner who has left receives none (`BR-06.7`, OI-05c), and the application keeps them
   * until a replacement is named; null when there is no one to alert.
   */
  async renewalAlertRecipient(applicationId: string): Promise<string | null> {
    const application = await this.applications.find(applicationId);
    if (!application) return null;
    const owner = await this.organization.getEmployee(application.businessOwnerEmployeeId);

    return owner && owner.status === 'ACTIVE' ? owner.id : null;
  }
}
