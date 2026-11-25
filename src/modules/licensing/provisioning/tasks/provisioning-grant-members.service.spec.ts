import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { CatalogApi } from '../../../catalog/public/catalog.api';
import type { SeatLedgerApi } from '../../../catalog/public/seat-ledger.api';
import type { AssignmentService } from '../../assignment/assignment.service';
import type { GrantRequestGateHook } from '../../public/licensing.extension-points';
import type { SharedPoolService } from '../../shared-pool/shared-pool.service';
import type { ProvisioningGrantTaskService } from './provisioning-grant-task.service';
import { ProvisioningGrantWriter } from './provisioning-grant-writer.service';
import type { ProvisioningHolderService } from './provisioning-holder.service';
import type { ProvisioningReplacementService } from './provisioning-replacement.service';

describe('ProvisioningGrantWriter MEMBERS K2 grant (W3-19 Ca 7)', () => {
  const tx = { kind: 'tx' } as never;
  const actor = { appUserId: 'u-1', employeeId: 'admin-1', roles: ['IT_ADMIN'] } as unknown as AuthenticatedPrincipal;

  it.each([
    { name: 'no future REDUCE -> effectiveOn today (2026-11-20)', future: [], expectedDate: '2026-11-20' },
    {
      name: 'Ca 7 future MEMBER REDUCE on 2026-12-05 -> TOP_UP +1 on 2026-12-05 before assignment',
      future: [{ effectiveOn: '2026-12-05', reason: 'REDUCE' }],
      expectedDate: '2026-12-05',
    },
    {
      name: 'already compensated future REDUCE -> effectiveOn today (2026-11-20)',
      future: [
        { effectiveOn: '2026-12-05', reason: 'REDUCE' },
        { effectiveOn: '2026-12-05', reason: 'TOP_UP' },
      ],
      expectedDate: '2026-11-20',
    },
  ])('$name', async ({ future, expectedDate }) => {
    const order: string[] = [];
    const recordMember = jest.fn(() => {
      order.push('recordMember');
      return Promise.resolve({ id: 'chg-m1' });
    });
    const createFromRequest = jest.fn(() => {
      order.push('createFromRequest');
      return Promise.resolve({ id: 'asg-1' });
    });
    const writer = new ProvisioningGrantWriter(
      { insertAndClaim: jest.fn().mockResolvedValue({ id: 'task-1' }) } as unknown as ProvisioningGrantTaskService,
      {
        lockPersonalEmployee: jest.fn(),
        requireActingItAdmin: jest.fn().mockResolvedValue({ bySubstitute: false }),
        personal: jest.fn().mockResolvedValue({ selfExecuted: null }),
      } as unknown as ProvisioningHolderService,
      { assertSeatTargetUsable: jest.fn(), createFromRequest } as unknown as AssignmentService,
      {
        lockSeatTarget: jest.fn().mockResolvedValue({
          kind: 'SUBSCRIPTION',
          subscriptionId: 'sub-slack',
          subscriptionLineId: 'line-slack',
          planId: 'plan-1',
          provisioningType: 'K2',
          seatCounting: 'MEMBERS',
          purchasedQuantity: 1,
        }),
      } as unknown as CatalogApi,
      {
        get: () => ({
          claimForGrant: jest.fn().mockResolvedValue({
            status: 'GRANTABLE',
            seat: 'PERSONAL',
            employeeId: 'emp-1',
            planId: 'plan-1',
            departmentId: 'dept-1',
            replacesAssignmentId: null,
            expectedEndDate: null,
            termBound: false,
            termMonths: null,
          }),
        }),
      } as unknown as GrantRequestGateHook,
      {
        grantableOf: jest.fn().mockResolvedValue([{ subscriptionId: 'sub-slack' }]),
        judgePurchase: jest.fn(),
      } as unknown as SharedPoolService,
      {
        lockLiveRevocation: jest.fn().mockResolvedValue(null),
        endReplacedRight: jest.fn().mockResolvedValue(null),
      } as unknown as ProvisioningReplacementService,
      {
        futureMemberChanges: jest.fn().mockResolvedValue(future),
        recordMember,
      } as unknown as SeatLedgerApi,
    );

    await writer.write(
      tx,
      actor,
      { requestId: 'req-1', beneficiaryEmployeeId: 'emp-1', subscriptionId: 'sub-slack', purchase: false } as never,
      {
        answer: { seat: 'PERSONAL', employeeId: 'emp-1', planId: 'plan-1', departmentId: 'dept-1' },
        plan: { planId: 'plan-1', provisioningType: 'K2' },
        serviceIdentifier: null,
        organization: { id: 'org-1' },
        today: '2026-11-20',
        inCharge: null,
        maxAttempts: 3,
        holderContractEnd: null,
        holderHasTerm: false,
      } as never,
    );

    expect(recordMember).toHaveBeenCalledWith(
      tx,
      'line-slack',
      1,
      expectedDate,
      expect.objectContaining({ recordedByEmployeeId: 'admin-1', alreadyLocked: true }),
    );
    expect(order).toEqual(['recordMember', 'createFromRequest']);
  });
});
