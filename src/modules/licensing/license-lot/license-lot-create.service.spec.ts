import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { LicenseLotApi } from '../../catalog/public/license-lot.api';
import type { CreateLicenseLotInput } from '../../catalog/public/license-lot.types';
import { LicenseKeyLotRequestNotOpenError } from '../license-key/license-key.errors';
import { ProvisioningNotInChargeError } from '../provisioning/provisioning.errors';
import type { ProvisioningTaskRepo } from '../provisioning/provisioning-task.repo';
import type { ProvisioningTaskFrame } from '../provisioning/provisioning-task-frame.service';
import { toLotCreateApiException } from './license-lot-create.controller';
import { LicenseLotCreateService } from './license-lot-create.service';

const actor = {
  appUserId: 'u-it',
  sessionId: 's-1',
  employeeId: 'emp-it',
  roles: ['IT_ADMIN'],
} as unknown as AuthenticatedPrincipal;
const base: CreateLicenseLotInput = {
  planId: 'plan-1',
  purchasedOn: '2026-11-25',
  licenseCount: 3,
  unitPrice: { amount: '12000000', currency: 'VND' },
  purpose: 'REPLACEMENT',
};

function setup(task: { status: string; planId: string } | null = null, inCharge = true) {
  const tx = { kind: 'tx' } as unknown as DbTx;
  const run = jest.fn((fn: (t: DbTx) => Promise<unknown>) => fn(tx));
  const createLot = jest.fn().mockResolvedValue({ id: 'lot-1' });
  const taskRecord = task
    ? { id: 'task-1', status: task.status, assignment: { planId: task.planId, employeeId: 'emp-ben' } }
    : null;
  const findGrantOf = jest.fn().mockResolvedValue(taskRecord);
  const lockGrantOf = jest.fn().mockResolvedValue(taskRecord);
  const requireActingItAdmin = jest.fn(() =>
    inCharge ? Promise.resolve({ bySubstitute: false }) : Promise.reject(new ProvisioningNotInChargeError()),
  );
  const service = new LicenseLotCreateService(
    { createLot } as unknown as LicenseLotApi,
    { findGrantOf, lockGrantOf } as unknown as ProvisioningTaskRepo,
    { requireActingItAdmin } as unknown as ProvisioningTaskFrame,
    { run } as unknown as TransactionRunner,
  );

  return { service, createLot, findGrantOf, lockGrantOf, requireActingItAdmin, tx, run };
}

describe('LicenseLotCreateService (a lot for a request is judged against its grant task)', () => {
  it('makes a lot of any other purpose with no look at the tasks, for any IT Admin', async () => {
    const { service, createLot, findGrantOf, lockGrantOf } = setup();

    await expect(service.create(actor, base)).resolves.toEqual({ id: 'lot-1' });

    expect(createLot).toHaveBeenCalledWith(actor, base);
    expect(findGrantOf).not.toHaveBeenCalled();
    expect(lockGrantOf).not.toHaveBeenCalled();
  });

  it('makes a lot for a request when its grant task is open for the plan and the caller acts for the beneficiary', async () => {
    const { service, createLot, lockGrantOf, requireActingItAdmin, tx } = setup({
      status: 'QUEUED',
      planId: 'plan-1',
    });
    const input = { ...base, purpose: 'REQUEST' as const, requestId: 'req-1' };

    await expect(service.create(actor, input)).resolves.toEqual({ id: 'lot-1' });

    expect(lockGrantOf).toHaveBeenCalledWith(tx, 'req-1');
    expect(requireActingItAdmin).toHaveBeenCalledWith(tx, actor, {
      beneficiaryEmployeeId: 'emp-ben',
      taskId: 'task-1',
    });
    expect(createLot).toHaveBeenCalledWith(actor, input, tx);
  });

  it.each([
    ['no grant task', null],
    ['a task that is over', { status: 'COMPLETED', planId: 'plan-1' }],
    ['a task for another plan', { status: 'QUEUED', planId: 'plan-2' }],
  ])('refuses a lot for a request with %s, and makes nothing', async (_name, task) => {
    const { service, createLot } = setup(task);

    const err = await service
      .create(actor, { ...base, purpose: 'REQUEST', requestId: 'req-1' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LicenseKeyLotRequestNotOpenError);
    const mapped = toLotCreateApiException(err);
    expect(mapped).toBeInstanceOf(ApiException);
    expect((mapped as ApiException).getResponse()).toMatchObject({ code: 'LICENSE_LOT.REQUEST_REQUIRED' });
    expect(createLot).not.toHaveBeenCalled();
  });

  it('refuses a caller who does not act for the department of the beneficiary, and makes nothing', async () => {
    const { service, createLot } = setup({ status: 'IN_PROGRESS', planId: 'plan-1' }, false);

    const err = await service
      .create(actor, { ...base, purpose: 'REQUEST', requestId: 'req-1' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProvisioningNotInChargeError);
    const mapped = toLotCreateApiException(err);
    expect(mapped).toBeInstanceOf(ApiException);
    expect((mapped as ApiException).getResponse()).toMatchObject({ code: 'LICENSE_LOT.NOT_IN_CHARGE' });
    expect(createLot).not.toHaveBeenCalled();
  });

  it('locks and validates REQUEST grant task inside the same TransactionRunner tx when runner is provided (FIX-W3 P20)', async () => {
    const tx = { kind: 'tx' } as unknown as DbTx;
    const createLot = jest.fn().mockResolvedValue({ id: 'lot-1' });
    const lockGrantOf = jest.fn().mockResolvedValue({
      id: 'task-1',
      status: 'IN_PROGRESS',
      assignment: { planId: 'plan-1', employeeId: 'emp-ben' },
    });
    const requireActingItAdmin = jest.fn().mockResolvedValue({ bySubstitute: false });
    const run = jest.fn().mockImplementation((fn: (t: DbTx) => Promise<unknown>) => fn(tx));
    const service = new LicenseLotCreateService(
      { createLot } as unknown as LicenseLotApi,
      { lockGrantOf, findGrantOf: jest.fn() } as unknown as ProvisioningTaskRepo,
      { requireActingItAdmin } as unknown as ProvisioningTaskFrame,
      { run } as unknown as TransactionRunner,
    );
    const input = { ...base, purpose: 'REQUEST' as const, requestId: 'req-1' };

    await expect(service.create(actor, input)).resolves.toEqual({ id: 'lot-1' });

    expect(run).toHaveBeenCalledTimes(1);
    expect(lockGrantOf).toHaveBeenCalledWith(tx, 'req-1');
    expect(requireActingItAdmin).toHaveBeenCalledWith(tx, actor, {
      beneficiaryEmployeeId: 'emp-ben',
      taskId: 'task-1',
    });
    expect(createLot).toHaveBeenCalledWith(actor, input, tx);
  });
});
