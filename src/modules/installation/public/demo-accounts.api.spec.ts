import type { ConfigService } from '@nestjs/config';
import type { DatabaseEnvironmentVariables } from '../../../infrastructure/config/env-schema';
import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../audit/public/audit.api';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { LocalDemoAccountApi } from '../../identity-access/public/local-demo-account.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { DemoAccountsApi } from './demo-accounts.api';
import type { DemoAccountSpec } from './demo-accounts.types';

const specs: DemoAccountSpec[] = Array.from({ length: 14 }, (_, index) => ({
  employeeCode: `DS1-${index}`,
  loginEmail: `p${index}@ds1.example`,
  role: 'EMPLOYEE',
}));

/** A runner that records, per transaction, how many accounts were judged inside it. */
function world(missing: readonly string[] = []) {
  const perTransaction: number[] = [];
  let current: number | null = null;
  const runner = {
    run: async <T>(work: (tx: DbTx) => Promise<T>): Promise<T> => {
      current = 0;
      try {
        return await work({} as DbTx);
      } finally {
        perTransaction.push(current);
        current = null;
      }
    },
  } as unknown as TransactionRunner;
  const organizationReads = {
    getEmployeesByCodes: (codes: readonly string[]) =>
      Promise.resolve(
        codes
          .filter((code) => !missing.includes(code))
          .map((code) => ({ id: `emp-${code}`, employeeCode: code, status: 'ACTIVE' })),
      ),
  } as unknown as OrganizationReadApi;
  const accounts = {
    describeDemoAccount: (_tx: DbTx, input: { employeeId: string }) => {
      if (current !== null) current += 1;
      return Promise.resolve(
        input.employeeId === 'emp-DS1-3' ? { state: 'conflict', reason: 'ACCOUNT_DIFFERS' } : { state: 'present' },
      );
    },
  } as unknown as LocalDemoAccountApi;
  const identity = {
    findAccountIdOfEmployee: (_tx: DbTx, employeeId: string) => Promise.resolve(`user-${employeeId}`),
  } as unknown as IdentityAccessApi;
  const api = new DemoAccountsApi(
    runner,
    organizationReads,
    identity,
    accounts,
    {} as AuditApi,
    {} as ConfigService<DatabaseEnvironmentVariables, true>,
  );

  return { api, perTransaction };
}

describe('DemoAccountsApi.describe', () => {
  it('judges each account in a short transaction of its own, never all of them in one', async () => {
    // Over the SSH tunnel of path B each query costs a round trip (~245 ms to the VPS): ~4 queries for each of 14
    // accounts in one interactive transaction outlived DB_TRANSACTION_TIMEOUT_MS and failed with P2028.
    const { api, perTransaction } = world();

    await api.describe('org-1', specs);

    expect(perTransaction.filter((count) => count > 0)).toHaveLength(specs.length);
    expect(Math.max(...perTransaction)).toBe(1);
  });

  it('answers the same plan as before: state, conflict reason, ids, and no-employee without a lookup', async () => {
    const { api } = world(['DS1-5']);

    const plan = await api.describe('org-1', specs);

    expect(plan).toHaveLength(14);
    expect(plan[0]).toEqual({
      employeeCode: 'DS1-0',
      state: 'present',
      employeeId: 'emp-DS1-0',
      appUserId: 'user-emp-DS1-0',
    });
    expect(plan[3]).toEqual({
      employeeCode: 'DS1-3',
      state: 'conflict',
      reason: 'ACCOUNT_DIFFERS',
      employeeId: 'emp-DS1-3',
      appUserId: 'user-emp-DS1-3',
    });
    expect(plan[5]).toEqual({ employeeCode: 'DS1-5', state: 'no-employee', employeeId: null, appUserId: null });
  });
});
