import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { JobTitleRepo } from './job-title.repo';
import { JobTitleListFilter, JobTitleRecord, JobTitleStatus } from './job-title.types';

/**
 * The job title catalogue as `OrganizationModule` holds it: the owner of `JobTitleRepo`, which no other provider
 * injects. The organization facade reaches the catalogue through it, for the installation's first title, for the
 * catalogue's own HTTP use cases and for the share lock a person's entry takes. Every call runs in the caller's
 * transaction; the rules of the use cases (names, audit, conflicts) stay with `JobTitleService`.
 */
@Injectable()
export class JobTitleCatalogueService {
  constructor(private readonly repo: JobTitleRepo) {}

  /** The installation's title: created under the T-12 name rule, only its id returned. */
  createForInstallation(tx: DbTx, organizationId: string, name: string): Promise<{ id: string }> {
    return this.repo.createJobTitle(tx, organizationId, name);
  }

  insert(tx: DbTx, organizationId: string, name: string): Promise<JobTitleRecord> {
    return this.repo.insertJobTitle(tx, organizationId, name);
  }

  lock(tx: DbTx, jobTitleId: string, mode: 'SHARE' | 'UPDATE'): Promise<JobTitleRecord | null> {
    return this.repo.lockJobTitle(tx, jobTitleId, mode);
  }

  findByNormalizedName(organizationId: string, normalizedName: string): Promise<JobTitleRecord | null> {
    return this.repo.findJobTitleByNormalizedName(organizationId, normalizedName);
  }

  rename(tx: DbTx, jobTitleId: string, name: string, now: Date): Promise<JobTitleRecord> {
    return this.repo.renameJobTitle(tx, jobTitleId, name, now);
  }

  setStatus(tx: DbTx, jobTitleId: string, status: JobTitleStatus, now: Date): Promise<JobTitleRecord> {
    return this.repo.setJobTitleStatus(tx, jobTitleId, status, now);
  }

  list(filter: JobTitleListFilter): Promise<{ items: JobTitleRecord[]; total: number }> {
    return this.repo.listJobTitles(filter);
  }
}
