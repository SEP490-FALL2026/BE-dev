import { HttpStatus } from '@nestjs/common';
import type { DbTx } from '../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import { ParameterLockedError } from './operating-parameters.errors';
import { toOperatingParametersApiException } from './operating-parameters.http-errors';
import type { OperatingParametersRepo, ParameterRow } from './operating-parameters.repo';
import { ParameterChangeService } from './parameter-change.service';
import { OperatingParametersApi } from './public/operating-parameters.api';
import { ParameterLockContributions, type ParameterLockReader } from './public/operating-parameters.extension-points';

const KEY = 'FISCAL_YEAR_START_MONTH';
const TX = {} as DbTx;
const ACTOR = { appUserId: 'u1', roles: ['SUPER_ADMIN'], sessionId: 's1' } as unknown as AuthenticatedPrincipal;

function build(stored: number | null, readers: ParameterLockReader[]) {
  const rows: ParameterRow[] =
    stored === null ? [] : [{ key: KEY, value: stored, validFrom: new Date(0), validTo: null, changedBy: null }];
  const calls: string[] = [];
  const repo = {
    lockKey: () => Promise.resolve(void calls.push('lockKey')),
    holdKey: () => Promise.resolve(void calls.push('holdKey')),
    currentRows: () => Promise.resolve(rows),
    replaceCurrent: () => Promise.resolve(void calls.push('replaceCurrent')),
  } as unknown as OperatingParametersRepo;
  const audit = { record: () => Promise.resolve(void calls.push('audit')) };
  const organization = { getOrganization: () => Promise.resolve({ id: 'org' }) };
  const runner = { run: <T>(work: (tx: DbTx) => Promise<T>) => work(TX) };
  const locks = new ParameterLockContributions();
  for (const [index, reader] of readers.entries()) locks.add(`reader-${index}`, reader);
  const parameters = new OperatingParametersApi(repo, organization as never);
  const change = new ParameterChangeService(
    repo,
    parameters,
    organization as never,
    audit as never,
    runner as never,
    locks,
  );

  return { api: parameters, change, calls };
}

const reader = (key: string, answer: 'BUDGET_VERSION_EXISTS' | null, asked: string[]): ParameterLockReader => ({
  key,
  lockOf: () => {
    asked.push(key);

    return Promise.resolve(answer);
  },
});

describe('the lock of a parameter that something was made under', () => {
  it('refuses a change while a reader of the key says it is locked, and writes and records nothing', async () => {
    const asked: string[] = [];
    const { change, calls } = build(1, [reader(KEY, 'BUDGET_VERSION_EXISTS', asked)]);

    await expect(change.set(ACTOR, KEY, 4)).rejects.toEqual(new ParameterLockedError(KEY, 'BUDGET_VERSION_EXISTS'));

    expect(calls).toEqual(['lockKey']);
    expect(asked).toEqual([KEY]);
  });

  it('does not ask for the same value as now: nothing changes, so nothing can be locked', async () => {
    const asked: string[] = [];
    const { change, calls } = build(1, [reader(KEY, 'BUDGET_VERSION_EXISTS', asked)]);

    await change.set(ACTOR, KEY, 1);

    expect(asked).toEqual([]);
    expect(calls).toEqual(['lockKey']);
  });

  it('reads the default as the value now, so the default month again is no change either', async () => {
    const asked: string[] = [];
    const { change } = build(null, [reader(KEY, 'BUDGET_VERSION_EXISTS', asked)]);

    await change.set(ACTOR, KEY, 1);

    expect(asked).toEqual([]);
  });

  it('refuses an invalid value as invalid before it asks anyone', async () => {
    const asked: string[] = [];
    const { change } = build(1, [reader(KEY, 'BUDGET_VERSION_EXISTS', asked)]);

    await expect(change.set(ACTOR, KEY, 13)).rejects.toMatchObject({ name: 'ParameterValueInvalidError' });

    expect(asked).toEqual([]);
  });

  it('asks only the readers of the key being changed', async () => {
    const asked: string[] = [];
    const { change, calls } = build(1, [reader('SOME_OTHER_KEY', 'BUDGET_VERSION_EXISTS', asked)]);

    await change.set(ACTOR, KEY, 4);

    expect(asked).toEqual([]);
    expect(calls).toEqual(['lockKey', 'replaceCurrent', 'audit']);
  });

  it('changes the month when every reader of the key answers that it is free', async () => {
    const asked: string[] = [];
    const { change, calls } = build(1, [reader(KEY, null, asked), reader(KEY, null, asked)]);

    await change.set(ACTOR, KEY, 4);

    expect(asked).toEqual([KEY, KEY]);
    expect(calls).toEqual(['lockKey', 'replaceCurrent', 'audit']);
  });

  it('holds the value for a creation: the shared lock of the key, then the value in force', async () => {
    const { api, calls } = build(4, []);

    expect(await api.holdValue(TX, KEY)).toBe(4);
    expect(calls).toEqual(['holdKey']);
    await expect(api.holdValue(TX, 'NO_SUCH_PARAMETER')).rejects.toMatchObject({ name: 'ParameterNotFoundError' });
  });

  it('answers 409 PARAMETER.LOCKED with the key and the reason', () => {
    const answer = toOperatingParametersApiException(new ParameterLockedError(KEY, 'BUDGET_VERSION_EXISTS'));

    expect(answer).toMatchObject({
      status: HttpStatus.CONFLICT,
      response: { code: 'PARAMETER.LOCKED', details: { key: KEY, reason: 'BUDGET_VERSION_EXISTS' } },
    });
  });
});
