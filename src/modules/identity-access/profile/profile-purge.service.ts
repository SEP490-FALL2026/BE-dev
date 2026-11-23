import { Inject, Injectable, Logger } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { OBJECT_STORAGE, type ObjectStoragePort } from '../../../infrastructure/object-storage/object-storage.port';
import { describeForOperator } from '../../../infrastructure/observability/operator-error';
import { ProfileRepo } from './profile.repo';

/** The most objects one pass deletes: a backlog is cleared over several passes. */
export const PURGES_PER_PASS = 50;

/**
 * Deletes the pictures nobody points to any more (`MAJ-12`): the change that dropped one committed first, so the object is only gone when the account really stopped
 * pointing at it. The rows still to delete are read without a lock and each object is deleted outside any transaction, so a slow or unreachable storage never holds a
 * connection or a row lock. Deleting is repeatable (a missing object is not an error), so two instances do no harm; a row is marked done, in a short transaction of its
 * own, only after its object is gone, and only when nobody marked it first.
 */
@Injectable()
export class ProfilePurgeService {
  private readonly logger = new Logger(ProfilePurgeService.name);

  constructor(
    private readonly repo: ProfileRepo,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * How many rows this pass marked as done. An object that cannot be deleted is logged and left for the next pass; the others of the pass go on.
   */
  async purgeDue(now: Date = new Date()): Promise<number> {
    let marked = 0;
    for (const purge of await this.repo.listDuePurges(PURGES_PER_PASS)) {
      try {
        await this.storage.delete(purge.objectKey);
        if (await this.runner.run((tx) => this.repo.markPurged(tx, purge.id, now))) marked += 1;
      } catch (error) {
        this.logger.error(`Picture object ${purge.objectKey} was not purged: ${describeForOperator(error)}`);
      }
    }

    return marked;
  }
}
