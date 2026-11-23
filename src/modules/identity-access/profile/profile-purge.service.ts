import { Inject, Injectable, Logger } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { OBJECT_STORAGE, type ObjectStoragePort } from '../../../infrastructure/object-storage/object-storage.port';
import { describeForOperator } from '../../../infrastructure/observability/operator-error';
import { ProfileRepo } from './profile.repo';

/** The most objects one pass deletes: a backlog is cleared over several passes. */
export const PURGES_PER_PASS = 50;

/** The most rows one pass looks at, deleted or not: an object that can never be deleted does not keep the ones after it from being tried, and the pass stays bounded. */
export const PURGES_EXAMINED_PER_PASS = 500;

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
   * How many rows this pass marked as done. An object that cannot be deleted is logged and left for the next pass, and the pass goes on to the rows after it
   * (up to `PURGES_PER_PASS` done or `PURGES_EXAMINED_PER_PASS` looked at); the log names the row, never the key of the object, which carries the id of an account.
   */
  async purgeDue(now: Date = new Date()): Promise<number> {
    let marked = 0;
    let examined = 0;
    let after: { requestedAt: Date; id: string } | null = null;
    while (marked < PURGES_PER_PASS && examined < PURGES_EXAMINED_PER_PASS) {
      const page = await this.repo.listDuePurges(PURGES_PER_PASS, after);
      if (page.length === 0) break;
      for (const purge of page) {
        examined += 1;
        if (await this.purgeOne(purge, now)) marked += 1;
        if (marked >= PURGES_PER_PASS) break;
      }
      const last = page[page.length - 1];
      after = { requestedAt: last.requestedAt, id: last.id };
    }

    return marked;
  }

  private async purgeOne(purge: { id: string; objectKey: string }, now: Date): Promise<boolean> {
    try {
      await this.storage.delete(purge.objectKey);
    } catch (error) {
      this.logger.error(`Picture purge ${purge.id}: the object was not purged: ${describeForOperator(error)}`);

      return false;
    }
    try {
      return await this.runner.run((tx) => this.repo.markPurged(tx, purge.id, now));
    } catch (error) {
      this.logger.error(
        `Picture purge ${purge.id}: the object was deleted but its row was not marked, it is tried again: ${describeForOperator(error)}`,
      );

      return false;
    }
  }
}
