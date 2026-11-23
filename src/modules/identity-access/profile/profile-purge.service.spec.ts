import { Logger } from '@nestjs/common';
import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { ObjectStoragePort } from '../../../infrastructure/object-storage/object-storage.port';
import { ProfilePurgeService, PURGES_PER_PASS } from './profile-purge.service';
import type { ProfileRepo } from './profile.repo';

const at = (minute: number) => new Date(Date.UTC(2026, 10, 20, 0, minute));
const row = (index: number) => ({ id: `p${index}`, objectKey: `avatars/${index}`, requestedAt: at(index) });
const due = [row(1), row(2), row(3)];

/**
 * The pictures nobody points to any more are deleted outside any transaction (a slow or failing storage must not hold a database connection or row locks), and each
 * row is marked in a transaction of its own once its object is gone.
 */
describe('ProfilePurgeService.purgeDue', () => {
  function build(
    options: {
      failing?: string[];
      alreadyMarked?: string[];
      rows?: ReturnType<typeof row>[];
      markFails?: string[];
    } = {},
  ) {
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
    const rows = options.rows ?? due;
    const repo = {
      listDuePurges: jest.fn((limit: number, after: { requestedAt: Date; id: string } | null) =>
        Promise.resolve(
          rows.filter((candidate) => after === null || candidate.requestedAt > after.requestedAt).slice(0, limit),
        ),
      ),
      markPurged: jest.fn((_tx: unknown, id: string) => {
        if (options.markFails?.includes(id)) return Promise.reject(new Error('database down'));
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
    // The line names the row, never the key of the object (it carries the id of an account).
    expect(String(error.mock.calls[0][0])).toContain('p2');
    expect(String(error.mock.calls[0][0])).not.toContain('avatars/2');
  });

  it('goes on past rows that cannot be deleted, so a permanent failure at the head of the queue does not hold back the ones after it', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const stuck = Array.from({ length: PURGES_PER_PASS }, (_, index) => row(index + 1));
    const behind = [row(PURGES_PER_PASS + 1), row(PURGES_PER_PASS + 2)];
    const { service, marked } = build({ rows: [...stuck, ...behind], failing: stuck.map((purge) => purge.objectKey) });

    const done = await service.purgeDue();

    expect(done).toBe(2);
    expect(marked).toEqual(behind.map((purge) => purge.id));
  });

  it('says a row was not marked, not that its object was not purged, when the object is gone and the database fails', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { service, deleted } = build({ markFails: ['p2'] });

    expect(await service.purgeDue()).toBe(2);

    expect(deleted).toContain('avatars/2');
    expect(String(error.mock.calls[0][0])).toContain('was deleted but its row was not marked');
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
