import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { ImpactPreviewFrame } from './impact-preview-frame.service';

/** A runner that commits when the work returns and rolls back when it throws, as the real one does, and says which it did. */
function runnerThatTells() {
  const log: string[] = [];
  const runner = {
    run: async <T>(work: (tx: DbTx) => Promise<T>): Promise<T> => {
      try {
        const result = await work({} as DbTx);
        log.push('commit');

        return result;
      } catch (error) {
        log.push('rollback');
        throw error;
      }
    },
  };

  return { frame: new ImpactPreviewFrame(runner as unknown as TransactionRunner), log };
}

describe('ImpactPreviewFrame: a preview never commits', () => {
  it('gives the answer of the work and rolls the transaction back, so nothing the checks took or wrote is kept', async () => {
    const { frame, log } = runnerThatTells();

    await expect(frame.run(() => Promise.resolve({ rightsToRevoke: [] }))).resolves.toEqual({ rightsToRevoke: [] });
    expect(log).toEqual(['rollback']);
  });

  it('lets a refusal of the work leave as it is, and rolls back', async () => {
    const { frame, log } = runnerThatTells();
    const refusal = new Error('the record would refuse');

    await expect(frame.run(() => Promise.reject(refusal))).rejects.toBe(refusal);
    expect(log).toEqual(['rollback']);
  });

  it('hands the work the transaction of the runner', async () => {
    const { frame } = runnerThatTells();
    let seen: unknown;

    await frame.run((tx) => {
      seen = tx;

      return Promise.resolve(1);
    });

    expect(seen).toEqual({});
  });
});
