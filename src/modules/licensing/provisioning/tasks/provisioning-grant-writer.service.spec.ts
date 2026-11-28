import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { CatalogApi } from '../../../catalog/public/catalog.api';
import type { SeatLedgerApi } from '../../../catalog/public/seat-ledger.api';
import type { AssignmentService } from '../../assignment/assignment.service';
import type { GrantRequestGateHook } from '../../public/licensing.extension-points';
import { GrantRequestRefusedError, ProvisioningPlanBoundToDeviceError } from '../../public/licensing.errors';
import type { SharedPoolService } from '../../shared-pool/shared-pool.service';
import type { IdentityAccessApi } from '../../../identity-access/public/identity-access.api';
import type { RequestPartyEligibilityApi } from '../../../identity-access/public/request-party-eligibility.api';
import type { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { ProvisioningTaskFrame } from '../provisioning-task-frame.service';
import { ProvisioningNotInChargeError } from '../provisioning.errors';
import { ProvisioningGrantWriter } from './provisioning-grant-writer.service';
import type { ProvisioningGrantTaskService } from './provisioning-grant-task.service';
import { ProvisioningHolderService } from './provisioning-holder.service';
import type { ProvisioningReplacementService } from './provisioning-replacement.service';

interface WriterOverrides {
  insertAndClaim?: jest.Mock;
  lockPersonalEmployee?: jest.Mock;
  claimForGrant?: jest.Mock;
  lockSeatTarget?: jest.Mock;
  lockLiveRevocation?: jest.Mock;
  endReplacedRight?: jest.Mock;
  requireActingItAdmin?: jest.Mock;
  recordMember?: jest.Mock;
  futureMemberChanges?: jest.Mock;
  createFromRequest?: jest.Mock;
}

function makeWriter(overrides: WriterOverrides = {}) {
  const claimForGrant =
    overrides.claimForGrant ??
    jest.fn(() =>
      Promise.resolve({
        status: 'GRANTABLE' as const,
        seat: 'PERSONAL' as const,
        employeeId: 'emp-1',
        planId: 'plan-1',
        departmentId: 'dept-1',
        replacesAssignmentId: null,
        expectedEndDate: null,
        termBound: false,
        termMonths: null,
      }),
    );

  return new ProvisioningGrantWriter(
    {
      insertAndClaim:
        overrides.insertAndClaim ??
        jest.fn(() => Promise.resolve({ id: 'task-1', channel: 'MANUAL', defaultResponsibleEmployeeId: null })),
    } as unknown as ProvisioningGrantTaskService,
    {
      lockPersonalEmployee: overrides.lockPersonalEmployee ?? jest.fn(),
      requireActingItAdmin: overrides.requireActingItAdmin ?? jest.fn(() => Promise.resolve({ bySubstitute: false })),
      personal: jest.fn(() => Promise.resolve({ selfExecuted: null })),
      service: jest.fn(() => Promise.resolve({ selfExecuted: null })),
    } as unknown as ProvisioningHolderService,
    {
      assertSeatTargetUsable: jest.fn(),
      createFromRequest: overrides.createFromRequest ?? jest.fn(() => Promise.resolve({ id: 'asg-1' })),
    } as unknown as AssignmentService,
    {
      lockSeatTarget:
        overrides.lockSeatTarget ??
        jest.fn(() => Promise.resolve({ kind: 'PLAN', planId: 'plan-1', provisioningType: 'K5' })),
    } as unknown as CatalogApi,
    { get: () => ({ claimForGrant }) } as unknown as GrantRequestGateHook,
    {
      chooseLine: jest.fn(() => Promise.resolve('sub-1')),
      grantableOf: jest.fn(() => Promise.resolve([{ subscriptionId: 'sub-slack' }])),
      judgePurchase: jest.fn(() => Promise.resolve({ decision: { purchased: false }, stock: null })),
    } as unknown as SharedPoolService,
    {
      lockLiveRevocation: overrides.lockLiveRevocation ?? jest.fn(() => Promise.resolve(null)),
      endReplacedRight: overrides.endReplacedRight ?? jest.fn(() => Promise.resolve(null)),
      k1TermsOfReplaced: jest.fn(() => Promise.resolve(null)),
    } as unknown as ProvisioningReplacementService,
    {
      buyForItems: jest.fn(),
      recordMember: overrides.recordMember ?? jest.fn().mockResolvedValue({ id: 'chg-m1' }),
      futureMemberChanges: overrides.futureMemberChanges ?? jest.fn().mockResolvedValue([]),
    } as unknown as SeatLedgerApi,
  );
}

const baseInput = { requestId: 'req-1', beneficiaryEmployeeId: 'emp-1', purchase: false } as never;
const plannedOf = (answer: Record<string, unknown>, serviceIdentifier: string | null = null) =>
  ({
    answer,
    plan: { planId: 'plan-1', provisioningType: 'K5' },
    serviceIdentifier,
    organization: { id: 'org-1' },
    today: '2026-11-23',
    inCharge: null,
    maxAttempts: 3,
    holderContractEnd: null,
    holderHasTerm: false,
  }) as never;

describe('lock order in ProvisioningGrantWriter and ProvisioningHolderService', () => {
  const tx = { kind: 'tx' };
  const actor = {
    appUserId: 'user-1',
    employeeId: 'admin-1',
    roles: ['IT_ADMIN'],
  } as unknown as AuthenticatedPrincipal;

  beforeEach(() => jest.clearAllMocks());

  it('ProvisioningHolderService.lockPersonalEmployee locks the employee for share', async () => {
    const lockEmployeeForShare = jest.fn(() => Promise.resolve());
    const service = new ProvisioningHolderService(
      { lockEmployeeForShare } as unknown as OrganizationReadApi,
      {} as unknown as ProvisioningTaskFrame,
      {} as unknown as RequestPartyEligibilityApi,
      {} as unknown as IdentityAccessApi,
    );

    await service.lockPersonalEmployee(tx as never, 'emp-1');

    expect(lockEmployeeForShare).toHaveBeenCalledWith(tx, 'emp-1');
  });

  it('locks personal employee before claimForGrant when answer.seat is PERSONAL', async () => {
    const order: string[] = [];
    const lockPersonalEmployee = jest.fn(() => {
      order.push('lockPersonalEmployee');
      return Promise.resolve();
    });
    const claimForGrant = jest.fn(() => {
      order.push('claimForGrant');
      return Promise.resolve({
        status: 'GRANTABLE' as const,
        seat: 'PERSONAL' as const,
        employeeId: 'emp-1',
        planId: 'plan-1',
        departmentId: 'dept-1',
        replacesAssignmentId: null,
        expectedEndDate: null,
        termBound: false,
        termMonths: null,
      });
    });

    const writer = makeWriter({ lockPersonalEmployee, claimForGrant });
    await writer.write(
      tx as never,
      actor,
      baseInput,
      plannedOf({ seat: 'PERSONAL', employeeId: 'emp-1', planId: 'plan-1', departmentId: 'dept-1' }),
    );

    expect(lockPersonalEmployee).toHaveBeenCalledWith(tx, 'emp-1');
    expect(order).toEqual(['lockPersonalEmployee', 'claimForGrant']);
  });

  it('does not call lockPersonalEmployee when answer.seat is SERVICE', async () => {
    const lockPersonalEmployee = jest.fn();
    const claimForGrant = jest.fn(() =>
      Promise.resolve({
        status: 'GRANTABLE' as const,
        seat: 'SERVICE' as const,
        employeeId: 'emp-1',
        planId: 'plan-1',
        serviceAccount: { departmentId: 'dept-1', accountName: 'svc-1' },
        replacesAssignmentId: null,
        expectedEndDate: null,
        termBound: false,
        termMonths: null,
      }),
    );

    const writer = makeWriter({ lockPersonalEmployee, claimForGrant });
    await writer.write(
      tx as never,
      actor,
      baseInput,
      plannedOf(
        {
          seat: 'SERVICE',
          employeeId: 'emp-1',
          planId: 'plan-1',
          serviceAccount: { departmentId: 'dept-1', accountName: 'svc-1' },
        },
        'svc-1@corp.vn',
      ),
    );

    expect(lockPersonalEmployee).not.toHaveBeenCalled();
    expect(claimForGrant).toHaveBeenCalledWith(tx, 'req-1', 'emp-1');
  });

  it('locks live revocation after lockPersonalEmployee and BEFORE claimForGrant when replacesAssignmentId is present', async () => {
    const order: string[] = [];
    const lockedRev = { id: 'rev-1', status: 'QUEUED' };
    const lockPersonalEmployee = jest.fn(() => {
      order.push('lockPersonalEmployee');
      return Promise.resolve();
    });
    const lockLiveRevocation = jest.fn(() => {
      order.push('lockLiveRevocation');
      return Promise.resolve(lockedRev);
    });
    const claimForGrant = jest.fn(() => {
      order.push('claimForGrant');
      return Promise.resolve({
        status: 'GRANTABLE' as const,
        seat: 'PERSONAL' as const,
        employeeId: 'emp-1',
        planId: 'plan-1',
        departmentId: 'dept-1',
        replacesAssignmentId: 'asg-old',
        expectedEndDate: null,
        termBound: false,
        termMonths: null,
      });
    });
    const lockSeatTarget = jest.fn(() => {
      order.push('lockSeatTarget');
      return Promise.resolve({ kind: 'PLAN', planId: 'plan-1', provisioningType: 'K5' });
    });
    const endReplacedRight = jest.fn(() => {
      order.push('endReplacedRight');
      return Promise.resolve('asg-old');
    });

    const writer = makeWriter({
      lockPersonalEmployee,
      lockLiveRevocation,
      claimForGrant,
      lockSeatTarget,
      endReplacedRight,
    });
    await writer.write(
      tx as never,
      actor,
      baseInput,
      plannedOf({
        seat: 'PERSONAL',
        employeeId: 'emp-1',
        planId: 'plan-1',
        departmentId: 'dept-1',
        replacesAssignmentId: 'asg-old',
      }),
    );

    expect(lockLiveRevocation).toHaveBeenCalledWith(tx, 'asg-old');
    expect(order).toEqual([
      'lockPersonalEmployee',
      'lockLiveRevocation',
      'claimForGrant',
      'lockSeatTarget',
      'endReplacedRight',
    ]);
    expect(endReplacedRight).toHaveBeenCalledWith(
      tx,
      actor,
      expect.objectContaining({
        lockedRevocation: lockedRev,
        requestId: 'req-1',
        today: '2026-11-23',
        organizationId: 'org-1',
      }),
    );
  });

  it('refuses with NOT_APPROVED when claimed.replacesAssignmentId differs from answer.replacesAssignmentId', async () => {
    const claimForGrant = jest.fn(() =>
      Promise.resolve({
        status: 'GRANTABLE' as const,
        seat: 'PERSONAL' as const,
        employeeId: 'emp-1',
        planId: 'plan-1',
        departmentId: 'dept-1',
        replacesAssignmentId: 'asg-other',
        expectedEndDate: null,
        termBound: false,
        termMonths: null,
      }),
    );

    const writer = makeWriter({ claimForGrant });
    await expect(
      writer.write(
        tx as never,
        actor,
        baseInput,
        plannedOf({
          seat: 'PERSONAL',
          employeeId: 'emp-1',
          planId: 'plan-1',
          departmentId: 'dept-1',
          replacesAssignmentId: 'asg-old',
        }),
      ),
    ).rejects.toEqual(new GrantRequestRefusedError('NOT_APPROVED'));
  });

  it('checks requireActingItAdmin inside tx and forwards bySubstitute to insertAndClaim; refuses before claiming request when not in charge', async () => {
    const claimForGrant = jest.fn();
    const insertAndClaim = jest.fn(() => Promise.resolve({ id: 'task-1' }));
    const requireActingItAdmin = jest
      .fn()
      .mockRejectedValueOnce(new ProvisioningNotInChargeError())
      .mockResolvedValueOnce({ bySubstitute: true });

    const writer = makeWriter({ claimForGrant, insertAndClaim, requireActingItAdmin });
    const planned = plannedOf({ seat: 'PERSONAL', employeeId: 'emp-1', planId: 'plan-1', departmentId: 'dept-1' });

    await expect(writer.write(tx as never, actor, baseInput, planned)).rejects.toBeInstanceOf(
      ProvisioningNotInChargeError,
    );
    expect(claimForGrant).not.toHaveBeenCalled();

    claimForGrant.mockResolvedValue({
      status: 'GRANTABLE' as const,
      seat: 'PERSONAL' as const,
      employeeId: 'emp-1',
      planId: 'plan-1',
      departmentId: 'dept-1',
      replacesAssignmentId: null,
      expectedEndDate: null,
      termBound: false,
      termMonths: null,
    });

    await writer.write(tx as never, actor, baseInput, planned);

    expect(requireActingItAdmin).toHaveBeenCalledWith(
      tx,
      actor,
      expect.objectContaining({ beneficiaryEmployeeId: 'emp-1' }),
    );
    expect(insertAndClaim).toHaveBeenCalledWith(tx, actor, expect.objectContaining({ bySubstitute: true }));
  });

  it.each(['DEVICE_KEY', 'DEVICE_BUNDLED'] as const)(
    'refuses granting an old Request whose plan is now %s with ProvisioningPlanBoundToDeviceError (S-4)',
    async (keyBinding) => {
      const insertAndClaim = jest.fn();
      const writer = makeWriter({
        insertAndClaim,
        lockSeatTarget: jest.fn(() =>
          Promise.resolve({ kind: 'SUBSCRIPTION', planId: 'plan-1', provisioningType: 'K4', keyBinding }),
        ),
      });
      const planned = {
        answer: { seat: 'PERSONAL', employeeId: 'emp-1', planId: 'plan-1', departmentId: 'dept-1' },
        plan: { planId: 'plan-1', provisioningType: 'K4', keyBinding: 'ACCOUNT' },
        serviceIdentifier: null,
        organization: { id: 'org-1' },
        today: '2026-11-23',
        inCharge: null,
        maxAttempts: 3,
        holderContractEnd: null,
        holderHasTerm: false,
      } as never;

      await expect(writer.write(tx as never, actor, baseInput, planned)).rejects.toBeInstanceOf(
        ProvisioningPlanBoundToDeviceError,
      );
      expect(insertAndClaim).not.toHaveBeenCalled();
    },
  );
});
