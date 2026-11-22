import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../../audit/public/audit.api';
import type { CatalogApi } from '../../../catalog/public/catalog.api';
import type { IdentityAccessApi } from '../../../identity-access/public/identity-access.api';
import type { RequestPartyEligibilityApi } from '../../../identity-access/public/request-party-eligibility.api';
import type { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { AssignmentService } from '../../assignment/assignment.service';
import type { GrantRequestGateHook } from '../../public/licensing.extension-points';
import type { SharedPoolService } from '../../shared-pool/shared-pool.service';
import type { ProvisioningTaskFrame } from '../provisioning-task-frame.service';
import type { ProvisioningTaskRepo } from '../provisioning-task.repo';
import { ProvisioningGrantWriter } from './provisioning-grant-writer.service';
import { ProvisioningHolderService } from './provisioning-holder.service';

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
        insert: jest.fn(() => Promise.resolve({ id: 'task-1', channel: 'MANUAL', defaultResponsibleEmployeeId: null })),
        markClaimed: jest.fn(),
        find: jest.fn(() => Promise.resolve(null)),
      } as unknown as ProvisioningTaskRepo,
      { claim: jest.fn(() => Promise.resolve({ id: 'task-1' })) } as unknown as ProvisioningTaskFrame,
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
      { record: jest.fn() } as unknown as AuditApi,
      { get: () => ({ claimForGrant }) } as unknown as GrantRequestGateHook,
      {
        judgePurchase: jest.fn(() => Promise.resolve({ decision: { purchased: false }, stock: null })),
      } as unknown as SharedPoolService,
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
        insert: jest.fn(() => Promise.resolve({ id: 'task-1', channel: 'MANUAL', defaultResponsibleEmployeeId: null })),
        markClaimed: jest.fn(),
        find: jest.fn(() => Promise.resolve(null)),
      } as unknown as ProvisioningTaskRepo,
      { claim: jest.fn(() => Promise.resolve({ id: 'task-1' })) } as unknown as ProvisioningTaskFrame,
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
      { record: jest.fn() } as unknown as AuditApi,
      { get: () => ({ claimForGrant }) } as unknown as GrantRequestGateHook,
      {
        judgePurchase: jest.fn(() => Promise.resolve({ decision: { purchased: false }, stock: null })),
      } as unknown as SharedPoolService,
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
});
