import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
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
export class ApplicationFactsService {
  constructor(
    private readonly applications: ApplicationRepo,
    private readonly organizationReads: OrganizationReadApi,
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
    const owner = await this.organizationReads.getEmployee(application.businessOwnerEmployeeId);

    return owner && owner.status === 'ACTIVE' ? owner.id : null;
  }

  /** The kind, whether it is a communication service and whether it is retired, of these applications (those that exist). */
  collectorApplications(ids: readonly string[], tx?: DbTx) {
    return this.applications.collectorApplications(ids, tx);
  }
}
