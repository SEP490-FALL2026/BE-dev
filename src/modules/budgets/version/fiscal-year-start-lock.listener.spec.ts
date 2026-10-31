import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ParameterLockContributions } from '../../operating-parameters/public/operating-parameters.extension-points';
import type { VersionRepo } from '../budget/version.repo';
import { FiscalYearStartLockReader } from './fiscal-year-start-lock.listener';

const TX = {} as DbTx;

describe('FiscalYearStartLockReader', () => {
  const build = (exists: boolean) => {
    const locks = new ParameterLockContributions();
    const reader = new FiscalYearStartLockReader(
      { anyExists: () => Promise.resolve(exists) } as unknown as VersionRepo,
      locks,
    );

    return { reader, locks };
  };

  it('adds itself to the lock readers of the operating parameters when the module starts, for the fiscal year start month', () => {
    const { reader, locks } = build(false);

    reader.onModuleInit();

    expect(locks.names()).toEqual(['budgets.fiscal-year-start']);
    expect(locks.all()[0].key).toBe('FISCAL_YEAR_START_MONTH');
  });

  it('says the month is locked once any budget version exists, of whatever state', async () => {
    expect(await build(true).reader.lockOf(TX)).toBe('BUDGET_VERSION_EXISTS');
  });

  it('says nothing while there is no version', async () => {
    expect(await build(false).reader.lockOf(TX)).toBeNull();
  });
});
