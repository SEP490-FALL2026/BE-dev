import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { ProvisioningTaskRecord } from '../provisioning-task.types';
import { ProvisioningService } from './provisioning.service';

const ACTOR = { appUserId: 'app-it', employeeId: 'e-it' } as AuthenticatedPrincipal;
const tx = { name: 'tx' } as unknown as DbTx;

type Action = {
  beforeLock?: (tx: DbTx, task: ProvisioningTaskRecord) => Promise<void>;
};

function claimWith(holders: { holdBeneficiaryOfTask: jest.Mock; requireCanBeginTask: jest.Mock }) {
  let captured: Action | undefined;
  const frame = {
    work: jest.fn((_actor: unknown, _id: string, action: Action) => {
      captured = action;

      return Promise.resolve({ id: 't-1' });
    }),
  };
  const views = { views: jest.fn().mockResolvedValue([{ id: 't-1' }]) };
  const service = new ProvisioningService(
    {} as never,
    frame as never,
    views as never,
    {} as never,
    {} as never,
    {} as never,
    holders as never,
  );

  return service.claim(ACTOR, 't-1').then(() => captured as Action);
}

describe('ProvisioningService.claim: what is held before the task is locked', () => {
  const holders = { holdBeneficiaryOfTask: jest.fn(), requireCanBeginTask: jest.fn() };
  const probe = (kind: string, status: string) =>
    ({ kind, status, assignment: { employeeId: 'e-beneficiary' } }) as unknown as ProvisioningTaskRecord;

  beforeEach(() => {
    jest.resetAllMocks();
    holders.holdBeneficiaryOfTask.mockResolvedValue(true);
  });

  it('holds the beneficiary of a queued grant before the task, so the claim and a departure that blocks the person take their locks in the same order', async () => {
    const action = await claimWith(holders);

    await action.beforeLock?.(tx, probe('GRANT', 'QUEUED'));

    expect(holders.holdBeneficiaryOfTask).toHaveBeenCalledWith(tx, 'e-beneficiary');
  });

  it.each([
    ['a grant already in progress', 'GRANT', 'IN_PROGRESS'],
    ['a revocation', 'REVOKE', 'QUEUED'],
  ])('holds nobody before the task for %s', async (_name, kind, status) => {
    const action = await claimWith(holders);

    await action.beforeLock?.(tx, probe(kind, status));

    expect(holders.holdBeneficiaryOfTask).not.toHaveBeenCalled();
  });
});
