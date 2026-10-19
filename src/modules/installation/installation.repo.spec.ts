import type { DbTx } from '../../infrastructure/database/transaction-runner';
import { InstallationRepo } from './installation.repo';

describe('InstallationRepo', () => {
  it('takes the transaction-scoped advisory lock on the fixed installation key, as one statement', async () => {
    const statements: { sql: string; values: unknown[] }[] = [];
    const tx = {
      $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
        statements.push({ sql: strings.join('?'), values });
        return Promise.resolve(1);
      },
    } as unknown as DbTx;

    await new InstallationRepo().lockInstallation(tx);

    expect(statements).toEqual([{ sql: 'SELECT pg_advisory_xact_lock(?::bigint)', values: [6173204001] }]);
  });
});
