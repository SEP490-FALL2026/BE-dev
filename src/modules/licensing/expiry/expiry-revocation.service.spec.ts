import { Logger } from '@nestjs/common';
import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { EmployeeNotStartedError } from '../../organization/public/organization.errors';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { RevocationService } from '../provisioning/revocation.service';
import type { RenewalHoldHook } from '../public/licensing.extension-points';
import { ExpiryRevocationService } from './expiry-revocation.service';
import type { ExpiryRevocationRepo } from './expiry-revocation.repo';

const NOW = new Date('2026-11-10T03:00:00Z');
const right = (assignmentId: string) => ({ assignmentId, expectedEndDate: '2026-11-01' });

function setup(failures: Record<string, Error> = {}) {
  const repo = {
    rightsToAsk: jest.fn().mockResolvedValue([right('a-1'), right('a-2')]),
  } as unknown as ExpiryRevocationRepo;
  const organizationReads = {
    businessToday: jest.fn().mockResolvedValue('2026-11-10'),
  } as unknown as OrganizationReadApi;
  const renewals = {
    get: () => ({ pendingRenewalsOf: jest.fn().mockResolvedValue(new Map()) }),
  } as unknown as RenewalHoldHook;
  const opened: string[] = [];
  const revocations = {
    open: jest.fn((_tx: unknown, _actor: unknown, input: { assignmentId: string }) => {
      const failure = failures[input.assignmentId];
      if (failure) return Promise.reject(failure);
      opened.push(input.assignmentId);

      return Promise.resolve({ created: true, reasonAdded: false });
    }),
  } as unknown as RevocationService;
  const runner = { run: (work: (tx: unknown) => unknown) => Promise.resolve(work({})) } as unknown as TransactionRunner;

  return { service: new ExpiryRevocationService(repo, organizationReads, renewals, revocations, runner), opened };
}

describe('ExpiryRevocationService.openDue', () => {
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('skips a right whose holder has not started working in a department, with one warning, and goes on with the others', async () => {
    const { service, opened } = setup({ 'a-1': new EmployeeNotStartedError('emp-future') });

    expect(await service.openDue(NOW)).toBe(1);

    expect(opened).toEqual(['a-2']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('a-1'));
    expect(error).not.toHaveBeenCalled();
  });

  it('warns once for that right however many hourly passes meet it, and never logs it as an error', async () => {
    const { service } = setup({ 'a-1': new EmployeeNotStartedError('emp-future') });

    await service.openDue(NOW);
    await service.openDue(new Date(NOW.getTime() + 3_600_000));
    await service.openDue(new Date(NOW.getTime() + 7_200_000));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it('still logs an unexpected failure as an error at every pass', async () => {
    const { service } = setup({ 'a-1': new Error('database is down') });

    expect(await service.openDue(NOW)).toBe(1);
    await service.openDue(NOW);

    expect(error).toHaveBeenCalledTimes(2);
    expect(warn).not.toHaveBeenCalled();
  });
});
