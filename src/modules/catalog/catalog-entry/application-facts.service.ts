import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
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
  constructor(private readonly applications: ApplicationRepo) {}

  /** The application, locked `FOR SHARE` until the transaction ends so it cannot be retired meanwhile; null if absent. */
  lockShared(tx: DbTx, id: string): Promise<LockedApplication | null> {
    return this.applications.lockShared(tx, id);
  }

  /** Queues the duplicate checks of an organization one behind the other until the transaction ends (the check and the write are one step, `database-business.md`). */
  lockDuplicateCheck(tx: DbTx, organizationId: string): Promise<void> {
    return this.applications.lockDuplicateCheck(tx, organizationId);
  }

  /** The approved applications that may be the same software as a candidate, for the duplicate rule (`QĐ-111b`): see `ApplicationRepo.duplicateCandidates`. */
  duplicateCandidates(tx: DbTx, normalizedName: string, hosts: readonly string[]) {
    return this.applications.duplicateCandidates(tx, normalizedName, hosts);
  }

  /** How many applications the catalog holds. */
  count(): Promise<number> {
    return this.applications.count();
  }

  /** The kind, whether it is a communication service and whether it is retired, of these applications (those that exist). */
  collectorApplications(ids: readonly string[], tx?: DbTx) {
    return this.applications.collectorApplications(ids, tx);
  }
}
