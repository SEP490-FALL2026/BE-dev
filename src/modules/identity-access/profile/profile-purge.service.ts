import { Inject, Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { OBJECT_STORAGE, type ObjectStoragePort } from '../../../infrastructure/object-storage/object-storage.port';
import { ProfileRepo } from './profile.repo';

/** The most objects one pass deletes: a backlog is cleared over several passes, never in one long transaction. */
export const PURGES_PER_PASS = 50;

/**
 * Deletes the pictures nobody points to any more (`MAJ-12`): the change that dropped one committed first, so the object is only gone when
 * the account really stopped pointing at it. Deleting is repeatable (a missing object is not an error), so two instances or a pass that failed
 * half way do no harm; a row is marked done only after its object is gone.
 */
@Injectable()
export class ProfilePurgeService {
  constructor(
    private readonly repo: ProfileRepo,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    private readonly runner: TransactionRunner,
  ) {}

  /** How many objects were deleted. A storage that cannot answer stops the pass; the rows stay for the next one. */
  purgeDue(now: Date = new Date()): Promise<number> {
    return this.runner.run(async (tx) => {
      const due = await this.repo.claimPurges(tx, PURGES_PER_PASS);
      for (const purge of due) {
        await this.storage.delete(purge.objectKey);
        await this.repo.markPurged(tx, purge.id, now);
      }

      return due.length;
    });
  }
}
