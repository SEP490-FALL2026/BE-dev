import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { LockedPlan } from '../../plan/plan-facts.service';
import { SubscriptionVendorAdminsRequiredError } from '../subscription.errors';
import { SubscriptionPoolService } from './subscription-pool.service';

const tx = {} as unknown as DbTx;

/** The service with only the two facades a declaration reads the IT Admin through; everything else is a bare stand-in the test never reaches. */
function build(input: { applicationResponsible: string | null; usable: readonly string[] }) {
  const responsibleItAdminIdOf = jest.fn().mockResolvedValue(input.applicationResponsible);
  const findUsableItAdminEmployeeIds = jest.fn().mockResolvedValue(new Set(input.usable));
  const service = new SubscriptionPoolService(
    { findUsableItAdminEmployeeIds } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { responsibleItAdminIdOf } as never,
    {} as never,
  );

  return { service, responsibleItAdminIdOf, findUsableItAdminEmployeeIds };
}

describe('the IT Admin a subscription being declared answers to (QĐ-111g)', () => {
  it('is the one the declaration names, and reads nothing', async () => {
    const { service, responsibleItAdminIdOf, findUsableItAdminEmployeeIds } = build({
      applicationResponsible: 'it-app',
      usable: ['it-app'],
    });

    expect(await service.responsibleOfDeclaration(tx, 'plan-1', 'it-named')).toBe('it-named');
    expect(responsibleItAdminIdOf).not.toHaveBeenCalled();
    expect(findUsableItAdminEmployeeIds).not.toHaveBeenCalled();
  });

  it('is the IT Admin responsible for the application of the plan, read through the plan, while they are a usable IT Admin', async () => {
    const { service, responsibleItAdminIdOf, findUsableItAdminEmployeeIds } = build({
      applicationResponsible: 'it-app',
      usable: ['it-app'],
    });

    expect(await service.responsibleOfDeclaration(tx, 'plan-1', undefined)).toBe('it-app');
    expect(responsibleItAdminIdOf).toHaveBeenCalledWith('plan-1', tx);
    expect(findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-app'], tx);
  });

  it('is nobody when the one responsible for the application has left or lost the role', async () => {
    const { service } = build({ applicationResponsible: 'it-gone', usable: [] });

    expect(await service.responsibleOfDeclaration(tx, 'plan-1', undefined)).toBeNull();
  });

  it('is nobody, and does not ask who is usable, when the application names no IT Admin', async () => {
    const { service, findUsableItAdminEmployeeIds } = build({ applicationResponsible: null, usable: [] });

    expect(await service.responsibleOfDeclaration(tx, 'plan-1', undefined)).toBeNull();
    expect(findUsableItAdminEmployeeIds).not.toHaveBeenCalled();
  });
});

describe('SubscriptionPoolService.assertVendorAdmins and assertActivation', () => {
  const k2Plan: LockedPlan = {
    id: 'plan-k2',
    name: 'K2 Plan',
    applicationId: 'app-1',
    applicationName: 'App 1',
    applicationKind: 'SAAS',
    applicationStatus: 'APPROVED',
    provisioningType: 'K2',
    keyBinding: null,
    pricingModel: 'PER_SEAT',
    sharingPolicy: null,
    hasAdminConsole: false,
  };
  const k1Plan: LockedPlan = {
    ...k2Plan,
    id: 'plan-k1',
    provisioningType: 'K1',
  };

  function buildGate(input: {
    bound?: boolean;
    closed?: boolean;
    members?: Array<{ employeeId: string; role: 'OWNER' | 'ADMIN' }>;
    working?: string[];
    usableResponsible?: boolean;
  }) {
    const isClosed = jest.fn().mockResolvedValue(input.closed ?? true);
    const baselinePhase = {
      isBound: jest.fn().mockReturnValue(input.bound ?? true),
      get: jest.fn().mockReturnValue({ isClosed }),
    };
    const vendorAdminsOf = jest
      .fn()
      .mockResolvedValue(
        input.members
          ? new Map([['plan-k2', { members: input.members, ownerAccountEmail: null, adminNote: null }]])
          : new Map(),
      );
    const workingAdminsAmong = jest.fn().mockResolvedValue(new Set(input.working ?? []));
    const findUsableItAdminEmployeeIds = jest
      .fn()
      .mockResolvedValue(input.usableResponsible === false ? new Set() : new Set(['it-1']));
    const getEmployee = jest.fn().mockResolvedValue({ status: 'ACTIVE', workState: 'WORKING' });
    const service = new SubscriptionPoolService(
      { findUsableItAdminEmployeeIds } as never,
      { getEmployee } as never,
      {} as never,
      {} as never,
      baselinePhase as never,
      { vendorAdminsOf, workingAdminsAmong } as never,
      {} as never,
    );

    return { service, isClosed, baselinePhase, vendorAdminsOf, workingAdminsAmong };
  }

  it('skips the gate for a plan that needs no vendor admins', async () => {
    const { service, baselinePhase, vendorAdminsOf } = buildGate({ closed: true });

    await expect(service.assertVendorAdmins(tx, k1Plan, 'org-1')).resolves.toBeUndefined();
    expect(baselinePhase.isBound).not.toHaveBeenCalled();
    expect(vendorAdminsOf).not.toHaveBeenCalled();
  });

  it('lets a declaration through while the seat baseline phase is still open', async () => {
    const { service, isClosed, vendorAdminsOf } = buildGate({
      bound: true,
      closed: false,
      members: [
        { employeeId: 'it-1', role: 'OWNER' },
        { employeeId: 'it-gone', role: 'ADMIN' },
      ],
      working: ['it-1'],
    });

    await expect(service.assertVendorAdmins(tx, k2Plan, 'org-1')).resolves.toBeUndefined();
    expect(isClosed).toHaveBeenCalledWith(tx, 'org-1');
    expect(vendorAdminsOf).not.toHaveBeenCalled();
  });

  it('refuses when the baseline phase is closed and fewer than two recorded admins are still working', async () => {
    const { service, workingAdminsAmong } = buildGate({
      bound: true,
      closed: true,
      members: [
        { employeeId: 'it-1', role: 'OWNER' },
        { employeeId: 'it-gone', role: 'ADMIN' },
      ],
      working: ['it-1'],
    });

    await expect(service.assertVendorAdmins(tx, k2Plan, 'org-1')).rejects.toThrow(
      SubscriptionVendorAdminsRequiredError,
    );
    expect(workingAdminsAmong).toHaveBeenCalledWith(['it-1', 'it-gone'], tx);
  });

  it('deduplicates repeated member ids before checking working admins', async () => {
    const { service, workingAdminsAmong } = buildGate({
      bound: true,
      closed: true,
      members: [
        { employeeId: 'it-1', role: 'OWNER' },
        { employeeId: 'it-1', role: 'ADMIN' },
      ],
      working: ['it-1'],
    });

    await expect(service.assertVendorAdmins(tx, k2Plan, 'org-1')).rejects.toThrow(
      SubscriptionVendorAdminsRequiredError,
    );
    expect(workingAdminsAmong).toHaveBeenCalledWith(['it-1'], tx);
  });

  it('allows activation when the baseline phase is closed and two distinct admins are working', async () => {
    const { service } = buildGate({
      bound: true,
      closed: true,
      members: [
        { employeeId: 'it-1', role: 'OWNER' },
        { employeeId: 'it-2', role: 'ADMIN' },
      ],
      working: ['it-1', 'it-2'],
    });

    await expect(service.assertVendorAdmins(tx, k2Plan, 'org-1')).resolves.toBeUndefined();
  });

  it('fails closed when the baseline phase hook is not bound', async () => {
    const { service, isClosed } = buildGate({
      bound: false,
      members: [
        { employeeId: 'it-1', role: 'OWNER' },
        { employeeId: 'it-gone', role: 'ADMIN' },
      ],
      working: ['it-1'],
    });

    await expect(service.assertVendorAdmins(tx, k2Plan, 'org-1')).rejects.toThrow(
      SubscriptionVendorAdminsRequiredError,
    );
    expect(isClosed).not.toHaveBeenCalled();
  });

  it('checks vendor admins during assertActivation for a new subscription but skips for a renewal period', async () => {
    const state = {
      billingCycle: 'MONTHLY' as const,
      commitmentTermMonths: 1 as const,
      responsibleItAdminEmployeeId: 'it-1',
    };
    const closedShort = buildGate({
      bound: true,
      closed: true,
      members: [
        { employeeId: 'it-1', role: 'OWNER' },
        { employeeId: 'it-gone', role: 'ADMIN' },
      ],
      working: ['it-1'],
    });

    await expect(closedShort.service.assertActivation(tx, k2Plan, 'TERM', state, false, 'org-1')).rejects.toThrow(
      SubscriptionVendorAdminsRequiredError,
    );
    await expect(
      closedShort.service.assertActivation(tx, k2Plan, 'TERM', state, true, 'org-1'),
    ).resolves.toBeUndefined();
  });
});
