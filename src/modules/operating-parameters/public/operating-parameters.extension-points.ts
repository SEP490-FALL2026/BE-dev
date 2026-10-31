import { Injectable } from '@nestjs/common';
import { Contributions } from '../../../core/extension/contributions';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

// The point the operating parameters open for the modules above them (`core/extension`): they add to it from a `*.listener.ts`
// when their module starts, so the parameters never import them. One instance per application.

/** Why a parameter can no longer change: something a module above the parameters holds was made under its value. */
export type ParameterLockReason = 'BUDGET_VERSION_EXISTS';

/**
 * A module that holds things made under the value of one parameter, and so says when that value may no longer change
 * (`US-01-04` AC-8: the month the fiscal year begins, once a budget version exists).
 *
 * `lockOf` runs inside the transaction of the change, after the writer took the exclusive lock of the key and before anything
 * is written. A module that creates what the value governs takes the shared side of the same lock with
 * `OperatingParametersApi.holdValue` before it creates it, so a creation and a change of the key never both succeed on the old
 * answer: whichever comes second sees the first.
 */
export interface ParameterLockReader {
  /** The parameter this reader answers for. */
  readonly key: string;
  /** The reason the value is locked, or null while it may still change. */
  lockOf(tx: DbTx): Promise<ParameterLockReason | null>;
}

/** Who says a parameter is locked, asked in the order they were added; one answer is enough to refuse the change. */
@Injectable()
export class ParameterLockContributions extends Contributions<ParameterLockReader> {
  constructor() {
    super('operating-parameters.lock-readers');
  }
}
