import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';

/** The answer a preview carries out of the transaction that is then rolled back. */
class PreviewDone<T> extends Error {
  constructor(readonly answer: T) {
    super('A preview never commits.');
  }
}

/**
 * The frame of a preview of a write (`P23`, `MIN-7`): the work runs in a transaction that is **always rolled back**, so whatever the checks it runs
 * take (the locks of the protocol, a read under them) never leaves a row, an audit event, a notice or a message behind, and a preview can be asked
 * as often as the Super Admin likes. The answer leaves as the value the work returns; an error the work throws leaves as it is, so a refusal is the
 * very refusal of the write it previews.
 */
@Injectable()
export class ImpactPreviewFrame {
  constructor(private readonly runner: TransactionRunner) {}

  async run<T>(work: (tx: DbTx) => Promise<T>): Promise<T> {
    try {
      await this.runner.run(async (tx) => {
        throw new PreviewDone(await work(tx));
      });
    } catch (error) {
      if (error instanceof PreviewDone) return error.answer as T;
      throw error;
    }
    // The runner only returns when the work does not throw, and this work always does.
    throw new Error('A preview never commits.');
  }
}
