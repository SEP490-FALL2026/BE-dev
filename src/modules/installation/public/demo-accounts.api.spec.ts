import type { ConfigService } from '@nestjs/config';
import type { DatabaseEnvironmentVariables } from '../../../infrastructure/config/env-schema';
import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../audit/public/audit.api';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { LocalDemoAccountApi } from '../../identity-access/public/local-demo-account.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { DemoAccountsApi } from './demo-accounts.api';
import type { DemoAccountSpec } from './demo-accounts.types';
import { DemoAccountsChangedError } from './installation.errors';

const specs: DemoAccountSpec[] = Array.from({ length: 14 }, (_, index) => ({
  employeeCode: `DS1-${index}`,
  loginEmail: `p${index}@ds1.example`,
  role: 'EMPLOYEE',
}));

/** A runner that records, per transaction, how many accounts were judged inside it. */
function world(missing: string[] = [], accountState: 'present' | 'absent' = 'present') {
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
  const getEmployeesByCodes = jest.fn((codes: readonly string[]) =>
    Promise.resolve(
      codes
        .filter((code) => !missing.includes(code))
        .map((code) => ({ id: `emp-${code}`, employeeCode: code, status: 'ACTIVE' })),
    ),
  );
  const organizationReads = { getEmployeesByCodes } as unknown as OrganizationReadApi;
  const accounts = {
    describeDemoAccount: (_tx: DbTx, input: { employeeId: string }) => {
      if (current !== null) current += 1;
      return Promise.resolve(
        input.employeeId === 'emp-DS1-3' ? { state: 'conflict', reason: 'ACCOUNT_DIFFERS' } : { state: accountState },
      );
    },
    createDemoAccount: jest.fn(() => Promise.resolve({ appUserId: 'new-user' })),
  } as unknown as LocalDemoAccountApi;
  const identity = {
    findAccountIdOfEmployee: (_tx: DbTx, employeeId: string) => Promise.resolve(`user-${employeeId}`),
    prepareCredential: () => Promise.resolve({ hash: 'hash', hashPolicyVersion: 1 }),
  } as unknown as IdentityAccessApi;
  const api = new DemoAccountsApi(
    runner,
    organizationReads,
    identity,
    accounts,
    { record: jest.fn(() => Promise.resolve()) } as unknown as AuditApi,
    {} as ConfigService<DatabaseEnvironmentVariables, true>,
  );

  return { api, perTransaction, getEmployeesByCodes };
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

  it('reads the employees of all the accounts once, in a short transaction of its own', async () => {
    const { api, getEmployeesByCodes, perTransaction } = world();

    await api.describe('org-1', specs);

    expect(getEmployeesByCodes).toHaveBeenCalledTimes(1);
    expect(getEmployeesByCodes.mock.calls[0][0]).toEqual(specs.map((spec) => spec.employeeCode));
    expect(perTransaction[0]).toBe(0); // the read judged no account: one transaction for it, then one for each account
    expect(perTransaction).toHaveLength(1 + specs.length);
  });

  it('opens no transaction for an account whose employee is not there', async () => {
    const { api, perTransaction } = world(['DS1-5', 'DS1-6']);

    await api.describe('org-1', specs);

    expect(perTransaction).toHaveLength(1 + specs.length - 2);
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

describe('DemoAccountsApi.create', () => {
  const attribution = { operatorReference: 'DEMO_DATASET:shared-demo-v1:op', environment: 'LOCAL_TEST' } as const;
  const two = specs.slice(0, 2);

  it('reads the employees once to plan, then again inside the write transaction of each account it creates', async () => {
    const { api, getEmployeesByCodes } = world([], 'absent');

    await api.create('org-1', two, 'a-password-of-12', attribution);

    // 1 read of everyone, then for each account: the judgment before the write and the answer after it.
    expect(getEmployeesByCodes).toHaveBeenCalledTimes(1 + two.length * 2);
    expect(getEmployeesByCodes.mock.calls.slice(1).map(([codes]) => codes)).toEqual([
      ['DS1-0'],
      ['DS1-0'],
      ['DS1-1'],
      ['DS1-1'],
    ]);
  });

  it('stops with DemoAccountsChangedError when the employee of an account is gone by the time it is written', async () => {
    const missing: string[] = [];
    const { api, getEmployeesByCodes } = world(missing, 'absent');
    const read = getEmployeesByCodes.getMockImplementation();
    getEmployeesByCodes.mockImplementation((codes) => {
      const answer = read?.(codes) as Promise<{ id: string; employeeCode: string; status: string }[]>;
      if (getEmployeesByCodes.mock.calls.length === 1) missing.push('DS1-0'); // after the plan was read
      return answer;
    });

    await expect(api.create('org-1', two, 'a-password-of-12', attribution)).rejects.toBeInstanceOf(
      DemoAccountsChangedError,
    );
  });
});
