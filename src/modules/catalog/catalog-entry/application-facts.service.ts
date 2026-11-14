import { Injectable } from '@nestjs/common';
import { searchKey } from '../../../core/search-key';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { duplicateOf, type DuplicateBy } from '../public/catalog-duplicate.policy';
import { ApplicationDomainInvalidError } from './application.errors';
import { cleanApplicationDomains, cleanApplicationName } from './application.policy';
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

  /**
   * The application of the catalog that is the same software as the one a person declares by its name and its web page (`QĐ-111b`): the same rule of
   * `duplicateOf` as the IT Admin who declares an application, by name or by the host of the page. A page that has no host to compare simply adds no
   * domain: the name alone is judged. Null when the catalog has nothing like it.
   */
  async duplicateOfDeclared(
    tx: DbTx,
    declared: { name: string; homepageUrl: string },
  ): Promise<{ by: DuplicateBy; applicationId: string } | null> {
    const name = cleanApplicationName(declared.name);
    let domains: string[] = [];
    try {
      domains = cleanApplicationDomains([declared.homepageUrl]);
    } catch (error) {
      if (!(error instanceof ApplicationDomainInvalidError)) throw error;
    }
    const candidates = await this.applications.duplicateCandidates(tx, searchKey(name), domains);
    const duplicate = duplicateOf({ name, domains }, candidates);

    return duplicate ? { by: duplicate.by, applicationId: duplicate.entry.id } : null;
  }

  /** The name, the vendor and whether it is still in the catalog, of an application a proposal names; null when it does not exist. */
  entryFacts(tx: DbTx, id: string) {
    return this.applications.entryFacts(id, tx);
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
