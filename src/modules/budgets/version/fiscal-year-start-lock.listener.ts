import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  ParameterLockContributions,
  type ParameterLockReader,
  type ParameterLockReason,
} from '../../operating-parameters/public/operating-parameters.extension-points';
import { VersionRepo } from '../budget/version.repo';

/**
 * Tells the operating parameters that the month the fiscal year begins may no longer change once any budget version exists
 * (`US-01-04` AC-8), whatever the state of the version: a draft, a refused or an expired one was made under the month as well.
 * It adds itself when the module starts, so the parameters never import budgets. `VersionCreationService` takes the shared side of
 * the same lock before it makes the first version, so a creation and a change of the month meet one after the other.
 */
@Injectable()
export class FiscalYearStartLockReader implements ParameterLockReader, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [ParameterLockContributions] as const;

  readonly key = 'FISCAL_YEAR_START_MONTH';

  constructor(
    private readonly versions: VersionRepo,
    private readonly locks: ParameterLockContributions,
  ) {}

  onModuleInit(): void {
    this.locks.add('budgets.fiscal-year-start', this);
  }

  async lockOf(tx: DbTx): Promise<ParameterLockReason | null> {
    return (await this.versions.anyExists(tx)) ? 'BUDGET_VERSION_EXISTS' : null;
  }
}
