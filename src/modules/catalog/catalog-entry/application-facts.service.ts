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

  /** The IT Admin named responsible for the application (`QĐ-111g`), who may since have left; null when none is named or it does not exist. */
  async responsibleItAdminOf(applicationId: string, tx?: DbTx): Promise<string | null> {
    return (await this.applications.find(applicationId, tx))?.responsibleItAdminEmployeeId ?? null;
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
