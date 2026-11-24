import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { ProvisioningNotInChargeError } from '../provisioning/provisioning.errors';
import type { RenewalHoldHook } from '../public/licensing.extension-points';
import type { ProvisioningTaskFrame } from '../provisioning/provisioning-task-frame.service';
import type { RevocationService } from '../provisioning/revocation.service';
import type { ExpiryQueueRepo, RightFacts } from './expiry-queue.repo';
import { ExpiryQueueService } from './expiry-queue.service';
import { toExpiryApiException } from './expiry.http-errors';

const TX = { marker: 'tx' } as unknown as DbTx;
const ACTOR: AuthenticatedPrincipal = {
  subject: 'user-it1',
  appUserId: 'user-it1',
  employeeId: 'emp-it1',
  roles: ['IT_ADMIN'],
  directRoles: ['IT_ADMIN'],
  sessionId: 'sess-1',
};

const EXPIRED_FACTS: RightFacts = {
  kind: 'PERSONAL',
  expectedEndDate: '2026-11-01',
  open: true,
  employeeId: 'emp-holder',
  revocation: null,
};

function makeService() {
  const factsOf = jest.fn<Promise<RightFacts | null>, [string, DbTx?]>();
  const repo = { factsOf } as unknown as ExpiryQueueRepo;
  const pendingRenewalsOf = jest.fn().mockResolvedValue(new Map());
  const renewals = { get: () => ({ pendingRenewalsOf }) } as unknown as RenewalHoldHook;
  const open = jest.fn().mockResolvedValue({
    taskId: 'task-1',
    status: 'PENDING',
    created: true,
    reasonAdded: true,
  });
  const revocations = { open } as unknown as RevocationService;
  const requireActingItAdmin = jest.fn().mockResolvedValue({ bySubstitute: false });
  const frame = { requireActingItAdmin } as unknown as ProvisioningTaskFrame;
  const organizationReads = {
    businessToday: jest.fn().mockResolvedValue('2026-11-24'),
  } as unknown as OrganizationReadApi;
  const catalog = {} as unknown as CatalogApi;
  const runner = {
    run: jest.fn((fn: (tx: DbTx) => Promise<unknown>) => fn(TX)),
  } as unknown as TransactionRunner;

  const service = new ExpiryQueueService(repo, renewals, revocations, frame, organizationReads, catalog, runner);

  return { service, factsOf, open, requireActingItAdmin, pendingRenewalsOf };
}

describe('ExpiryQueueService.startRevocation', () => {
  it('allows an acting IT Admin (in-charge or substitute) and re-checks under lock inside tx', async () => {
    const { service, factsOf, open, requireActingItAdmin } = makeService();
    factsOf.mockResolvedValue(EXPIRED_FACTS);

    const result = await service.startRevocation(ACTOR, 'assign-1');

    expect(result).toEqual({
      assignmentId: 'assign-1',
      taskId: 'task-1',
      taskStatus: 'PENDING',
      created: true,
      reasonAdded: true,
    });
    expect(open).toHaveBeenCalledTimes(1);
    expect(factsOf).toHaveBeenCalledWith('assign-1');
    expect(factsOf).toHaveBeenCalledWith('assign-1', TX);
    expect(requireActingItAdmin).toHaveBeenNthCalledWith(
      1,
      undefined,
      ACTOR,
      expect.objectContaining({ beneficiaryEmployeeId: 'emp-holder' }),
    );
    expect(requireActingItAdmin).toHaveBeenNthCalledWith(
      2,
      TX,
      ACTOR,
      expect.objectContaining({ beneficiaryEmployeeId: 'emp-holder' }),
    );
  });

  it('refuses an IT Admin who is neither in charge nor substitute with 403 PROVISIONING.NOT_IN_CHARGE', async () => {
    const { service, factsOf, open, requireActingItAdmin } = makeService();
    factsOf.mockResolvedValue(EXPIRED_FACTS);
    requireActingItAdmin.mockRejectedValueOnce(new ProvisioningNotInChargeError());

    let caught: unknown;
    try {
      await service.startRevocation(ACTOR, 'assign-1');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ProvisioningNotInChargeError);
    expect(open).not.toHaveBeenCalled();
    const mapped = toExpiryApiException(caught) as { getStatus: () => number; getResponse: () => { code: string } };
    expect(mapped.getStatus()).toBe(403);
    expect(mapped.getResponse().code).toBe('PROVISIONING.NOT_IN_CHARGE');
  });

  it('aborts the transaction with ProvisioningNotInChargeError when acting check fails on re-read after lock', async () => {
    const { service, factsOf, requireActingItAdmin } = makeService();
    factsOf.mockResolvedValue(EXPIRED_FACTS);
    requireActingItAdmin
      .mockResolvedValueOnce({ bySubstitute: true })
      .mockRejectedValueOnce(new ProvisioningNotInChargeError());

    await expect(service.startRevocation(ACTOR, 'assign-1')).rejects.toBeInstanceOf(ProvisioningNotInChargeError);
  });
});
