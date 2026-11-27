import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CatalogPricingApi } from '../../catalog/public/catalog-pricing.api';
import type { LicensingSeatMonthApi } from '../../licensing/public/licensing-seat-month.api';
import type { SeatInForce, UnrequestedK1SeatInForce } from '../../licensing/public/licensing-seat-month.types';
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
    getUnrequestedK1SeatsInForceOn: jest
      .fn<Promise<UnrequestedK1SeatInForce[]>, [string, DbTx?]>()
      .mockResolvedValue([]),
  };
  const periods = {
    linesOfSubscriptions: jest.fn().mockResolvedValue(new Map()),
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
    periods as unknown as CatalogPricingApi,
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

    commitments.commitmentsOfRequestsInYear.mockImplementation((_ids: readonly string[], yr: number) =>
      Promise.resolve(
        yr === 2027
          ? new Map([
              ['req-grace', { state: 'HELD', costCenterId: CC_KT }],
              ['req-held', { state: 'HELD', costCenterId: CC_TK }],
            ])
          : new Map(),
      ),
    );

    poolRepo.subscriptionIdsWithRunsByMonth.mockImplementation((input: { from: string }) =>
      Promise.resolve(
        input.from.startsWith('2027')
          ? [
              { subscriptionId: 'sub-1', month: '2027-01-01' },
              { subscriptionId: 'sub-1', month: '2027-06-01' },
            ]
          : [],
      ),
    );

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
    // D-10 (Owner 25/11): next year (2028) counts all 3 active seats without 2028 commitment x 375.000 x 12 months = 13.500.000
    expect(result.get(2028)).toBe(13_500_000n);
  });

  it('FIX-B1 F7 (D-10): computes Y+1 (open 500k -> 6M, ending 31/03 Y+1 -> 1.5M) and returns 0 for past years', async () => {
    const { service, licensing, periods, organizationReads } = buildService();
    licensing.getSeatsInForceOn.mockResolvedValue([
      inForceSeat({ assignmentId: 'a-open', employeeId: 'emp-open', heldUntil: null }),
      inForceSeat({ assignmentId: 'a-mar', employeeId: 'emp-mar', heldUntil: '2028-04-01' }),
    ]);
    organizationReads.getOwningUnits.mockResolvedValue(
      new Map([
        ['emp-open', { departmentId: 'd-tk', costCenter: { id: CC_TK, code: 'TK', name: 'TK', status: 'ACTIVE' } }],
        ['emp-mar', { departmentId: 'd-kt', costCenter: { id: CC_KT, code: 'KT', name: 'KT', status: 'ACTIVE' } }],
      ]),
    );
    periods.getPurchaseFacts.mockResolvedValue([
      {
        subscriptionId: 'sub-1',
        status: 'ACTIVE',
        kind: 'TERM',
        provisioningType: 'K2',
        monthlyPriceMinor: 500_000n,
        startDate: '2027-01-01',
      },
    ]);

    const res = await service.ofCostCenterYears(CC_TK, [2026, 2028]);
    const ktNext = await service.ofYear(2028);

    expect(res.get(2026)).toBe(0n);
    expect(res.get(2028)).toBe(6_000_000n);
    expect(ktNext.get(CC_KT)).toBe(1_500_000n);
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

  it('K-A2 (D-17): includes unrequested K1 seats (500k on 20/07 => 3.000.000, on 01/12 => 500.000) and exposes NO_PRICE flag in ofYearWithFlags without changing ofYear', async () => {
    const { service, licensing, organizationReads } = buildService();
    licensing.getUnrequestedK1SeatsInForceOn.mockResolvedValue([
      {
        assignmentId: 'k1-a',
        planId: 'plan-k1',
        source: 'BASELINE',
        kind: 'PERSONAL',
        employeeId: 'emp-1',
        owningDepartmentId: null,
        heldFrom: '2027-01-01',
        heldUntil: null,
        billingAnchorOn: '2027-01-01',
        referenceMonthlyPriceMinor: 500_000n,
      },
      {
        assignmentId: 'k1-np',
        planId: 'plan-np',
        source: 'HANDOVER',
        kind: 'PERSONAL',
        employeeId: 'emp-2',
        owningDepartmentId: null,
        heldFrom: '2027-01-01',
        heldUntil: null,
        billingAnchorOn: null,
        referenceMonthlyPriceMinor: null,
      },
    ]);
    organizationReads.getOwningUnits.mockResolvedValue(
      new Map([
        ['emp-1', { departmentId: 'd-tk', costCenter: { id: CC_TK, code: 'TK', name: 'TK', status: 'ACTIVE' } }],
        ['emp-2', { departmentId: 'd-kt', costCenter: { id: CC_KT, code: 'KT', name: 'KT', status: 'ACTIVE' } }],
      ]),
    );

    const julRes = await service.ofYearWithFlags(2027, '2027-07-20');
    expect(julRes.totals.get(CC_TK)).toBe(3_000_000n);
    expect(julRes.totals.get(CC_KT) ?? 0n).toBe(0n);
    expect(julRes.flagsByCostCenter.get(CC_KT)).toEqual([
      { code: 'NO_PRICE', planId: 'plan-np', assignmentId: 'k1-np' },
    ]);

    const decTotals = await service.ofYear(2027, '2027-12-01');
    expect(decTotals.get(CC_TK)).toBe(500_000n);
  });

  it('FIX-W3 B-2: excludes seats of exceptRequestIds in ofYear', async () => {
    const { service, licensing, periods, organizationReads } = buildService();
    licensing.getSeatsInForceOn.mockResolvedValue([
      inForceSeat({ assignmentId: 'a-kept', source: 'REQUEST', requestId: 'req-kept', employeeId: 'emp-1' }),
      inForceSeat({ assignmentId: 'a-open', source: 'BASELINE', requestId: null, employeeId: 'emp-1' }),
    ]);
    organizationReads.getOwningUnits.mockResolvedValue(
      new Map([
        ['emp-1', { departmentId: 'd-tk', costCenter: { id: CC_TK, code: 'TK', name: 'TK', status: 'ACTIVE' } }],
      ]),
    );
    periods.getPurchaseFacts.mockResolvedValue([
      {
        subscriptionId: 'sub-1',
        status: 'ACTIVE',
        kind: 'TERM',
        provisioningType: 'K2',
        monthlyPriceMinor: 400_000n,
        startDate: '2027-01-01',
      },
    ]);

    const filtered = await service.ofYear(2028, '2027-11-15', undefined, { exceptRequestIds: ['req-kept'] });
    expect(filtered.get(CC_TK)).toBe(4_800_000n);
  });

  it('counts open mid-year seats from max(heldFrom, periodStartDate, yearStart) per SPEC W3-08 without placement clamping', async () => {
    const { service, licensing, periods, organizationReads } = buildService();
    licensing.getSeatsInForceOn.mockResolvedValue([
      inForceSeat({ assignmentId: 'a-k2', subscriptionId: 'sub-1', heldFrom: '2027-07-01', heldUntil: null }),
    ]);
    licensing.getUnrequestedK1SeatsInForceOn.mockResolvedValue([
      {
        assignmentId: 'a-k1',
        planId: 'plan-k1',
        source: 'BASELINE',
        employeeId: 'emp-1',
        kind: 'PERSONAL',
        owningDepartmentId: null,
        heldFrom: '2027-07-01',
        heldUntil: null,
        billingAnchorOn: null,
        referenceMonthlyPriceMinor: 300_000n,
      },
    ]);
    organizationReads.getOwningUnits.mockResolvedValue(
      new Map([
        ['emp-1', { departmentId: 'd-tk', costCenter: { id: CC_TK, code: 'TK', name: 'TK', status: 'ACTIVE' } }],
      ]),
    );
    periods.getPurchaseFacts.mockResolvedValue([
      {
        subscriptionId: 'sub-1',
        status: 'ACTIVE',
        kind: 'TERM',
        provisioningType: 'K2',
        monthlyPriceMinor: 500_000n,
        startDate: '2027-07-01',
      },
    ]);

    const totals = await service.ofYear(2027, '2027-11-26');
    // K2 counts un-run Jul..Dec (6 months); unrequested K1 counts Nov..Dec (2 months).
    expect(totals.get(CC_TK)).toBe(500_000n * 6n + 300_000n * 2n);
  });
});
