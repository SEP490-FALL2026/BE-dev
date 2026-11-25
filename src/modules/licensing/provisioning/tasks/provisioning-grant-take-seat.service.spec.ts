import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
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

const tx = { kind: 'tx' } as unknown as DbTx;
const actor = {
  appUserId: 'user-1',
  employeeId: 'admin-1',
  roles: ['IT_ADMIN'],
  sessionId: 'sess-1',
} as unknown as AuthenticatedPrincipal;

function makeWriter(overrides: {
  provisioningType: 'K1' | 'K2';
  subscriptionLineId?: string | null;
  purchased?: boolean;
  replacesAssignmentId?: string | null;
}) {
  const buyForItems = jest.fn().mockResolvedValue({ purchase: { id: 'pur-1', code: 'MUA-000001' }, changes: [] });
  const incrementLegacyPoolSeat = jest.fn().mockResolvedValue(6);
  const lockSeatTarget = jest.fn().mockResolvedValue({
    kind: 'SUBSCRIPTION',
    subscriptionId: 'sub-1',
    subscriptionLineId: overrides.subscriptionLineId ?? null,
    planId: 'plan-1',
    provisioningType: overrides.provisioningType,
    keyBinding: null,
    applicationStatus: 'APPROVED',
    status: 'ACTIVE',
    missing: [],
    purchasedQuantity: 10,
    allowsMidTermReduction: false,
  });

  const writer = new ProvisioningGrantWriter(
    {
      insertAndClaim: jest.fn().mockResolvedValue({ id: 'task-1' }),
    } as unknown as ProvisioningGrantTaskService,
    {
      lockPersonalEmployee: jest.fn(),
      requireActingItAdmin: jest.fn().mockResolvedValue({ bySubstitute: false }),
      personal: jest.fn().mockResolvedValue({ selfExecuted: null, kind: 'PERSONAL', employeeId: 'emp-1' }),
      service: jest.fn(),
    } as unknown as ProvisioningHolderService,
    {
      assertSeatTargetUsable: jest.fn(),
      createFromRequest: jest.fn().mockResolvedValue({ id: 'asg-1' }),
    } as unknown as AssignmentService,
    {
      findSeatTarget: jest.fn().mockResolvedValue({ planId: 'plan-1', status: 'ACTIVE' }),
      lockSeatTarget,
      incrementLegacyPoolSeat,
    } as unknown as CatalogApi,
    {
      get: () => ({
        claimForGrant: jest.fn().mockResolvedValue({
          status: 'GRANTABLE',
          seat: 'PERSONAL',
          employeeId: 'emp-1',
          planId: 'plan-1',
          departmentId: 'dept-1',
          replacesAssignmentId: overrides.replacesAssignmentId ?? null,
          expectedEndDate: null,
          termBound: false,
          termMonths: null,
        }),
      }),
    } as unknown as GrantRequestGateHook,
    {
      chooseLine: jest.fn().mockResolvedValue('sub-1'),
      grantableOf: jest.fn().mockResolvedValue([{ subscriptionId: 'sub-1' }]),
      judgePurchase: jest.fn().mockResolvedValue({
        decision: overrides.purchased ? { purchased: true, kind: 'POOL_TOP_UP', reason: null } : { purchased: false },
        stock: { free: 0, inRevocation: 0, freeSubscriptionIds: [], freeBySubscription: new Map([['sub-1', 0]]) },
      }),
    } as unknown as SharedPoolService,
    {
      lockLiveRevocation: jest.fn().mockResolvedValue(null),
      endReplacedRight: jest.fn().mockResolvedValue(overrides.replacesAssignmentId ?? null),
    } as unknown as ProvisioningReplacementService,
    { buyForItems } as unknown as SeatLedgerApi,
  );

  return { writer, buyForItems, incrementLegacyPoolSeat, lockSeatTarget };
}

describe('ProvisioningGrantWriter.takeSeat (W3-18 K2 shortcut + K1 legacy)', () => {
  it('K2 purchase with subscriptionLineId calls SeatLedgerApi.buyForItems(tx, lineId, [item], today) and never incrementLegacyPoolSeat', async () => {
    const { writer, buyForItems, incrementLegacyPoolSeat, lockSeatTarget } = makeWriter({
      provisioningType: 'K2',
      subscriptionLineId: 'line-1',
      purchased: true,
    });

    await writer.write(tx, actor, { requestId: 'req-1', beneficiaryEmployeeId: 'emp-1', purchase: {} }, {
      answer: { seat: 'PERSONAL', employeeId: 'emp-1', planId: 'plan-1', departmentId: 'dept-1' },
      plan: { planId: 'plan-1', provisioningType: 'K2', keyBinding: null },
      serviceIdentifier: null,
      organization: { id: 'org-1' },
      today: '2026-11-21',
      inCharge: null,
      maxAttempts: 3,
      holderContractEnd: null,
      holderHasTerm: false,
    } as never);

    expect(lockSeatTarget).toHaveBeenCalledWith(tx, {
      subscriptionId: 'sub-1',
      planId: 'plan-1',
      servingOn: '2026-11-21',
    });
    expect(buyForItems).toHaveBeenCalledWith(
      tx,
      'line-1',
      [{ requestId: 'req-1', beneficiaryEmployeeId: 'emp-1' }],
      '2026-11-21',
      expect.objectContaining({ actor, alreadyLocked: true, today: '2026-11-21' }),
    );
    expect(incrementLegacyPoolSeat).not.toHaveBeenCalled();
  });

  it('K1 non-carry grant retains legacy seat increment without calling SeatLedgerApi.buyForItems', async () => {
    const { writer, buyForItems, incrementLegacyPoolSeat } = makeWriter({
      provisioningType: 'K1',
      purchased: false,
    });

    await writer.write(tx, actor, { requestId: 'req-1', beneficiaryEmployeeId: 'emp-1' }, {
      answer: { seat: 'PERSONAL', employeeId: 'emp-1', planId: 'plan-1', departmentId: 'dept-1' },
      plan: { planId: 'plan-1', provisioningType: 'K1', keyBinding: null },
      serviceIdentifier: null,
      organization: { id: 'org-1' },
      today: '2026-11-21',
      inCharge: null,
      maxAttempts: 3,
      holderContractEnd: null,
      holderHasTerm: false,
    } as never);

    expect(incrementLegacyPoolSeat).toHaveBeenCalledWith(tx, actor, 'sub-1', 'req-1');
    expect(buyForItems).not.toHaveBeenCalled();
  });
});
