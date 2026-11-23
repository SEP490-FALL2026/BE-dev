import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { CatalogApi } from '../../../catalog/public/catalog.api';
import type { AssignmentService } from '../../assignment/assignment.service';
import type { GrantRequestGateHook } from '../../public/licensing.extension-points';
import { GrantRequestRefusedError } from '../../public/licensing.errors';
import type { SharedPoolService } from '../../shared-pool/shared-pool.service';
import type { IdentityAccessApi } from '../../../identity-access/public/identity-access.api';
import type { RequestPartyEligibilityApi } from '../../../identity-access/public/request-party-eligibility.api';
import type { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { ProvisioningTaskFrame } from '../provisioning-task-frame.service';
import { ProvisioningGrantWriter } from './provisioning-grant-writer.service';
import type { ProvisioningGrantTaskService } from './provisioning-grant-task.service';
import { ProvisioningHolderService } from './provisioning-holder.service';
import type { ProvisioningReplacementService } from './provisioning-replacement.service';

describe('W1-08 lock order in ProvisioningGrantWriter and ProvisioningHolderService', () => {
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

    const writer = new ProvisioningGrantWriter(
      {
        insertAndClaim: jest.fn(() =>
          Promise.resolve({ id: 'task-1', channel: 'MANUAL', defaultResponsibleEmployeeId: null }),
        ),
      } as unknown as ProvisioningGrantTaskService,
      {
        lockPersonalEmployee,
        personal: jest.fn(() => Promise.resolve({ selfExecuted: null })),
      } as unknown as ProvisioningHolderService,
      {
        assertSeatTargetUsable: jest.fn(),
        createFromRequest: jest.fn(() => Promise.resolve({ id: 'asg-1' })),
      } as unknown as AssignmentService,
      {
        lockSeatTarget: jest.fn(() => Promise.resolve({ kind: 'PLAN', planId: 'plan-1', provisioningType: 'K5' })),
      } as unknown as CatalogApi,
      { get: () => ({ claimForGrant }) } as unknown as GrantRequestGateHook,
      {
        judgePurchase: jest.fn(() => Promise.resolve({ decision: { purchased: false }, stock: null })),
      } as unknown as SharedPoolService,
      {
        lockLiveRevocation: jest.fn(() => Promise.resolve(null)),
        endReplacedRight: jest.fn(() => Promise.resolve(null)),
      } as unknown as ProvisioningReplacementService,
    );

    await writer.write(
      tx as never,
      actor,
      {
        requestId: 'req-1',
        beneficiaryEmployeeId: 'emp-1',
        subscriptionId: undefined,
        accountIdentifier: undefined,
        responsibleEmployeeId: undefined,
        purchase: false,
      } as never,
      {
        answer: { seat: 'PERSONAL', employeeId: 'emp-1', planId: 'plan-1', departmentId: 'dept-1' },
        plan: { planId: 'plan-1', provisioningType: 'K5' },
        serviceIdentifier: null,
        organization: { id: 'org-1' },
        today: '2026-11-23',
        inCharge: null,
        maxAttempts: 3,
        holderContractEnd: null,
        holderHasTerm: false,
      } as never,
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

    const writer = new ProvisioningGrantWriter(
      {
        insertAndClaim: jest.fn(() =>
          Promise.resolve({ id: 'task-1', channel: 'MANUAL', defaultResponsibleEmployeeId: null }),
        ),
      } as unknown as ProvisioningGrantTaskService,
      {
        lockPersonalEmployee,
        service: jest.fn(() => Promise.resolve({ selfExecuted: null })),
      } as unknown as ProvisioningHolderService,
      {
        assertSeatTargetUsable: jest.fn(),
        createFromRequest: jest.fn(() => Promise.resolve({ id: 'asg-1' })),
      } as unknown as AssignmentService,
      {
        lockSeatTarget: jest.fn(() => Promise.resolve({ kind: 'PLAN', planId: 'plan-1', provisioningType: 'K5' })),
      } as unknown as CatalogApi,
      { get: () => ({ claimForGrant }) } as unknown as GrantRequestGateHook,
      {
        judgePurchase: jest.fn(() => Promise.resolve({ decision: { purchased: false }, stock: null })),
      } as unknown as SharedPoolService,
      {
        lockLiveRevocation: jest.fn(() => Promise.resolve(null)),
        endReplacedRight: jest.fn(() => Promise.resolve(null)),
      } as unknown as ProvisioningReplacementService,
    );

    await writer.write(
      tx as never,
      actor,
      {
        requestId: 'req-1',
        beneficiaryEmployeeId: 'emp-1',
        subscriptionId: undefined,
        accountIdentifier: undefined,
        responsibleEmployeeId: undefined,
        purchase: false,
      } as never,
      {
        answer: {
          seat: 'SERVICE',
          employeeId: 'emp-1',
          planId: 'plan-1',
          serviceAccount: { departmentId: 'dept-1', accountName: 'svc-1' },
        },
        plan: { planId: 'plan-1', provisioningType: 'K5' },
        serviceIdentifier: 'svc-1@corp.vn',
        organization: { id: 'org-1' },
        today: '2026-11-23',
        inCharge: null,
        maxAttempts: 3,
        holderContractEnd: null,
        holderHasTerm: false,
      } as never,
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

    const writer = new ProvisioningGrantWriter(
      {
        insertAndClaim: jest.fn(() =>
          Promise.resolve({ id: 'task-1', channel: 'MANUAL', defaultResponsibleEmployeeId: null }),
        ),
      } as unknown as ProvisioningGrantTaskService,
      {
        lockPersonalEmployee,
        personal: jest.fn(() => Promise.resolve({ selfExecuted: null })),
      } as unknown as ProvisioningHolderService,
      {
        assertSeatTargetUsable: jest.fn(),
        createFromRequest: jest.fn(() => Promise.resolve({ id: 'asg-1' })),
      } as unknown as AssignmentService,
      { lockSeatTarget } as unknown as CatalogApi,
      { get: () => ({ claimForGrant }) } as unknown as GrantRequestGateHook,
      {
        judgePurchase: jest.fn(() => Promise.resolve({ decision: { purchased: false }, stock: null })),
      } as unknown as SharedPoolService,
      {
        lockLiveRevocation,
        endReplacedRight,
      } as unknown as ProvisioningReplacementService,
    );

    await writer.write(
      tx as never,
      actor,
      {
        requestId: 'req-1',
        beneficiaryEmployeeId: 'emp-1',
        subscriptionId: undefined,
        accountIdentifier: undefined,
        responsibleEmployeeId: undefined,
        purchase: false,
      } as never,
      {
        answer: {
          seat: 'PERSONAL',
          employeeId: 'emp-1',
          planId: 'plan-1',
          departmentId: 'dept-1',
          replacesAssignmentId: 'asg-old',
        },
        plan: { planId: 'plan-1', provisioningType: 'K5' },
        serviceIdentifier: null,
        organization: { id: 'org-1' },
        today: '2026-11-23',
        inCharge: null,
        maxAttempts: 3,
        holderContractEnd: null,
        holderHasTerm: false,
      } as never,
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

    const writer = new ProvisioningGrantWriter(
      { insertAndClaim: jest.fn() } as unknown as ProvisioningGrantTaskService,
      { lockPersonalEmployee: jest.fn() } as unknown as ProvisioningHolderService,
      { assertSeatTargetUsable: jest.fn() } as unknown as AssignmentService,
      { lockSeatTarget: jest.fn() } as unknown as CatalogApi,
      { get: () => ({ claimForGrant }) } as unknown as GrantRequestGateHook,
      { judgePurchase: jest.fn() } as unknown as SharedPoolService,
      {
        lockLiveRevocation: jest.fn(() => Promise.resolve(null)),
        endReplacedRight: jest.fn(),
      } as unknown as ProvisioningReplacementService,
    );

    await expect(
      writer.write(
        tx as never,
        actor,
        { requestId: 'req-1', beneficiaryEmployeeId: 'emp-1', purchase: false } as never,
        {
          answer: {
            seat: 'PERSONAL',
            employeeId: 'emp-1',
            planId: 'plan-1',
            departmentId: 'dept-1',
            replacesAssignmentId: 'asg-old',
          },
          plan: { planId: 'plan-1', provisioningType: 'K5' },
          serviceIdentifier: null,
          organization: { id: 'org-1' },
          today: '2026-11-23',
          inCharge: null,
          maxAttempts: 3,
          holderContractEnd: null,
          holderHasTerm: false,
        } as never,
      ),
    ).rejects.toEqual(new GrantRequestRefusedError('NOT_APPROVED'));
  });
});
