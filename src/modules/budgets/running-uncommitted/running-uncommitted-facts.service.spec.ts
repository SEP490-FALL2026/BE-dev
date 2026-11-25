import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import type { LicensingSeatMonthApi } from '../../licensing/public/licensing-seat-month.api';
import type { SeatInForce } from '../../licensing/public/licensing-seat-month.types';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { SharedPoolLineRepo } from '../shared-pool-line/shared-pool-line.repo';
import type { RunningUncommittedRepo } from './running-uncommitted.repo';
import { RunningUncommittedFactsService } from './running-uncommitted-facts.service';

const ORG_ID = 'org-1';
const CC_TK = 'cc-tk';
const CC_KT = 'cc-kt';

const inForceSeat = (over: Partial<SeatInForce> = {}): SeatInForce => ({
  assignmentId: 'asg-1',
  subscriptionId: 'sub-1',
  planId: 'plan-1',
  requestId: null,
  source: 'BASELINE',
  kind: 'PERSONAL',
  employeeId: 'emp-1',
  owningDepartmentId: null,
  heldFrom: '2027-01-01',
  heldUntil: null,
  ...over,
});

function buildService() {
  const licensing = {
    getSeatsInForceOn: jest.fn<Promise<SeatInForce[]>, [string, DbTx?]>().mockResolvedValue([]),
  };
  const periods = {
    getPurchaseFacts: jest.fn().mockResolvedValue([]),
  };
  const organizationReads = {
    businessToday: jest.fn().mockResolvedValue('2027-07-08'),
    getOrganization: jest
      .fn()
      .mockResolvedValue({ id: ORG_ID, reportingCurrency: 'VND', timeZone: 'Asia/Ho_Chi_Minh' }),
    getOwningUnits: jest.fn().mockResolvedValue(new Map()),
    getUnitCostCenterIds: jest.fn().mockResolvedValue(new Map()),
  };
  const commitments = {
    commitmentsOfRequestsInYear: jest.fn().mockResolvedValue(new Map()),
  };
  const poolRepo = {
    subscriptionIdsWithRunsByMonth: jest.fn().mockResolvedValue([]),
  };

  const service = new RunningUncommittedFactsService(
    licensing as unknown as LicensingSeatMonthApi,
    periods as unknown as SubscriptionPeriodApi,
    organizationReads as unknown as OrganizationReadApi,
    commitments as unknown as RunningUncommittedRepo,
    poolRepo as unknown as SharedPoolLineRepo,
  );

  return { service, licensing, periods, organizationReads, commitments, poolRepo };
}

describe('RunningUncommittedFactsService', () => {
  it('resolves personal holder Cost Centers, service owningDepartmentId Cost Centers, commitments, periods, and seat_month_runs inside tx', async () => {
    const { service, licensing, periods, organizationReads, commitments, poolRepo } = buildService();
    const tx = { tag: 'caller-tx' } as unknown as DbTx;

    licensing.getSeatsInForceOn.mockResolvedValue([
      inForceSeat({ assignmentId: 'a1', employeeId: 'emp-1', source: 'BASELINE', requestId: null }),
      inForceSeat({
        assignmentId: 'a2',
        kind: 'SERVICE',
        employeeId: 'emp-admin',
        owningDepartmentId: 'dept-svc',
        source: 'REQUEST',
        requestId: 'req-grace',
      }),
      inForceSeat({
        assignmentId: 'a3',
        employeeId: 'emp-2',
        source: 'REQUEST',
        requestId: 'req-held',
      }),
    ]);

    organizationReads.getOwningUnits.mockResolvedValue(
      new Map([
        ['emp-1', { departmentId: 'dept-1', costCenter: { id: CC_TK, code: 'TK', name: 'TK', status: 'ACTIVE' } }],
        ['emp-2', { departmentId: 'dept-1', costCenter: { id: CC_TK, code: 'TK', name: 'TK', status: 'ACTIVE' } }],
      ]),
    );
    organizationReads.getUnitCostCenterIds.mockResolvedValue(new Map([['dept-svc', CC_TK]]));

    periods.getPurchaseFacts.mockResolvedValue([
      {
        subscriptionId: 'sub-1',
        status: 'ACTIVE',
        kind: 'TERM',
        provisioningType: 'K2',
        monthlyPriceMinor: 375_000n,
        startDate: '2027-01-01',
      },
    ]);

    commitments.commitmentsOfRequestsInYear.mockResolvedValue(
      new Map([
        ['req-grace', { state: 'HELD', costCenterId: CC_KT }],
        ['req-held', { state: 'HELD', costCenterId: CC_TK }],
      ]),
    );

    poolRepo.subscriptionIdsWithRunsByMonth.mockResolvedValue([
      { subscriptionId: 'sub-1', month: '2027-01-01' },
      { subscriptionId: 'sub-1', month: '2027-06-01' },
    ]);

    const result = await service.ofCostCenterYears(CC_TK, [2027, 2028], tx);

    expect(licensing.getSeatsInForceOn).toHaveBeenCalledWith('2027-07-08', tx);
    expect(organizationReads.getOwningUnits).toHaveBeenCalledWith(['emp-1', 'emp-2'], '2027-07-08', tx);
    expect(organizationReads.getUnitCostCenterIds).toHaveBeenCalledWith(['dept-svc'], tx);
    expect(periods.getPurchaseFacts).toHaveBeenCalledWith(['sub-1'], tx);
    expect(commitments.commitmentsOfRequestsInYear).toHaveBeenCalledWith(['req-grace', 'req-held'], 2027, tx);
    expect(poolRepo.subscriptionIdsWithRunsByMonth).toHaveBeenCalledWith(
      { organizationId: ORG_ID, from: '2027-01-01', until: '2028-01-01' },
      tx,
    );
    // 2 counted seats (a1 baseline + a2 grace) x 375.000 x 10 un-run months (2,3,4,5,7,8,9,10,11,12) = 7.500.000
    expect(result.get(2027)).toBe(7_500_000n);
    expect(result.get(2028)).toBe(0n);
  });

  it('short-circuits without querying licensing or catalog when requested year is not current year', async () => {
    const { service, licensing, periods } = buildService();

    const result = await service.ofYear(2026);

    expect(result.size).toBe(0);
    expect(licensing.getSeatsInForceOn).not.toHaveBeenCalled();
    expect(periods.getPurchaseFacts).not.toHaveBeenCalled();
  });

  it('ignores non-ACTIVE or non-K2 periods', async () => {
    const { service, licensing, periods, organizationReads } = buildService();
    licensing.getSeatsInForceOn.mockResolvedValue([inForceSeat()]);
    organizationReads.getOwningUnits.mockResolvedValue(
      new Map([
        ['emp-1', { departmentId: 'dept-1', costCenter: { id: CC_TK, code: 'TK', name: 'TK', status: 'ACTIVE' } }],
      ]),
    );
    periods.getPurchaseFacts.mockResolvedValue([
      {
        subscriptionId: 'sub-1',
        status: 'DRAFT',
        kind: 'TERM',
        provisioningType: 'K2',
        monthlyPriceMinor: 375_000n,
        startDate: '2027-01-01',
      },
    ]);

    const result = await service.ofYear(2027);

    expect(result.size).toBe(0);
  });
});
