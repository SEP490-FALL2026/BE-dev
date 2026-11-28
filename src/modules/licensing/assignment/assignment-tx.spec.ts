import { Prisma } from '../../../generated/prisma/client';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { SeatLedgerApi } from '../../catalog/public/seat-ledger.api';
import type { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AssignmentConflictError, ProvisioningSubscriptionError } from '../public/licensing.errors';
import type { AssignmentCarryRepo } from './assignment-carry.repo';
import type { AssignmentDepartmentRepo } from './assignment-department.repo';
import { AssignmentRepo } from './assignment.repo';
import { AssignmentService } from './assignment.service';

describe('Assignment tx forwarding (pageHeldOfPlans)', () => {
  it('AssignmentService.pageHeldOfPlans forwards tx to businessToday and repo.pageHeldOfPlans', async () => {
    const tx = { name: 'tx' } as unknown as DbTx;
    const repo = {
      pageHeldOfPlans: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const organizationReads = {
      businessToday: jest.fn().mockResolvedValue('2026-11-23'),
    };
    const service = new AssignmentService(
      repo as unknown as AssignmentRepo,
      {} as never,
      organizationReads as unknown as OrganizationReadApi,
      {} as never,
      {} as AuditApi,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.pageHeldOfPlans('emp-1', ['plan-1'], { skip: 0, take: 1 }, tx);

    expect(organizationReads.businessToday).toHaveBeenCalledWith(expect.any(Date), tx);
    expect(repo.pageHeldOfPlans).toHaveBeenCalledWith('emp-1', ['plan-1'], '2026-11-23', 0, 1, tx);
  });

  it('AssignmentRepo.pageHeldOfPlans runs sequential findMany and count on tx without calling prisma.$transaction', async () => {
    const prisma = { $transaction: jest.fn() };
    const tx = {
      licenseAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const repo = new AssignmentRepo(prisma as unknown as PrismaService);

    const result = await repo.pageHeldOfPlans('emp-1', ['plan-1'], '2026-11-23', 0, 1, tx as unknown as DbTx);

    expect(result).toEqual({ items: [], total: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.licenseAssignment.findMany).toHaveBeenCalledTimes(1);
    expect(tx.licenseAssignment.count).toHaveBeenCalledTimes(1);
  });
});

const carryActor = {
  appUserId: 'user-1',
  employeeId: 'emp-nam',
  roles: ['IT_ADMIN'],
  sessionId: 'sess-1',
} as unknown as AuthenticatedPrincipal;

const carryRefusal = (state: string, originalMessage: string, constraint?: string) =>
  new Prisma.PrismaClientKnownRequestError(originalMessage, {
    code: 'P2010',
    clientVersion: 'test',
    meta: {
      driverAdapterError: {
        cause: {
          originalCode: state,
          originalMessage,
          message: originalMessage,
          ...(constraint ? { constraint } : {}),
        },
      },
    },
  });

describe('AssignmentService.carryOrBuy (Q-B next-period ledger purchase)', () => {
  it('buys +1 on next period line via SeatLedgerApi.buyForItems(nextPeriodStartDate) when next period has no free seats, then retries carry', async () => {
    const tx = { kind: 'tx' } as unknown as DbTx;
    const capacityError = carryRefusal('23514', 'The seats of the subscription are all taken');
    const carrying = {
      carryBehindSavepoint: jest.fn().mockResolvedValue(capacityError),
      carry: jest.fn().mockResolvedValue(1),
    };
    const lockSeatTarget = jest.fn().mockResolvedValue({
      kind: 'SUBSCRIPTION',
      subscriptionId: 'sub-next',
      subscriptionLineId: 'line-next',
      responsibleItAdminEmployeeId: 'emp-owner',
      planId: 'plan-1',
    });
    const buyForItems = jest.fn().mockResolvedValue({
      purchase: { id: 'pur-2', organizationId: 'org-1', code: 'MUA-000002', quantity: 1 },
      changes: [],
    });
    const notifySeatsBought = jest.fn().mockResolvedValue(1);

    const service = new AssignmentService(
      {
        insert: jest.fn().mockResolvedValue({
          id: 'asg-1',
          organizationId: 'org-1',
          source: 'REQUEST',
          kind: 'PERSONAL',
          planId: 'plan-1',
          subscriptionId: 'sub-old',
          employeeId: 'emp-minh',
          effectiveFrom: '2027-06-20',
          effectiveFromBasis: 'ACTUAL',
          validUntil: null,
          expectedEndDate: null,
          owningDepartmentId: 'dept-eng',
        }),
      } as unknown as AssignmentRepo,
      {} as unknown as AssignmentDepartmentRepo,
      {} as unknown as OrganizationReadApi,
      { lockSeatTarget } as unknown as CatalogApi,
      { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi,
      { buyForItems, notifySeatsBought } as unknown as SeatLedgerApi,
      {
        getPeriods: jest
          .fn()
          .mockResolvedValueOnce([
            { subscriptionId: 'sub-old', renewedById: 'sub-next', adjustment: { end: '2027-06-30' } },
          ])
          .mockResolvedValueOnce([{ subscriptionId: 'sub-next', status: 'ACTIVE', startDate: '2027-07-01' }]),
      } as unknown as SubscriptionPeriodApi,
      carrying as unknown as AssignmentCarryRepo,
    );

    await service.createFromRequest(tx, carryActor, {
      organizationId: 'org-1',
      requestId: 'req-minh',
      departmentId: 'dept-eng',
      target: {
        kind: 'SUBSCRIPTION',
        subscriptionId: 'sub-old',
        subscriptionLineId: 'line-old',
        planId: 'plan-1',
      } as never,
      holder: {
        kind: 'PERSONAL',
        employeeId: 'emp-minh',
        accountIdentifier: 'minh@acme.vn',
        reason: null,
        costCenterId: null,
        owningDepartmentId: null,
      },
      effectiveFrom: '2027-06-20',
      expectedEndDate: null,
    });

    expect(lockSeatTarget).toHaveBeenCalledWith(tx, {
      subscriptionId: 'sub-next',
      planId: 'plan-1',
      servingOn: '2027-07-01',
    });
    expect(buyForItems).toHaveBeenCalledWith(
      tx,
      'line-next',
      [{ requestId: 'req-minh', beneficiaryEmployeeId: 'emp-minh' }],
      '2027-07-01',
      expect.objectContaining({ actor: carryActor, alreadyLocked: true, checkClosedMonth: false }),
    );
    expect(notifySeatsBought).toHaveBeenCalledWith(tx, {
      organizationId: 'org-1',
      subscriptionId: 'sub-next',
      subscriptionLineId: 'line-next',
      seatPurchaseId: 'pur-2',
      quantity: 1,
      responsibleItAdminEmployeeId: 'emp-owner',
      actor: carryActor,
    });
    expect(carrying.carry).toHaveBeenCalledWith(tx, {
      assignmentIds: ['asg-1'],
      nextSubscriptionId: 'sub-next',
      startDate: '2027-07-01',
      actorAppUserId: 'user-1',
    });
  });

  it('rethrows non-capacity carry errors without calling SeatLedgerApi.buyForItems', async () => {
    const tx = { kind: 'tx' } as unknown as DbTx;
    const overlapError = carryRefusal('23P01', 'overlap', 'license_assignments_personal_no_overlap');
    const buyForItems = jest.fn();
    const service = new AssignmentService(
      {
        insert: jest.fn().mockResolvedValue({
          id: 'asg-1',
          organizationId: 'org-1',
          source: 'REQUEST',
          kind: 'PERSONAL',
          planId: 'plan-1',
          subscriptionId: 'sub-old',
          employeeId: 'emp-minh',
          effectiveFrom: '2027-06-20',
          effectiveFromBasis: 'ACTUAL',
          validUntil: null,
          expectedEndDate: null,
          owningDepartmentId: 'dept-eng',
        }),
      } as unknown as AssignmentRepo,
      {} as unknown as AssignmentDepartmentRepo,
      {} as unknown as OrganizationReadApi,
      { lockSeatTarget: jest.fn() } as unknown as CatalogApi,
      { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi,
      { buyForItems } as unknown as SeatLedgerApi,
      {
        getPeriods: jest
          .fn()
          .mockResolvedValueOnce([
            { subscriptionId: 'sub-old', renewedById: 'sub-next', adjustment: { end: '2027-06-30' } },
          ])
          .mockResolvedValueOnce([{ subscriptionId: 'sub-next', status: 'ACTIVE', startDate: '2027-07-01' }]),
      } as unknown as SubscriptionPeriodApi,
      { carryBehindSavepoint: jest.fn().mockResolvedValue(overlapError) } as unknown as AssignmentCarryRepo,
    );

    await expect(
      service.createFromRequest(tx, carryActor, {
        organizationId: 'org-1',
        requestId: 'req-minh',
        departmentId: 'dept-eng',
        target: { kind: 'SUBSCRIPTION', subscriptionId: 'sub-old', planId: 'plan-1' } as never,
        holder: {
          kind: 'PERSONAL',
          employeeId: 'emp-minh',
          accountIdentifier: 'minh@acme.vn',
          reason: null,
          costCenterId: null,
          owningDepartmentId: null,
        },
        effectiveFrom: '2027-06-20',
        expectedEndDate: null,
      }),
    ).rejects.toMatchObject({
      name: AssignmentConflictError.name,
      conflict: 'OVERLAP',
    });
    expect(buyForItems).not.toHaveBeenCalled();
  });

  it('F-6: throws ProvisioningSubscriptionError(NEXT_PERIOD_SEATS) when carrying lacks room and next period has no line', async () => {
    const tx = { kind: 'tx' } as unknown as DbTx;
    const noRoomError = carryRefusal('23514', 'The seats of the subscription are all taken');
    const buyForItems = jest.fn();
    const service = new AssignmentService(
      {
        insert: jest.fn().mockResolvedValue({
          id: 'asg-1',
          organizationId: 'org-1',
          source: 'REQUEST',
          kind: 'PERSONAL',
          planId: 'plan-1',
          subscriptionId: 'sub-old',
          employeeId: 'emp-minh',
          effectiveFrom: '2027-06-20',
          effectiveFromBasis: 'ACTUAL',
          validUntil: null,
          expectedEndDate: null,
          owningDepartmentId: 'dept-eng',
        }),
      } as unknown as AssignmentRepo,
      {} as unknown as AssignmentDepartmentRepo,
      {} as unknown as OrganizationReadApi,
      {
        lockSeatTarget: jest.fn().mockResolvedValue({
          kind: 'SUBSCRIPTION',
          subscriptionId: 'sub-next',
          subscriptionLineId: null,
          planId: 'plan-1',
        }),
      } as unknown as CatalogApi,
      { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi,
      { buyForItems } as unknown as SeatLedgerApi,
      {
        getPeriods: jest
          .fn()
          .mockResolvedValueOnce([
            { subscriptionId: 'sub-old', renewedById: 'sub-next', adjustment: { end: '2027-06-30' } },
          ])
          .mockResolvedValueOnce([{ subscriptionId: 'sub-next', status: 'ACTIVE', startDate: '2027-07-01' }]),
      } as unknown as SubscriptionPeriodApi,
      { carryBehindSavepoint: jest.fn().mockResolvedValue(noRoomError) } as unknown as AssignmentCarryRepo,
    );

    await expect(
      service.createFromRequest(tx, carryActor, {
        organizationId: 'org-1',
        requestId: 'req-minh',
        departmentId: 'dept-eng',
        target: { kind: 'SUBSCRIPTION', subscriptionId: 'sub-old', planId: 'plan-1' } as never,
        holder: {
          kind: 'PERSONAL',
          employeeId: 'emp-minh',
          accountIdentifier: 'minh@acme.vn',
          reason: null,
          costCenterId: null,
          owningDepartmentId: null,
        },
        effectiveFrom: '2027-06-20',
        expectedEndDate: null,
      }),
    ).rejects.toMatchObject({
      name: ProvisioningSubscriptionError.name,
      problem: 'NEXT_PERIOD_SEATS',
    });
    expect(buyForItems).not.toHaveBeenCalled();
  });
});

describe('AssignmentService.giveBackReplaced (the day an ended right is given back)', () => {
  it('records the day of the organization, not the UTC day: 01:00 in Vietnam is still yesterday in UTC', async () => {
    const record = jest.fn().mockResolvedValue(undefined);
    const service = new AssignmentService(
      { reopenReplacedBy: jest.fn().mockResolvedValue('reopened-id') } as never,
      {} as never,
      { businessToday: jest.fn().mockResolvedValue('2026-11-29') } as never,
      {} as never,
      { record } as unknown as AuditApi,
      {} as never,
      {} as never,
      {} as never,
    );
    // 2026-11-28T18:00:00Z is 01:00 on the 29th in Vietnam.
    const now = new Date('2026-11-28T18:00:00.000Z');
    const giveBack = (
      service as unknown as {
        giveBackReplaced: (
          tx: DbTx,
          actor: AuthenticatedPrincipal,
          assignmentId: string,
          input: { organizationId: string; assignmentId: string; requestId: string; now: Date },
          cause: 'GRANT_FAILED',
        ) => Promise<void>;
      }
    ).giveBackReplaced.bind(service);

    await giveBack(
      {} as DbTx,
      {} as AuthenticatedPrincipal,
      'assignment',
      { organizationId: 'org', assignmentId: 'assignment', requestId: 'request', now },
      'GRANT_FAILED',
    );

    expect(record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ before: { validUntil: '2026-11-29' } }),
    );
  });
});
