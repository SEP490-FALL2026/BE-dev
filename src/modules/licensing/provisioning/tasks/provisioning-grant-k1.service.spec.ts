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

describe('ProvisioningGrantWriter (P13a W3-17 Case 6: K1 annual transfer replacement)', () => {
  const tx = { kind: 'tx' };
  const actor = {
    appUserId: 'user-1',
    employeeId: 'admin-1',
    roles: ['IT_ADMIN'],
    sessionId: 'sess-1',
  } as unknown as AuthenticatedPrincipal;

  it('preserves original billingAnchorOn, personalCommitmentMonths=12, and expectedEndDate without rebuying', async () => {
    const createFromRequest = jest.fn(() => Promise.resolve({ id: 'asg-new' }));
    const insertAndClaim = jest.fn(() => Promise.resolve({ id: 'task-new' }));
    const k1TermsOfReplaced = jest.fn().mockResolvedValue({
      personalCommitmentMonths: 12,
      billingAnchorOn: '2026-11-05',
      expectedEndDate: '2027-11-04',
    });
    const writer = new ProvisioningGrantWriter(
      { insertAndClaim } as unknown as ProvisioningGrantTaskService,
      {
        lockPersonalEmployee: jest.fn(),
        requireActingItAdmin: jest.fn().mockResolvedValue({ bySubstitute: false }),
        personal: jest.fn().mockResolvedValue({ selfExecuted: null, kind: 'PERSONAL', employeeId: 'emp-1' }),
        service: jest.fn(),
      } as unknown as ProvisioningHolderService,
      { assertSeatTargetUsable: jest.fn(), createFromRequest } as unknown as AssignmentService,
      {
        lockSeatTarget: jest.fn().mockResolvedValue({
          kind: 'PLAN',
          subscriptionId: null,
          planId: 'plan-1',
          provisioningType: 'K1',
          keyBinding: null,
          referenceCommitmentMonths: 12,
        }),
      } as unknown as CatalogApi,
      {
        get: () => ({
          claimForGrant: jest.fn().mockResolvedValue({
            status: 'GRANTABLE',
            seat: 'PERSONAL',
            employeeId: 'emp-1',
            planId: 'plan-1',
            departmentId: 'dept-2',
            replacesAssignmentId: 'asg-old',
            expectedEndDate: '2027-11-04',
            termBound: true,
            termMonths: 12,
          }),
        }),
      } as unknown as GrantRequestGateHook,
      {
        chooseLine: jest.fn(),
        judgePurchase: jest.fn().mockResolvedValue({ decision: { purchased: false }, stock: null }),
      } as unknown as SharedPoolService,
      {
        lockLiveRevocation: jest.fn().mockResolvedValue(null),
        endReplacedRight: jest.fn().mockResolvedValue('asg-old'),
        k1TermsOfReplaced,
      } as unknown as ProvisioningReplacementService,
      { buyForItems: jest.fn() } as unknown as SeatLedgerApi,
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
          departmentId: 'dept-2',
          replacesAssignmentId: 'asg-old',
        },
        plan: { planId: 'plan-1', provisioningType: 'K1', keyBinding: null, referenceCommitmentMonths: 12 },
        serviceIdentifier: null,
        organization: { id: 'org-1' },
        today: '2027-03-20',
        inCharge: null,
        maxAttempts: 3,
        holderContractEnd: null,
        holderHasTerm: false,
      } as never,
    );

    expect(k1TermsOfReplaced).toHaveBeenCalledWith(tx, 'asg-old');
    expect(createFromRequest).toHaveBeenCalledWith(
      tx,
      actor,
      expect.objectContaining({
        personalCommitmentMonths: 12,
        billingAnchorOn: '2026-11-05',
        expectedEndDate: '2027-11-04',
        replacesAssignmentId: 'asg-old',
      }),
    );
    expect(insertAndClaim).toHaveBeenCalledWith(tx, actor, expect.objectContaining({ carriesOn: true }));
  });
});
