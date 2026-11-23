import { Logger } from '@nestjs/common';
import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { ObjectStoragePort } from '../../../infrastructure/object-storage/object-storage.port';
import { ProfilePurgeService } from './profile-purge.service';
import type { ProfileRepo } from './profile.repo';

const due = [
  { id: 'p1', objectKey: 'avatars/1' },
  { id: 'p2', objectKey: 'avatars/2' },
  { id: 'p3', objectKey: 'avatars/3' },
];

/**
 * The pictures nobody points to any more are deleted outside any transaction (a slow or failing storage must not hold a database connection or row locks), and each
 * row is marked in a transaction of its own once its object is gone.
 */
describe('ProfilePurgeService.purgeDue', () => {
  function build(options: { failing?: string[]; alreadyMarked?: string[] } = {}) {
    let inTransaction = false;
    const deletedInTransaction: boolean[] = [];
    const deleted: string[] = [];
    const marked: string[] = [];
    const storage = {
      delete: jest.fn(async (key: string) => {
        deletedInTransaction.push(inTransaction);
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (options.failing?.includes(key)) throw new Error(`storage unreachable for ${key}`);
        deleted.push(key);
      }),
    };
    const repo = {
      listDuePurges: jest.fn(() => Promise.resolve(due)),
      markPurged: jest.fn((_tx: unknown, id: string) => {
        if (options.alreadyMarked?.includes(id)) return Promise.resolve(false);
        marked.push(id);

        return Promise.resolve(true);
      }),
    };
    const runner = {
      run: async (work: (tx: DbTx) => Promise<unknown>) => {
        inTransaction = true;
        try {
          return await work({} as DbTx);
        } finally {
          inTransaction = false;
        }
      },
    };
    const service = new ProfilePurgeService(
      repo as unknown as ProfileRepo,
      storage as unknown as ObjectStoragePort,
      runner as unknown as TransactionRunner,
    );

    return { service, repo, storage, deleted, marked, deletedInTransaction };
  }

  afterEach(() => jest.restoreAllMocks());

  it('marks the rows whose object is gone and leaves the one whose object could not be deleted, logging it once', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { service, marked } = build({ failing: ['avatars/2'] });

    const done = await service.purgeDue(new Date('2026-11-23T00:00:00Z'));

    expect(done).toBe(2);
    expect(marked).toEqual(['p1', 'p3']);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('avatars/2');
  });

  it('deletes every object outside a transaction', async () => {
    const { service, deletedInTransaction, storage } = build();

    await service.purgeDue();

    expect(storage.delete).toHaveBeenCalledTimes(3);
    expect(deletedInTransaction).toEqual([false, false, false]);
  });

  it('does not count a row another instance marked first', async () => {
    const { service } = build({ alreadyMarked: ['p1'] });

    expect(await service.purgeDue()).toBe(2);
  });
});
