import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { LockedPlan } from '../plan/plan-facts.service';
import type { CreateLicenseLotInput } from '../public/license-lot.types';
import { LicenseLotVendorAdminsRequiredError } from './license-lot.errors';
import { toLicenseLotApiException } from './license-lot.http-errors';
import { LicenseLotCreateService } from './license-lot-create.service';

const actor = {
  appUserId: 'u-it',
  sessionId: 's-1',
  employeeId: 'emp-it',
  roles: ['IT_ADMIN'],
} as unknown as AuthenticatedPrincipal;

const baseInput: CreateLicenseLotInput = {
  planId: 'plan-k4',
  purchasedOn: '2026-11-25',
  licenseCount: 3,
  unitPrice: { amount: '12000000', currency: 'VND' },
  purpose: 'REPLACEMENT',
  workspaceId: 'ws-1',
};

const makePlan = (hasAdminConsole: boolean): LockedPlan => ({
  id: 'plan-k4',
  name: 'JetBrains All Products',
  provisioningType: 'K4',
  keyBinding: 'ACCOUNT',
  pricingModel: 'PER_SEAT',
  sharingPolicy: null,
  hasAdminConsole,
  referenceCommitmentMonths: null,
  applicationId: 'app-1',
  applicationName: 'JetBrains',
  applicationKind: 'LICENSED',
  applicationStatus: 'APPROVED',
  applicationVendorId: 'vendor-1',
});

function setup(options: {
  hasAdminConsole: boolean;
  bound?: boolean;
  closed?: boolean;
  workingCount?: number;
  resolvedWorkspaceId?: string | null;
}) {
  const tx = { tag: 'tx' } as unknown as DbTx;
  const order: string[] = [];
  const plan = makePlan(options.hasAdminConsole);
  const insert = jest.fn().mockImplementation(() =>
    Promise.resolve({
      id: 'lot-1',
      organizationId: 'org-1',
      planId: plan.id,
      workspaceId: options.resolvedWorkspaceId ?? 'ws-1',
      purchasedOn: '2026-11-25',
      licenseCount: 3,
      unitPriceMinor: 12_000_000n,
      originalUnitPriceMinor: null,
      originalCurrency: null,
      invoiceActualMinor: null,
      purpose: 'REPLACEMENT',
      requestId: null,
      contractId: null,
      responsibleItAdminEmployeeId: actor.employeeId,
      legacySubscriptionId: null,
      note: null,
      createdAt: new Date('2026-11-25T00:00:00.000Z'),
      updatedAt: new Date('2026-11-25T00:00:00.000Z'),
    }),
  );
  const resolveAndLock = jest.fn().mockImplementation(() => {
    order.push('lockWorkspace:5b');

    return Promise.resolve(options.resolvedWorkspaceId === undefined ? 'ws-1' : options.resolvedWorkspaceId);
  });
  const workingAdminCount = jest.fn().mockResolvedValue(options.workingCount ?? 0);
  const lockShared = jest.fn().mockImplementation(() => {
    order.push('lockPlan:7');

    return Promise.resolve(plan);
  });
  const isClosed = jest.fn().mockResolvedValue(options.closed ?? true);
  const baselinePhase = {
    isBound: jest.fn().mockReturnValue(options.bound ?? true),
    get: jest.fn().mockImplementation(() => {
      if (options.bound === false) throw new Error("ExtensionPoint 'catalog.seat-baseline-phase' is not bound.");

      return { isClosed };
    }),
  };

  const service = new LicenseLotCreateService(
    { insert } as never,
    { lookups: jest.fn().mockResolvedValue([plan]), lockShared } as never,
    { resolveAndLock, workingAdminCount } as never,
    {
      readUnitPrice: jest.fn().mockResolvedValue({ amountMinor: 12_000_000n, currency: 'VND' }),
      readOriginal: jest.fn(),
    } as never,
    { getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }) } as never,
    { record: jest.fn().mockResolvedValue(undefined) } as never,
    { run: jest.fn((work: (tx: DbTx) => Promise<unknown>) => work(tx)) } as never,
    baselinePhase as never,
  );

  return { service, insert, resolveAndLock, workingAdminCount, lockShared, isClosed, baselinePhase, order };
}

describe('LicenseLotCreateService workspace >= 2 working admin gate (W3-12, W3-24)', () => {
  it.each([
    {
      label: 'hasAdminConsole=true, baseline closed, workingAdmins=2 -> allows creation',
      hasAdminConsole: true,
      bound: true,
      closed: true,
      workingCount: 2,
      allowed: true,
    },
    {
      label: 'hasAdminConsole=true, baseline closed, workingAdmins=1 -> 422 LICENSE_LOT.VENDOR_ADMINS_REQUIRED',
      hasAdminConsole: true,
      bound: true,
      closed: true,
      workingCount: 1,
      allowed: false,
    },
    {
      label: 'hasAdminConsole=true, baseline closed, workingAdmins=0 -> 422 LICENSE_LOT.VENDOR_ADMINS_REQUIRED',
      hasAdminConsole: true,
      bound: true,
      closed: true,
      workingCount: 0,
      allowed: false,
    },
    {
      label: 'hasAdminConsole=true, baseline open, workingAdmins=1 -> allows creation',
      hasAdminConsole: true,
      bound: true,
      closed: false,
      workingCount: 1,
      allowed: true,
    },
    {
      label: 'hasAdminConsole=false, baseline closed, workingAdmins=0 -> skips admin gate and allows creation',
      hasAdminConsole: false,
      bound: true,
      closed: true,
      workingCount: 0,
      allowed: true,
    },
  ])('$label', async ({ hasAdminConsole, bound, closed, workingCount, allowed }) => {
    const { service, insert } = setup({ hasAdminConsole, bound, closed, workingCount });

    if (allowed) {
      await expect(service.create(actor, baseInput)).resolves.toMatchObject({ id: 'lot-1' });
      expect(insert).toHaveBeenCalledTimes(1);
      return;
    }

    let thrown: unknown;
    try {
      await service.create(actor, baseInput);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(LicenseLotVendorAdminsRequiredError);
    expect(insert).not.toHaveBeenCalled();

    const httpError = toLicenseLotApiException(thrown) as ApiException;
    expect(httpError.getStatus()).toBe(422);
    expect(httpError.getResponse()).toMatchObject({
      code: 'LICENSE_LOT.VENDOR_ADMINS_REQUIRED',
      details: { planId: 'plan-k4', given: workingCount, required: 2 },
    });
  });

  it('H-6 / G-4: throws loudly when SeatBaselinePhaseHook is unbound', async () => {
    const { service, insert } = setup({ hasAdminConsole: true, bound: false, closed: false, workingCount: 1 });

    await expect(service.create(actor, baseInput)).rejects.toThrow('not bound');
    expect(insert).not.toHaveBeenCalled();
  });

  it('locks workspace (5b) before plan (7) and skips baseline/admin checks when hasAdminConsole=false', async () => {
    const { service, order, baselinePhase, workingAdminCount } = setup({
      hasAdminConsole: false,
      closed: true,
      workingCount: 0,
    });

    await service.create(actor, baseInput);

    expect(order).toEqual(['lockWorkspace:5b', 'lockPlan:7']);
    expect(baselinePhase.isBound).not.toHaveBeenCalled();
    expect(workingAdminCount).not.toHaveBeenCalled();
  });

  it('refuses with 422 LICENSE_LOT.VENDOR_ADMINS_REQUIRED if plan hasAdminConsole=true and workspaceId is null', async () => {
    const { service, insert, workingAdminCount } = setup({
      hasAdminConsole: true,
      bound: true,
      closed: true,
      resolvedWorkspaceId: null,
    });

    await expect(service.create(actor, { ...baseInput, workspaceId: undefined })).rejects.toBeInstanceOf(
      LicenseLotVendorAdminsRequiredError,
    );
    expect(workingAdminCount).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
