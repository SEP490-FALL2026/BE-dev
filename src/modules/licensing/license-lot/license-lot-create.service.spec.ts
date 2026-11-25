import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { LicenseLotApi } from '../../catalog/public/license-lot.api';
import type { CreateLicenseLotInput } from '../../catalog/public/license-lot.types';
import { LicenseKeyLotRequestNotOpenError } from '../license-key/license-key.errors';
import { ProvisioningNotInChargeError } from '../provisioning/provisioning.errors';
import type { ProvisioningTaskRepo } from '../provisioning/provisioning-task.repo';
import type { ProvisioningTaskFrame } from '../provisioning/provisioning-task-frame.service';
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
  const createLot = jest.fn().mockResolvedValue({ id: 'lot-1' });
  const findGrantOf = jest
    .fn()
    .mockResolvedValue(
      task ? { id: 'task-1', status: task.status, assignment: { planId: task.planId, employeeId: 'emp-ben' } } : null,
    );
  const requireActingItAdmin = jest.fn(() =>
    inCharge ? Promise.resolve({ bySubstitute: false }) : Promise.reject(new ProvisioningNotInChargeError()),
  );
  const service = new LicenseLotCreateService(
    { createLot } as unknown as LicenseLotApi,
    { findGrantOf } as unknown as ProvisioningTaskRepo,
    { requireActingItAdmin } as unknown as ProvisioningTaskFrame,
  );

  return { service, createLot, findGrantOf, requireActingItAdmin };
}

describe('LicenseLotCreateService (a lot for a request is judged against its grant task)', () => {
  it('makes a lot of any other purpose with no look at the tasks, for any IT Admin', async () => {
    const { service, createLot, findGrantOf } = setup();

    await expect(service.create(actor, base)).resolves.toEqual({ id: 'lot-1' });

    expect(createLot).toHaveBeenCalledWith(actor, base);
    expect(findGrantOf).not.toHaveBeenCalled();
  });

  it('makes a lot for a request when its grant task is open for the plan and the caller acts for the beneficiary', async () => {
    const { service, createLot, requireActingItAdmin } = setup({ status: 'QUEUED', planId: 'plan-1' });
    const input = { ...base, purpose: 'REQUEST' as const, requestId: 'req-1' };

    await expect(service.create(actor, input)).resolves.toEqual({ id: 'lot-1' });

    expect(requireActingItAdmin).toHaveBeenCalledWith(undefined, actor, {
      beneficiaryEmployeeId: 'emp-ben',
      taskId: 'task-1',
    });
    expect(createLot).toHaveBeenCalledWith(actor, input);
  });

  it.each([
    ['no grant task', null],
    ['a task that is over', { status: 'COMPLETED', planId: 'plan-1' }],
    ['a task for another plan', { status: 'QUEUED', planId: 'plan-2' }],
  ])('refuses a lot for a request with %s, and makes nothing', async (_name, task) => {
    const { service, createLot } = setup(task);

    await expect(service.create(actor, { ...base, purpose: 'REQUEST', requestId: 'req-1' })).rejects.toThrow(
      LicenseKeyLotRequestNotOpenError,
    );
    expect(createLot).not.toHaveBeenCalled();
  });

  it('refuses a caller who does not act for the department of the beneficiary, and makes nothing', async () => {
    const { service, createLot } = setup({ status: 'IN_PROGRESS', planId: 'plan-1' }, false);

    await expect(service.create(actor, { ...base, purpose: 'REQUEST', requestId: 'req-1' })).rejects.toThrow(
      ProvisioningNotInChargeError,
    );
    expect(createLot).not.toHaveBeenCalled();
  });
});
